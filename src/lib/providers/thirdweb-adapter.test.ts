import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/availability-checker", () => ({
  checkEndpoint: vi.fn(),
}));

import { checkEndpoint } from "@/lib/availability-checker";

import { ThirdwebAdapter } from "./thirdweb-adapter";

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const PAY_TO = "0x1111111111111111111111111111111111111111";

function buildDiscoveryItem(index: number) {
  return {
    resource: `https://api.example.com/paid-api-${index}`,
    type: "http" as const,
    x402Version: 1,
    accepts: [
      {
        scheme: "exact" as const,
        network: "eip155:8453",
        maxAmountRequired: "10000",
        resource: `https://api.example.com/paid-api-${index}`,
        description: "Premium weather endpoint",
        mimeType: "application/json",
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        asset: BASE_USDC,
      },
    ],
    lastUpdated: "2026-02-25T12:00:00Z",
  };
}

function buildDiscoveryResponse(
  items = [buildDiscoveryItem(1)],
  pagination: { limit?: number; offset?: number; total?: number } = {}
) {
  return {
    x402Version: 1,
    items,
    pagination: {
      limit: pagination.limit ?? 20,
      offset: pagination.offset ?? 0,
      total: pagination.total ?? items.length,
    },
  };
}

function toRequestUrl(input: URL | RequestInfo): URL {
  if (typeof input === "string") {
    return new URL(input);
  }

  if (input instanceof URL) {
    return input;
  }

  return new URL(input.url);
}

