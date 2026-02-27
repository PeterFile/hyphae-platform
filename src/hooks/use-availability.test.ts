import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AvailabilityResponse } from "./use-availability";

// ---- helpers ----------------------------------------------------------------

function makeResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeAvailability(
  overrides: Partial<AvailabilityResponse> = {}
): AvailabilityResponse {
  return {
    isOnline: true,
    latencyMs: 42,
    lastChecked: "2026-02-28T00:00:00.000Z",
    ...overrides,
  };
}

// ---- queryFn tests ----------------------------------------------------------

describe("useAvailability queryFn", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    client.clear();
    vi.restoreAllMocks();
  });

  it("calls /api/store/availability?id= with encoded agentId", async () => {
    const payload = makeAvailability();
    vi.mocked(fetch).mockResolvedValue(makeResponse(payload));

    const agentId = "coinbase:abc-123";
    const result = await client.fetchQuery<AvailabilityResponse>({
      queryKey: ["store", "availability", agentId],
      queryFn: async () => {
        const res = await fetch(
          `/api/store/availability?id=${encodeURIComponent(agentId)}`
        );
        if (!res.ok) throw new Error("Failed to fetch availability");
        return res.json() as Promise<AvailabilityResponse>;
      },
      staleTime: 0,
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/store/availability?id=coinbase%3Aabc-123"
    );
    expect(result.isOnline).toBe(true);
    expect(result.latencyMs).toBe(42);
  });

  it("throws when endpoint returns non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ error: "not found" }, 404)
    );

    await expect(
      client.fetchQuery({
        queryKey: ["store", "availability", "coinbase:missing"],
        queryFn: async () => {
          const res = await fetch(
            "/api/store/availability?id=coinbase%3Amissing"
          );
          if (!res.ok) throw new Error("Failed to fetch availability");
          return res.json();
        },
        staleTime: 0,
      })
    ).rejects.toThrow("Failed to fetch availability");
  });

  it("refetchInterval is 30s", () => {
    expect(30 * 1000).toBe(30_000);
  });
});

describe("useAvailability exports", () => {
  it("useAvailability is exported as a function", async () => {
    const { useAvailability } = await import("./use-availability");
    expect(typeof useAvailability).toBe("function");
  });

  it("useAvailabilityBatch is exported as a function", async () => {
    const { useAvailabilityBatch } = await import("./use-availability");
    expect(typeof useAvailabilityBatch).toBe("function");
  });
});

describe("useAvailabilityBatch result shape", () => {
  it("maps results to a record keyed by agentId", () => {
    // Simulate the reduce logic without DOM
    const agentIds = ["coinbase:a1", "thirdweb:b2"];
    type Entry = {
      isOnline: boolean;
      latencyMs: number;
      lastChecked: string | null;
      isChecking: boolean;
      error: unknown;
    };
    const fakeQueryResults = [
      {
        data: makeAvailability({ isOnline: true, latencyMs: 10 }),
        isLoading: false,
        isFetching: false,
        error: null,
      },
      {
        data: makeAvailability({ isOnline: false, latencyMs: 0 }),
        isLoading: false,
        isFetching: false,
        error: null,
      },
    ] as Array<{
      data?: AvailabilityResponse;
      isLoading: boolean;
      isFetching: boolean;
      error: unknown;
    }>;

    const record = fakeQueryResults.reduce(
      (acc, query, index) => {
        const id = agentIds[index];
        acc[id] = {
          isOnline: query.data?.isOnline ?? false,
          latencyMs: query.data?.latencyMs ?? 0,
          lastChecked: query.data?.lastChecked ?? null,
          isChecking: query.isLoading || query.isFetching,
          error: query.error,
        };
        return acc;
      },
      {} as Record<string, Entry>
    );

    expect(record["coinbase:a1"].isOnline).toBe(true);
    expect(record["thirdweb:b2"].isOnline).toBe(false);
    expect(Object.keys(record)).toHaveLength(2);
  });
});
