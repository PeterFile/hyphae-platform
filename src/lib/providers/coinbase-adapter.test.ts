import { describe, expect, it, vi } from "vitest";

import { UnifiedAgentSchema } from "@/lib/unified-schema";

import {
  CoinbaseAdapter,
  DEFAULT_COINBASE_FACILITATOR_URL,
  resolveCoinbaseFacilitatorUrl,
  type BazaarResource,
} from "./coinbase-adapter";

function createResource(
  overrides: Partial<BazaarResource> = {}
): BazaarResource {
  return {
    resource: "https://api.example.com/weather",
    type: "http",
    x402Version: 2,
    lastUpdated: "2026-02-25T10:00:00.000Z",
    metadata: {
      name: "Weather Agent",
      description: "Get weather forecast and humidity",
      category: "Weather",
      tags: ["forecast", "temperature"],
      rating: 4.6,
    },
    accepts: [
      {
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        maxAmountRequired: "250000",
        network: "base",
        description: "Returns humidity and pressure",
        extra: {
          name: "USD Coin",
        },
        outputSchema: {
          input: {
            method: "GET",
            type: "http",
          },
        },
      },
    ],
    ...overrides,
  };
}

describe("CoinbaseAdapter", () => {
  it("search() calls GET {facilitatorUrl}/discovery/resources and filters by resource URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          x402Version: 2,
          items: [
            createResource({
              resource: "https://api.example.com/weather",
            }),
            createResource({
              resource: "https://api.example.com/stocks",
              metadata: {
                name: "Stock Agent",
                description: "Stock prices",
              },
            }),
          ],
        }),
        { status: 200 }
      )
    );

    const adapter = new CoinbaseAdapter({
      facilitatorUrl: "https://api.cdp.coinbase.com/platform/v2/x402",
      fetchImpl: fetchMock,
    });

    const results = await adapter.search("stocks");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources"
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
    expect(results).toHaveLength(1);

    expect(results[0]?.originalId).toBe("https://api.example.com/stocks");
  });

  it("search() query matches metadata fields and accepts description", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            x402Version: 2,
            items: [createResource()],
          }),
          { status: 200 }
        )
      )
    );

    const adapter = new CoinbaseAdapter({
      facilitatorUrl: "https://api.cdp.coinbase.com/platform/v2/x402",
      fetchImpl: fetchMock,
    });

    const metadataHits = await adapter.search("weather");
    const acceptsHits = await adapter.search("pressure");

    expect(metadataHits).toHaveLength(1);
    expect(acceptsHits).toHaveLength(1);
  });

  it("getById() finds by resource URL (originalId)", async () => {
    const target = createResource({
      resource: "https://api.example.com/target",
    });
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            x402Version: 2,
            items: [createResource(), target],
          }),
          { status: 200 }
        )
      )
    );

    const adapter = new CoinbaseAdapter({
      facilitatorUrl: "https://api.cdp.coinbase.com/platform/v2/x402",
      fetchImpl: fetchMock,
    });

    const found = await adapter.getById("https://api.example.com/target");
    const missing = await adapter.getById("https://api.example.com/missing");

    expect(found).not.toBeNull();
    expect(missing).toBeNull();

    expect(found?.originalId).toBe("https://api.example.com/target");
  });

  it("checkAvailability() delegates to availability checker", async () => {
    const checker = vi.fn().mockResolvedValue({
      isOnline: true,
      lastChecked: "2026-02-25T10:00:00.000Z",
      latencyMs: 50,
      statusCode: 200,
    });

    const adapter = new CoinbaseAdapter({
      availabilityChecker: checker,
      fetchImpl: vi.fn(),
    });

    const result = await adapter.checkAvailability(
      "https://api.example.com/health"
    );

    expect(checker).toHaveBeenCalledWith("https://api.example.com/health");
    expect(result.statusCode).toBe(200);
  });

  it("normalize() maps BazaarResource to UnifiedAgent and converts pricing to USDC cents", () => {
    const adapter = new CoinbaseAdapter({
      fetchImpl: vi.fn(),
    });

    const normalized = adapter.normalize(createResource());
    const parsed = UnifiedAgentSchema.parse(normalized);

    expect(parsed.id).toBe("coinbase:https://api.example.com/weather");
    expect(parsed.originalId).toBe("https://api.example.com/weather");
    expect(parsed.provider).toBe("coinbase");
    expect(parsed.endpoint.url).toBe("https://api.example.com/weather");
    expect(parsed.endpoint.method).toBe("GET");
    expect(parsed.pricing.amountUsdcCents).toBe(25);
    expect(parsed.pricing.rawAmount).toBe("250000");
    expect(parsed.pricing.rawAsset).toBe("USDC");
    expect(parsed.pricing.network).toBe("base");
    expect(parsed.name).toBe("Weather Agent");
    expect(parsed.description).toContain("weather");
    expect(parsed.category).toBe("Weather");
    expect(parsed.tags).toEqual(["forecast", "temperature"]);
    expect(parsed.metadata?.registeredAt).toBe("2026-02-25T10:00:00.000Z");
    expect(parsed.metadata?.rating).toBe(4.6);
  });

  it("resolveCoinbaseFacilitatorUrl() uses env when provided", () => {
    expect(
      resolveCoinbaseFacilitatorUrl({
        COINBASE_FACILITATOR_URL: "https://custom.facilitator/x402/",
        NODE_ENV: "development",
      })
    ).toBe("https://custom.facilitator/x402");
  });

  it("resolveCoinbaseFacilitatorUrl() falls back in development", () => {
    expect(
      resolveCoinbaseFacilitatorUrl({
        NODE_ENV: "development",
      })
    ).toBe(DEFAULT_COINBASE_FACILITATOR_URL);
  });

  it("resolveCoinbaseFacilitatorUrl() falls back and warns in production", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const url = resolveCoinbaseFacilitatorUrl({
      NODE_ENV: "production",
    });

    expect(url).toBe(DEFAULT_COINBASE_FACILITATOR_URL);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
