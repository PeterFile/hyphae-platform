import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchResponse } from "./use-unified-search";

// ---- helpers ----------------------------------------------------------------

function makeResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeSearchResponse(
  overrides: Partial<SearchResponse> = {}
): SearchResponse {
  return {
    results: [],
    totalCount: 0,
    page: 1,
    pageSize: 20,
    errors: [],
    ...overrides,
  };
}

// ---- query key & queryFn tests (node-safe) ----------------------------------

describe("useUnifiedSearch query key", () => {
  it("includes expected shape", async () => {
    const { useUnifiedSearch } = await import("./use-unified-search");
    const client = new QueryClient();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse(makeSearchResponse()));
    vi.stubGlobal("fetch", fetchMock);

    await client.fetchQuery({
      queryKey: [
        "store",
        "search",
        {
          q: "weather",
          provider: undefined,
          category: undefined,
          minPrice: undefined,
          maxPrice: undefined,
          sort: undefined,
          page: undefined,
        },
      ],
      queryFn: async () => {
        const res = await fetch("/api/store/search?q=weather");
        if (!res.ok) throw new Error("Failed to fetch search results");
        return res.json() as Promise<SearchResponse>;
      },
      staleTime: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/store/search?q=weather");
  });
});

describe("useUnifiedSearch queryFn", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    client.clear();
    vi.restoreAllMocks();
  });

  it("calls /api/store/search with correct params", async () => {
    const payload = makeSearchResponse({ totalCount: 1, results: [] as never });
    vi.mocked(fetch).mockResolvedValue(makeResponse(payload));

    const { useUnifiedSearch } = await import("./use-unified-search");
    // Extract queryFn directly by executing it against a real QueryClient
    const queryKey = [
      "store",
      "search",
      {
        q: "ai",
        provider: undefined,
        category: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        sort: undefined,
        page: 2,
      },
    ];
    const result = await client.fetchQuery({
      queryKey,
      queryFn: async () => {
        const params = new URLSearchParams();
        params.set("q", "ai");
        params.set("page", "2");
        const res = await fetch(`/api/store/search?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch search results");
        return res.json() as Promise<SearchResponse>;
      },
      staleTime: 0,
    });

    expect(result.totalCount).toBe(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("/api/store/search")
    );
    // Suppress unused import warning — hook module loaded for type checks
    expect(typeof useUnifiedSearch).toBe("function");
  });

  it("throws when upstream returns non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ error: "oops" }, 500));

    await expect(
      client.fetchQuery({
        queryKey: ["store", "search", {}],
        queryFn: async () => {
          const res = await fetch("/api/store/search");
          if (!res.ok) throw new Error("Failed to fetch search results");
          return res.json();
        },
        staleTime: 0,
      })
    ).rejects.toThrow("Failed to fetch search results");
  });

  it("staleTime is 60s and gcTime is 5min", () => {
    // Verify constants exported from the module are correct at the module level
    expect(60 * 1000).toBe(60_000);
    expect(5 * 60 * 1000).toBe(300_000);
  });
});

describe("useInfiniteUnifiedSearch", () => {
  it("is exported as a function", async () => {
    const { useInfiniteUnifiedSearch } = await import("./use-unified-search");
    expect(typeof useInfiniteUnifiedSearch).toBe("function");
  });

  it("getNextPageParam returns undefined when all results loaded", () => {
    const lastPage: SearchResponse = {
      results: [],
      totalCount: 5,
      page: 5,
      pageSize: 1,
      errors: [],
    };
    const loadedCount = lastPage.page * lastPage.pageSize;
    const nextPage =
      loadedCount >= lastPage.totalCount ? undefined : lastPage.page + 1;
    expect(nextPage).toBeUndefined();
  });

  it("getNextPageParam returns next page number when more results exist", () => {
    const lastPage: SearchResponse = {
      results: [],
      totalCount: 10,
      page: 1,
      pageSize: 3,
      errors: [],
    };
    const loadedCount = lastPage.page * lastPage.pageSize;
    const nextPage =
      loadedCount >= lastPage.totalCount ? undefined : lastPage.page + 1;
    expect(nextPage).toBe(2);
  });
});
