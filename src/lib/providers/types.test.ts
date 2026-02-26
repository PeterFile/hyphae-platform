import { describe, expect, expectTypeOf, test } from "vitest";
import type { UnifiedAgent } from "@/lib/unified-schema";

import type {
  AvailabilityResult,
  ProviderAdapter,
  ProviderName,
  SearchFilters,
} from "./types";

describe("provider contracts", () => {
  test("SearchFilters matches agreed fields", () => {
    const filters: SearchFilters = {
      q: "search-term",
      provider: ["coinbase", "thirdweb"],
      category: "General",
      minPrice: 100,
      maxPrice: 500,
      sort: "availability",
      page: 1,
      pageSize: 20,
    };

    expectTypeOf(filters.provider).toEqualTypeOf<
      ProviderName | ProviderName[] | undefined
    >();
    expect(filters.page).toBe(1);
  });

  test("AvailabilityResult includes statusCode", () => {
    const result: AvailabilityResult = {
      isOnline: true,
      lastChecked: "2026-02-25T02:29:24Z",
      latencyMs: 123,
      statusCode: 200,
    };

    expect(result.statusCode).toBe(200);
  });

  test("ProviderAdapter exposes required methods", async () => {
    const unifiedAgent: UnifiedAgent = {
      id: "coinbase:cb-001",
      provider: "coinbase",
      originalId: "cb-001",
      name: "Coinbase Agent",
      description: "Provider adapter contract test",
      category: "General",
      tags: [],
      endpoint: {
        url: "https://example.com/agent",
        method: "GET",
      },
      pricing: {
        amountUsdcCents: 100,
        rawAmount: "1000000",
        rawAsset: "USDC",
        network: "base",
      },
      availability: {
        isOnline: true,
        lastChecked: "2026-02-25T02:29:24Z",
        latencyMs: 40,
        statusCode: 200,
      },
      metadata: undefined,
    };

    const adapter: ProviderAdapter = {
      name: "coinbase",
      search: async () => [unifiedAgent],
      getById: async () => unifiedAgent,
      checkAvailability: async () => ({
        isOnline: true,
        lastChecked: "2026-02-25T02:29:24Z",
        latencyMs: 40,
        statusCode: 200,
      }),
    };

    expectTypeOf(adapter.name).toEqualTypeOf<ProviderName>();
    expect((await adapter.getById("x"))?.id).toBe("coinbase:cb-001");
  });
});
