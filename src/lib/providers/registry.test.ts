import { afterEach, describe, expect, it, vi } from "vitest";

import type { UnifiedAgent } from "@/lib/unified-schema";

import { AdapterRegistry } from "./registry";
import type { ProviderAdapter, ProviderName } from "./types";

function createAgent(input: {
  provider: ProviderName;
  originalId: string;
  amountUsdcCents?: number;
  isOnline?: boolean;
  latencyMs?: number;
}): UnifiedAgent {
  return {
    id: `${input.provider}:${input.originalId}`,
    provider: input.provider,
    originalId: input.originalId,
    name: `${input.provider}-${input.originalId}`,
    description: "test agent",
    category: "General",
    tags: [],
    endpoint: {
      url: "https://example.com/agent",
      method: "GET",
    },
    pricing: {
      amountUsdcCents: input.amountUsdcCents ?? 0,
      rawAmount: "0",
      rawAsset: "USDC",
      network: "base",
    },
    availability: {
      isOnline: input.isOnline ?? true,
      lastChecked: "2026-02-25T02:29:24Z",
      latencyMs: input.latencyMs,
      statusCode: 200,
    },
    metadata: undefined,
  };
}

function createAdapter(
  name: ProviderName,
  searchImpl: ProviderAdapter["search"]
): ProviderAdapter {
  return {
    name,
    search: searchImpl,
    getById: async () => null,
    checkAvailability: async () => ({
      isOnline: true,
      lastChecked: "2026-02-25T02:29:24Z",
      latencyMs: 1,
      statusCode: 200,
    }),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("AdapterRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("searchAll calls adapters in parallel and aggregates results", async () => {
    const coinbaseDeferred = createDeferred<UnifiedAgent[]>();
    const thirdwebDeferred = createDeferred<UnifiedAgent[]>();

    const coinbaseSearch = vi.fn(async () => coinbaseDeferred.promise);
    const thirdwebSearch = vi.fn(async () => thirdwebDeferred.promise);

    const registry = new AdapterRegistry();
    registry.register(createAdapter("coinbase", coinbaseSearch));
    registry.register(createAdapter("thirdweb", thirdwebSearch));

    const pending = registry.searchAll("weather");

    expect(coinbaseSearch).toHaveBeenCalledTimes(1);
    expect(thirdwebSearch).toHaveBeenCalledTimes(1);

    coinbaseDeferred.resolve([
      createAgent({ provider: "coinbase", originalId: "cb-1" }),
    ]);
    thirdwebDeferred.resolve([
      createAgent({ provider: "thirdweb", originalId: "tw-1" }),
    ]);

    const response = await pending;

    expect(response.errors).toEqual([]);
    expect(response.results.map((agent) => agent.id)).toEqual([
      "coinbase:cb-1",
      "thirdweb:tw-1",
    ]);
  });

  it("does not block all results when one adapter times out", async () => {
    vi.useFakeTimers();

    const neverResolveSearch = vi.fn(
      () => new Promise<UnifiedAgent[]>(() => undefined)
    );
    const thirdwebSearch = vi.fn(async () => [
      createAgent({ provider: "thirdweb", originalId: "tw-2" }),
    ]);

    const registry = new AdapterRegistry({ adapterTimeoutMs: 5000 });
    registry.register(createAdapter("coinbase", neverResolveSearch));
    registry.register(createAdapter("thirdweb", thirdwebSearch));

    const pending = registry.searchAll("timeout-test");
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending;

    expect(response.results.map((agent) => agent.id)).toEqual([
      "thirdweb:tw-2",
    ]);
    expect(response.errors).toHaveLength(1);
    expect(response.errors[0]).toEqual(
      expect.objectContaining({
        provider: "coinbase",
        type: "timeout",
      })
    );
  });

  it("deduplicates by id", async () => {
    const registry = new AdapterRegistry();

    registry.register(
      createAdapter("coinbase", async () => [
        createAgent({ provider: "coinbase", originalId: "dup-1" }),
        createAgent({ provider: "coinbase", originalId: "dup-1" }),
      ])
    );

    registry.register(
      createAdapter("thirdweb", async () => [
        createAgent({ provider: "thirdweb", originalId: "tw-3" }),
      ])
    );

    const response = await registry.searchAll("dedupe");

    expect(response.results.map((agent) => agent.id)).toEqual([
      "coinbase:dup-1",
      "thirdweb:tw-3",
    ]);
  });

  it("supports sorting by price_asc and price_desc", async () => {
    const registry = new AdapterRegistry();

    registry.register(
      createAdapter("coinbase", async () => [
        createAgent({
          provider: "coinbase",
          originalId: "expensive",
          amountUsdcCents: 300,
        }),
        createAgent({
          provider: "coinbase",
          originalId: "cheap",
          amountUsdcCents: 100,
        }),
        createAgent({
          provider: "coinbase",
          originalId: "mid",
          amountUsdcCents: 200,
        }),
      ])
    );

    const asc = await registry.searchAll("sort", { sort: "price_asc" });
    const desc = await registry.searchAll("sort", { sort: "price_desc" });

    expect(asc.results.map((agent) => agent.id)).toEqual([
      "coinbase:cheap",
      "coinbase:mid",
      "coinbase:expensive",
    ]);
    expect(desc.results.map((agent) => agent.id)).toEqual([
      "coinbase:expensive",
      "coinbase:mid",
      "coinbase:cheap",
    ]);
  });

  it("supports sorting by availability and relevance", async () => {
    const registry = new AdapterRegistry();

    registry.register(
      createAdapter("coinbase", async () => [
        createAgent({
          provider: "coinbase",
          originalId: "offline",
          isOnline: false,
          latencyMs: 20,
        }),
        createAgent({
          provider: "coinbase",
          originalId: "online-slow",
          isOnline: true,
          latencyMs: 250,
        }),
        createAgent({
          provider: "coinbase",
          originalId: "online-fast",
          isOnline: true,
          latencyMs: 50,
        }),
      ])
    );

    const availability = await registry.searchAll("sort", {
      sort: "availability",
    });
    const relevance = await registry.searchAll("sort", { sort: "relevance" });

    expect(availability.results.map((agent) => agent.id)).toEqual([
      "coinbase:online-fast",
      "coinbase:online-slow",
      "coinbase:offline",
    ]);
    expect(relevance.results.map((agent) => agent.id)).toEqual([
      "coinbase:offline",
      "coinbase:online-slow",
      "coinbase:online-fast",
    ]);
  });

  it("collects adapter errors with optional cause", async () => {
    const failure = new Error("upstream failed");
    const failingSearch = vi.fn(async () => {
      throw failure;
    });
    const registry = new AdapterRegistry();
    registry.register(createAdapter("coinbase", failingSearch));

    const response = await registry.searchAll("error");

    expect(response.results).toEqual([]);
    expect(response.errors).toHaveLength(1);
    expect(response.errors[0]).toEqual(
      expect.objectContaining({
        provider: "coinbase",
        type: "adapter_error",
        message: "upstream failed",
        cause: failure,
      })
    );
  });

  it("respects provider filters", async () => {
    const coinbaseSearch = vi.fn(async () => [
      createAgent({ provider: "coinbase", originalId: "cb-4" }),
    ]);
    const thirdwebSearch = vi.fn(async () => [
      createAgent({ provider: "thirdweb", originalId: "tw-4" }),
    ]);

    const registry = new AdapterRegistry();
    registry.register(createAdapter("coinbase", coinbaseSearch));
    registry.register(createAdapter("thirdweb", thirdwebSearch));

    const response = await registry.searchAll("filter", {
      provider: "coinbase",
    });

    expect(coinbaseSearch).toHaveBeenCalledTimes(1);
    expect(thirdwebSearch).toHaveBeenCalledTimes(0);
    expect(response.results.map((agent) => agent.id)).toEqual([
      "coinbase:cb-4",
    ]);
  });
});
