import { describe, expect, expectTypeOf, test } from "vitest";

import type {
  AvailabilityResult,
  ProviderAdapter,
  ProviderAgent,
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
      sort: "price_asc",
      page: 1,
      pageSize: 20,
    };

    expectTypeOf(filters.provider).toEqualTypeOf<
      ProviderName | ProviderName[] | undefined
    >();
    expect(filters.page).toBe(1);
  });

  test("ProviderAgent is discriminated union", () => {
    const coinbaseAgent: ProviderAgent = {
      provider: "coinbase",
      agent: { id: "cb-001" },
    };

    const payaiAgent: ProviderAgent = {
      provider: "payai",
      agent: { id: "pa-001" },
    };

    expect(coinbaseAgent.provider).toBe("coinbase");
    expect(payaiAgent.provider).toBe("payai");
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
    const adapter: ProviderAdapter = {
      name: "coinbase",
      search: async () => [],
      getById: async () => null,
      checkAvailability: async () => ({
        isOnline: true,
        lastChecked: "2026-02-25T02:29:24Z",
        latencyMs: 40,
        statusCode: 200,
      }),
    };

    expectTypeOf(adapter.name).toEqualTypeOf<ProviderName>();
    expect(await adapter.getById("x")).toBeNull();
  });
});
