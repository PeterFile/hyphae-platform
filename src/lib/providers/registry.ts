import type { UnifiedAgent } from "@/lib/unified-schema";

import type {
  ProviderAdapter,
  ProviderError,
  ProviderName,
  SearchFilters,
} from "./types";

const DEFAULT_ADAPTER_TIMEOUT_MS = 5000;

type RelevanceIndexMap = Map<string, number>;

export type SearchAllResponse = {
  results: UnifiedAgent[];
  errors: ProviderError[];
};

export type AdapterRegistryOptions = {
  adapterTimeoutMs?: number;
  adapters?: ProviderAdapter[];
};

class AdapterTimeoutError extends Error {
  constructor(
    readonly provider: ProviderName,
    timeoutMs: number
  ) {
    super(`Adapter "${provider}" timed out after ${timeoutMs}ms`);
    this.name = "AdapterTimeoutError";
  }
}

function normalizeTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_ADAPTER_TIMEOUT_MS;
  }

  return Math.floor(timeoutMs);
}

function withTimeout<T>(
  promise: Promise<T>,
  provider: ProviderName,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new AdapterTimeoutError(provider, timeoutMs));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        clearTimeout(timeoutId);
      });
  });
}

function toProviderError(
  provider: ProviderName,
  reason: unknown
): ProviderError {
  if (reason instanceof AdapterTimeoutError) {
    return {
      provider,
      type: "timeout",
      message: reason.message,
      cause: reason,
    };
  }

  if (reason instanceof Error) {
    return {
      provider,
      type: "adapter_error",
      message: reason.message,
      cause: reason,
    };
  }

  return {
    provider,
    type: "adapter_error",
    message: String(reason),
    cause: reason,
  };
}

function relevanceIndexFor(
  agentId: string,
  relevance: RelevanceIndexMap
): number {
  return relevance.get(agentId) ?? Number.MAX_SAFE_INTEGER;
}

function sortByPriceAsc(
  left: UnifiedAgent,
  right: UnifiedAgent,
  relevance: RelevanceIndexMap
): number {
  const delta = left.pricing.amountUsdcCents - right.pricing.amountUsdcCents;
  if (delta !== 0) {
    return delta;
  }

  return (
    relevanceIndexFor(left.id, relevance) -
    relevanceIndexFor(right.id, relevance)
  );
}

function sortByPriceDesc(
  left: UnifiedAgent,
  right: UnifiedAgent,
  relevance: RelevanceIndexMap
): number {
  const delta = right.pricing.amountUsdcCents - left.pricing.amountUsdcCents;
  if (delta !== 0) {
    return delta;
  }

  return (
    relevanceIndexFor(left.id, relevance) -
    relevanceIndexFor(right.id, relevance)
  );
}

function sortByAvailability(
  left: UnifiedAgent,
  right: UnifiedAgent,
  relevance: RelevanceIndexMap
): number {
  if (left.availability.isOnline !== right.availability.isOnline) {
    return left.availability.isOnline ? -1 : 1;
  }

  const leftLatency = left.availability.latencyMs ?? Number.MAX_SAFE_INTEGER;
  const rightLatency = right.availability.latencyMs ?? Number.MAX_SAFE_INTEGER;
  const latencyDelta = leftLatency - rightLatency;
  if (latencyDelta !== 0) {
    return latencyDelta;
  }

  return (
    relevanceIndexFor(left.id, relevance) -
    relevanceIndexFor(right.id, relevance)
  );
}

function sortAgents(
  agents: UnifiedAgent[],
  sort: SearchFilters["sort"] | undefined,
  relevance: RelevanceIndexMap
): UnifiedAgent[] {
  switch (sort) {
    case "price_asc":
      return agents.sort((left, right) =>
        sortByPriceAsc(left, right, relevance)
      );
    case "price_desc":
      return agents.sort((left, right) =>
        sortByPriceDesc(left, right, relevance)
      );
    case "availability":
      return agents.sort((left, right) =>
        sortByAvailability(left, right, relevance)
      );
    case "relevance":
    default:
      return agents.sort(
        (left, right) =>
          relevanceIndexFor(left.id, relevance) -
          relevanceIndexFor(right.id, relevance)
      );
  }
}

export class AdapterRegistry {
  private readonly adapters = new Map<ProviderName, ProviderAdapter>();
  private readonly adapterTimeoutMs: number;

  constructor(options: AdapterRegistryOptions = {}) {
    this.adapterTimeoutMs = normalizeTimeout(
      options.adapterTimeoutMs ?? DEFAULT_ADAPTER_TIMEOUT_MS
    );

    options.adapters?.forEach((adapter) => {
      this.register(adapter);
    });
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  unregister(provider: ProviderName): boolean {
    return this.adapters.delete(provider);
  }

  list(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  async searchAll(
    query: string,
    filters: SearchFilters = {}
  ): Promise<SearchAllResponse> {
    const targetAdapters = this.selectAdapters(filters);
    if (targetAdapters.length === 0) {
      return { results: [], errors: [] };
    }

    const searches = targetAdapters.map((adapter) =>
      withTimeout(
        adapter.search(query, filters),
        adapter.name,
        this.adapterTimeoutMs
      )
    );
    const settledResults = await Promise.allSettled(searches);

    const deduped = new Map<string, UnifiedAgent>();
    const relevance = new Map<string, number>();
    let relevanceIndex = 0;
    const errors: ProviderError[] = [];

    settledResults.forEach((entry, index) => {
      const provider = targetAdapters[index].name;
      if (entry.status === "rejected") {
        errors.push(toProviderError(provider, entry.reason));
        return;
      }

      entry.value.forEach((agent) => {
        if (deduped.has(agent.id)) {
          return;
        }

        deduped.set(agent.id, agent);
        relevance.set(agent.id, relevanceIndex);
        relevanceIndex += 1;
      });
    });

    const results = sortAgents([...deduped.values()], filters.sort, relevance);
    return { results, errors };
  }

  private selectAdapters(filters: SearchFilters): ProviderAdapter[] {
    if (filters.provider === undefined) {
      return this.list();
    }

    const providers = Array.isArray(filters.provider)
      ? filters.provider
      : [filters.provider];
    const providerSet = new Set(providers);

    return this.list().filter((adapter) => providerSet.has(adapter.name));
  }
}