describe("ThirdwebAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete process.env.THIRDWEB_SECRET_KEY;
  });

  it("searches discovery resources with x-client-id and expected query params", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(buildDiscoveryResponse()))
      );
    const adapter = new ThirdwebAdapter({
      secretKey: "sk_test_123",
      fetchFn: fetchMock,
    });

    const result = await adapter.search("weather", {
      page: 2,
      pageSize: 5,
      sort: "price_desc",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const parsedUrl = new URL(requestUrl);

    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      "https://api.thirdweb.com/v1/payments/x402/discovery/resources"
    );
    expect(parsedUrl.searchParams.get("limit")).toBe("5");
    expect(parsedUrl.searchParams.get("offset")).toBe("5");
    expect(parsedUrl.searchParams.get("query")).toBe("weather");
    expect(parsedUrl.searchParams.get("sortBy")).toBe("price");
    expect(parsedUrl.searchParams.get("sortOrder")).toBe("desc");

    const headers = new Headers(requestInit?.headers);
    expect(headers.get("x-client-id")).toBe("sk_test_123");

    expect(result).toHaveLength(1);
    expect(result[0]?.provider).toBe("thirdweb");
    expect(result[0]?.id).toMatch(/^thirdweb:/);

    const fullId = result[0]!.id;
    const originalId = fullId.replace("thirdweb:", "");
    expect(await adapter.getById(fullId)).toEqual(result[0]);
    expect(await adapter.getById(originalId)).toEqual(result[0]);
  });

  it("auto-paginates when page/pageSize are missing", async () => {
    const total = 45;
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const parsedUrl = toRequestUrl(input);
      const offset = Number(parsedUrl.searchParams.get("offset") ?? "0");
      const limit = Number(parsedUrl.searchParams.get("limit") ?? "20");
      const count = Math.max(0, Math.min(limit, total - offset));

      const items = Array.from({ length: count }, (_, itemIndex) =>
        buildDiscoveryItem(offset + itemIndex + 1)
      );

      return new Response(
        JSON.stringify(
          buildDiscoveryResponse(items, {
            limit,
            offset,
            total,
          })
        )
      );
    });
    const adapter = new ThirdwebAdapter({
      secretKey: "sk_test_123",
      fetchFn: fetchMock,
    });

    const result = await adapter.search("weather");

    expect(result).toHaveLength(45);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.map(([input]) =>
        toRequestUrl(input as URL | RequestInfo).searchParams.get("offset")
      )
    ).toEqual(["0", "20", "40"]);
  });

  it("caps auto-pagination to avoid unbounded fetches", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const parsedUrl = toRequestUrl(input);
      const offset = Number(parsedUrl.searchParams.get("offset") ?? "0");
      const limit = Number(parsedUrl.searchParams.get("limit") ?? "20");

      const items = Array.from({ length: limit }, (_, itemIndex) =>
        buildDiscoveryItem(offset + itemIndex + 1)
      );

      return new Response(
        JSON.stringify(
          buildDiscoveryResponse(items, {
            limit,
            offset,
            total: 10_000,
          })
        )
      );
    });
    const adapter = new ThirdwebAdapter({
      secretKey: "sk_test_123",
      fetchFn: fetchMock,
    });

    const result = await adapter.search("weather");

    expect(result).toHaveLength(200);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("getById() hydrates cache from discovery when cache is empty", async () => {
    const targetResource = {
      x402Version: 1,
      items: [
        {
          resource: "https://yddkctoq.nx.link/v1/wallets/%7Baddress%7D/tokens",
          type: "http" as const,
          x402Version: 1,
          accepts: [
            {
              scheme: "exact" as const,
              network: "eip155:8453",
              maxAmountRequired: "10000",
              resource:
                "https://yddkctoq.nx.link/v1/wallets/%7Baddress%7D/tokens",
              description: "Wallet token balances",
              mimeType: "application/json",
              payTo: PAY_TO,
              maxTimeoutSeconds: 60,
              asset: BASE_USDC,
            },
          ],
          lastUpdated: "2026-02-25T12:00:00Z",
        },
      ],
      pagination: {
        limit: 20,
        offset: 0,
        total: 1,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(targetResource)));
    const adapter = new ThirdwebAdapter({
      secretKey: "sk_test_123",
      fetchFn: fetchMock,
    });

    const found = await adapter.getById(
      "yddkctoq-nx-link-v1-wallets-7baddress-7d-tokens"
    );

    expect(found).not.toBeNull();
    expect(found?.provider).toBe("thirdweb");
    expect(found?.originalId).toBe(
      "yddkctoq-nx-link-v1-wallets-7baddress-7d-tokens"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes with defaults instead of dropping incomplete resources", () => {
    const adapter = new ThirdwebAdapter({ secretKey: "sk_test_123" });

    const unified = adapter.normalize(
      {
        resource: "not-a-url",
        type: "http",
        x402Version: 1,
        accepts: [],
        lastUpdated: "invalid-date",
      },
      0
    );

    expect(unified.provider).toBe("thirdweb");
    expect(unified.name).toBeTruthy();
    expect(unified.category).toBe("General");
    expect(unified.tags).toEqual([]);
    expect(unified.endpoint.method).toBe("GET");
    expect(unified.endpoint.url).toContain(
      "https://nexus.thirdweb.com/unknown/"
    );
    expect(unified.pricing.amountUsdcCents).toBe(0);
    expect(unified.availability.statusCode).toBe(0);
  });

  it("throws when secret key is missing so upstream can collect provider errors", async () => {
    const fetchMock = vi.fn();
    const adapter = new ThirdwebAdapter({ fetchFn: fetchMock });

    await expect(adapter.search("weather")).rejects.toThrow(
      "THIRDWEB_SECRET_KEY is missing"
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adapter.lastError).toContain("THIRDWEB_SECRET_KEY");
    expect(adapter.getErrors()).toHaveLength(1);
  });

  it("retries once on transient failure, then returns empty array and records error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("network request failed"));
    const adapter = new ThirdwebAdapter({
      secretKey: "sk_test_123",
      fetchFn: fetchMock,
    });

    const result = await adapter.search("weather");

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(adapter.getErrors()).toHaveLength(1);
    expect(adapter.lastError).toContain("request failed");
  });

  it("returns empty array and records error on non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("upstream error", { status: 500 }));
    const adapter = new ThirdwebAdapter({
      secretKey: "sk_test_123",
      fetchFn: fetchMock,
    });

    const result = await adapter.search("weather");

    expect(result).toEqual([]);
    expect(adapter.getErrors()).toHaveLength(1);
    expect(adapter.lastError).toContain("500");
  });

  it("delegates endpoint health checks to availability-checker", async () => {
    const checkEndpointMock = vi.mocked(checkEndpoint);
    checkEndpointMock.mockResolvedValue({
      isOnline: false,
      latencyMs: 22,
      lastChecked: "2026-02-25T12:00:00Z",
      statusCode: null,
    });

    const adapter = new ThirdwebAdapter({ secretKey: "sk_test_123" });
    const result = await adapter.checkAvailability("https://api.example.com");

    expect(checkEndpointMock).toHaveBeenCalledWith("https://api.example.com");
    expect(result).toEqual({
      isOnline: false,
      latencyMs: 22,
      lastChecked: "2026-02-25T12:00:00Z",
      statusCode: 0,
    });
  });
});
