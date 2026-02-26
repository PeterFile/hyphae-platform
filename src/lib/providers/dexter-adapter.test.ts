import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkEndpoint } from "@/lib/availability-checker";

import { DexterAdapter } from "./dexter-adapter";

vi.mock("@/lib/availability-checker", () => ({
  checkEndpoint: vi.fn(),
}));

const mockedCheckEndpoint = vi.mocked(checkEndpoint);

function createApiResponse(resources: unknown[]) {
  return new Response(JSON.stringify({ ok: true, resources }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("DexterAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("search() maps Dexter marketplace data to unified agents", async () => {
    const resourceUrl = "https://x402.dexter.cash/api/jupiter/quote";
    const fetchMock = vi.fn().mockResolvedValue(
      createApiResponse([
        {
          resourceUrl,
          displayName: "Jupiter DEX Quote",
          description: "Real-time DEX quotes from Jupiter aggregator",
          category: "Tools",
          method: "GET",
          priceAtomic: "50000",
          priceUsdc: 0.05,
          priceAsset: "USDC",
          priceNetwork: "solana",
          totalSettlements: 123,
          qualityScore: 92,
          verificationStatus: "pass",
          lastVerifiedAt: "2026-02-24T17:49:35.121Z",
        },
      ])
    );

    const adapter = new DexterAdapter({ fetchFn: fetchMock });
    const results = await adapter.search("jupiter");
    const first = results[0];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(first.provider).toBe("dexter");
    if (first.provider !== "dexter") {
      throw new Error("Expected dexter provider");
    }
    expect(first.agent.id).toBe(`dexter:${encodeURIComponent(resourceUrl)}`);
    expect(first.agent.pricing.amountUsdcCents).toBe(5);
    expect(first.agent.metadata?.source).toBe("api");
    expect(first.agent.metadata?.rating).toBe(4.6);
  });

  it("getById() expects unified dexter id and returns matched agent", async () => {
    const primaryUrl = "https://x402.dexter.cash/api/jupiter/quote";
    const secondaryUrl = "https://x402.dexter.cash/api/tools/solscan/trending";
    const fetchMock = vi.fn().mockResolvedValue(
      createApiResponse([
        {
          resourceUrl: primaryUrl,
          displayName: "Primary",
          description: "Primary record",
          category: "Tools",
          method: "GET",
          priceAtomic: "50000",
          priceUsdc: 0.05,
          priceAsset: "USDC",
          priceNetwork: "solana",
          verificationStatus: "pass",
          lastVerifiedAt: "2026-02-24T17:49:35.121Z",
        },
        {
          resourceUrl: secondaryUrl,
          displayName: "Secondary",
          description: "Secondary record",
          category: "Data",
          method: "POST",
          priceAtomic: "100000",
          priceUsdc: 0.1,
          priceAsset: "USDC",
          priceNetwork: "solana",
          verificationStatus: "pass",
          lastVerifiedAt: "2026-02-24T17:49:35.121Z",
        },
      ])
    );

    const adapter = new DexterAdapter({ fetchFn: fetchMock });
    const hit = await adapter.getById(
      `dexter:${encodeURIComponent(secondaryUrl)}`
    );
    const miss = await adapter.getById(
      "https://x402.dexter.cash/api/tools/solscan/trending"
    );

    expect(hit?.provider).toBe("dexter");
    if (!hit || hit.provider !== "dexter") {
      throw new Error("Expected dexter provider result");
    }
    expect(hit.agent.name).toBe("Secondary");
    expect(miss).toBeNull();
  });

  it("falls back to mock data and marks metadata when API is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockRejectedValueOnce(new TypeError("still down"));

    const adapter = new DexterAdapter({
      fetchFn: fetchMock,
      now: () => new Date("2026-02-25T00:00:00.000Z"),
    });

    const results = await adapter.search("coming");
    const first = results[0];

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results.length).toBeGreaterThan(0);
    expect(first.provider).toBe("dexter");
    if (first.provider !== "dexter") {
      throw new Error("Expected dexter provider");
    }
    expect(first.agent.metadata?.source).toBe("mock-fallback");
    expect(first.agent.metadata?.comingSoon).toBe(true);
    expect(first.agent.metadata?.note).toContain("Coming Soon");
  });

  it("checkAvailability() delegates to availability checker and normalizes null status", async () => {
    mockedCheckEndpoint.mockResolvedValue({
      isOnline: false,
      latencyMs: 321,
      lastChecked: "2026-02-25T00:00:00.000Z",
      statusCode: null,
    });

    const adapter = new DexterAdapter();
    const result = await adapter.checkAvailability(
      "https://example.com/health"
    );

    expect(mockedCheckEndpoint).toHaveBeenCalledWith(
      "https://example.com/health"
    );
    expect(result).toEqual({
      isOnline: false,
      latencyMs: 321,
      lastChecked: "2026-02-25T00:00:00.000Z",
      statusCode: 0,
    });
  });
});
