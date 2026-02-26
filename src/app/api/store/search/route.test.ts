import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UnifiedAgent } from "@/lib/unified-schema";

import { GET } from "./route";
import {
  __resetSearchRouteStateForTests,
  __setRegistryFactoryForTests,
} from "./handler";

function createAgent(id: string): UnifiedAgent {
  return {
    id,
    provider: "coinbase",
    originalId: id.replace("coinbase:", ""),
    name: id,
    description: "test agent",
    category: "General",
    tags: [],
    endpoint: {
      url: "https://example.com/agent",
      method: "GET",
    },
    pricing: {
      amountUsdcCents: 100,
      rawAmount: "100",
      rawAsset: "USDC",
      network: "base",
    },
    availability: {
      isOnline: true,
      lastChecked: "2026-02-26T00:00:00.000Z",
      statusCode: 200,
    },
  };
}

function createRequest(query: string): Request {
  return new Request(`http://localhost/api/store/search${query}`);
}

describe("GET /api/store/search", () => {
  beforeEach(() => {
    __resetSearchRouteStateForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    __resetSearchRouteStateForTests();
    vi.useRealTimers();
  });

  it("returns 422 when pageSize is out of range", async () => {
    const response = await GET(createRequest("?pageSize=101"));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toBe("Invalid query parameters");
  });

  it("returns 422 when provider contains unknown value", async () => {
    const response = await GET(createRequest("?provider=unknown"));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toBe("Invalid query parameters");
  });

  it("treats blank q as empty query string", async () => {
    const searchAll = vi.fn().mockResolvedValue({
      results: [createAgent("coinbase:a1")],
      errors: [],
    });

    __setRegistryFactoryForTests(() => ({
      searchAll,
    }));

    const response = await GET(createRequest("?q=%20%20%20"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(searchAll).toHaveBeenCalledWith("", {});
    expect(payload.results).toHaveLength(1);
  });

  it("returns paginated response with totalCount/page/pageSize", async () => {
    const searchAll = vi.fn().mockResolvedValue({
      results: [
        createAgent("coinbase:a1"),
        createAgent("coinbase:a2"),
        createAgent("coinbase:a3"),
      ],
      errors: [],
    });

    __setRegistryFactoryForTests(() => ({
      searchAll,
    }));

    const response = await GET(createRequest("?page=2&pageSize=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      results: [expect.objectContaining({ id: "coinbase:a2" })],
      totalCount: 3,
      page: 2,
      pageSize: 1,
      errors: [],
    });
  });

  it("returns 200 with errors field when partial upstream failures happen", async () => {
    const searchAll = vi.fn().mockResolvedValue({
      results: [createAgent("coinbase:a1")],
      errors: [
        {
          provider: "thirdweb",
          type: "timeout",
          message: "thirdweb timeout",
        },
      ],
    });

    __setRegistryFactoryForTests(() => ({
      searchAll,
    }));

    const response = await GET(createRequest("?q=weather"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.errors).toHaveLength(1);
    expect(payload.results).toHaveLength(1);
  });

  it("returns 500 when all upstream providers fail", async () => {
    const searchAll = vi.fn().mockResolvedValue({
      results: [],
      errors: [
        {
          provider: "coinbase",
          type: "adapter_error",
          message: "network down",
        },
      ],
    });

    __setRegistryFactoryForTests(() => ({
      searchAll,
    }));

    const response = await GET(createRequest("?q=weather"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("All upstream providers failed");
    expect(payload.errors).toHaveLength(1);
  });

  it("caches identical query for 60s while allowing different pages", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-26T00:00:00.000Z"));

    const searchAll = vi.fn().mockResolvedValue({
      results: [
        createAgent("coinbase:a1"),
        createAgent("coinbase:a2"),
        createAgent("coinbase:a3"),
      ],
      errors: [],
    });

    __setRegistryFactoryForTests(() => ({
      searchAll,
    }));

    const firstResponse = await GET(
      createRequest("?q=weather&provider=thirdweb,coinbase&page=1&pageSize=1")
    );
    const secondResponse = await GET(
      createRequest("?q=weather&provider=coinbase,thirdweb&page=2&pageSize=1")
    );
    const firstPayload = await firstResponse.json();
    const secondPayload = await secondResponse.json();

    expect(searchAll).toHaveBeenCalledTimes(1);
    expect(firstPayload.results[0].id).toBe("coinbase:a1");
    expect(secondPayload.results[0].id).toBe("coinbase:a2");

    vi.setSystemTime(new Date("2026-02-26T00:01:01.000Z"));
    await GET(
      createRequest("?q=weather&provider=coinbase,thirdweb&page=1&pageSize=1")
    );
    expect(searchAll).toHaveBeenCalledTimes(2);
  });
});
