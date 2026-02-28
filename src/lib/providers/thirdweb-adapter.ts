import { checkEndpoint } from "@/lib/availability-checker";
import { normalizeToUsdcCents } from "@/lib/price-normalizer";
import { UnifiedAgentSchema, type UnifiedAgent } from "@/lib/unified-schema";

import type {
  AvailabilityResult,
  ProviderAdapter,
  SearchFilters,
} from "./types";

type ThirdwebSortBy =
  | "createdAt"
  | "totalRequests"
  | "totalVolume"
  | "price"
  | "uniqueBuyers";

type ThirdwebSortOrder = "asc" | "desc";

type ThirdwebDiscoveryAccept = {
  scheme?: "exact" | "upto";
  network: string | number;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema?: Record<string, unknown>;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
};

type ThirdwebDiscoveryItem = {
  resource: string;
  type: "http";
  x402Version: number;
  accepts: ThirdwebDiscoveryAccept[];
  lastUpdated: string;
  metadata?: Record<string, unknown>;
};

type ThirdwebDiscoveryResponse = {
  x402Version: number;
  items: ThirdwebDiscoveryItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

type ThirdwebAdapterError = {
  at: string;
  message: string;
};

type ThirdwebAdapterOptions = {
  secretKey?: string;
  endpointUrl?: string;
  fetchFn?: typeof fetch;
};

const DEFAULT_DISCOVERY_ENDPOINT =
  "https://api.thirdweb.com/v1/payments/x402/discovery/resources";
const DEFAULT_LIMIT = 20;
const MAX_ERROR_LOG = 20;
const DEFAULT_UNKNOWN_ENDPOINT = "https://nexus.thirdweb.com/unknown";

const USDC_EVM_ADDRESSES = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Base USDC
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // Ethereum USDC
]);

function nowIsoString(): string {
  return new Date().toISOString();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(
  source: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = source?.[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPositiveNumber(
  source: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const value = source?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
}

function ensureIsoDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function ensureUrl(value: string | undefined, index: number): string {
  if (value) {
    try {
      return new URL(value).toString();
    } catch {
      // fall through to fallback URL
    }
  }

  return `${DEFAULT_UNKNOWN_ENDPOINT}/${index + 1}`;
}

function toSafePositiveInteger(
  value: number | undefined,
  fallback: number
): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function normalizeNetwork(network: string | number | undefined): string {
  if (typeof network === "number" && Number.isFinite(network) && network > 0) {
    return `eip155:${Math.floor(network)}`;
  }

  if (typeof network === "string" && network.trim().length > 0) {
    return network.trim();
  }

  return "eip155:8453";
}

function normalizeSort(sort: SearchFilters["sort"]): {
  sortBy: ThirdwebSortBy;
  sortOrder: ThirdwebSortOrder;
} {
  if (sort === "price_asc") {
    return { sortBy: "price", sortOrder: "asc" };
  }

  if (sort === "price_desc") {
    return { sortBy: "price", sortOrder: "desc" };
  }

  if (sort === "availability") {
    return { sortBy: "uniqueBuyers", sortOrder: "desc" };
  }

  return { sortBy: "createdAt", sortOrder: "asc" };
}

function toTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  return rawTags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function normalizeMethod(value: string | undefined): "GET" | "POST" {
  return value?.toUpperCase() === "POST" ? "POST" : "GET";
}

function sanitizeId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "unknown";
}

function normalizeAssetForPricing(rawAsset: string): string {
  const trimmed = rawAsset.trim();
  if (trimmed.length === 0) {
    return "USDC";
  }

  const lower = trimmed.toLowerCase();
  if (USDC_EVM_ADDRESSES.has(lower)) {
    return "USDC";
  }

  const upper = trimmed.toUpperCase();
  if (upper === "USDC" || upper === "USDC.E") {
    return "USDC";
  }

  return trimmed;
}

function coerceDiscoveryAccept(value: unknown): ThirdwebDiscoveryAccept {
  const record = isObjectRecord(value) ? value : {};

  return {
    scheme:
      record.scheme === "upto" || record.scheme === "exact"
        ? record.scheme
        : "exact",
    network:
      typeof record.network === "string" || typeof record.network === "number"
        ? record.network
        : "eip155:8453",
    maxAmountRequired:
      typeof record.maxAmountRequired === "string"
        ? record.maxAmountRequired
        : "0",
    resource: typeof record.resource === "string" ? record.resource : "",
    description:
      typeof record.description === "string" ? record.description : "",
    mimeType: typeof record.mimeType === "string" ? record.mimeType : "",
    outputSchema: isObjectRecord(record.outputSchema)
      ? record.outputSchema
      : undefined,
    payTo: typeof record.payTo === "string" ? record.payTo : "",
    maxTimeoutSeconds:
      typeof record.maxTimeoutSeconds === "number" &&
      Number.isFinite(record.maxTimeoutSeconds)
        ? Math.floor(record.maxTimeoutSeconds)
        : 0,
    asset: typeof record.asset === "string" ? record.asset : "USDC",
    extra: isObjectRecord(record.extra) ? record.extra : undefined,
  };
}

function coerceDiscoveryItem(value: unknown): ThirdwebDiscoveryItem {
  const record = isObjectRecord(value) ? value : {};

  return {
    resource: typeof record.resource === "string" ? record.resource : "",
    type: "http",
    x402Version:
      typeof record.x402Version === "number" &&
      Number.isFinite(record.x402Version)
        ? record.x402Version
        : 1,
    accepts: Array.isArray(record.accepts)
      ? record.accepts.map(coerceDiscoveryAccept)
      : [],
    lastUpdated:
      typeof record.lastUpdated === "string" ? record.lastUpdated : "",
    metadata: isObjectRecord(record.metadata) ? record.metadata : undefined,
  };
}

export class ThirdwebAdapter implements ProviderAdapter {
  readonly name = "thirdweb" as const;
  public lastError: string | null = null;

  private readonly fetchFn: typeof fetch;
  private readonly secretKey?: string;
  private readonly endpointUrl: string;
  private readonly providerAgentCache = new Map<string, UnifiedAgent>();
  private readonly errorLog: ThirdwebAdapterError[] = [];

  constructor(options: ThirdwebAdapterOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.secretKey = options.secretKey;
    this.endpointUrl = options.endpointUrl ?? DEFAULT_DISCOVERY_ENDPOINT;
  }

  getErrors(): ThirdwebAdapterError[] {
    return [...this.errorLog];
  }

  async search(
    query: string,
    filters: SearchFilters = {}
  ): Promise<UnifiedAgent[]> {
    this.lastError = null;
    const secretKey = this.secretKey ?? process.env.THIRDWEB_SECRET_KEY;

    if (!secretKey) {
      this.recordError("THIRDWEB_SECRET_KEY is missing");
      return [];
    }

    const discoveryUrl = this.buildDiscoveryUrl(query, filters);
    let response: Response;

    try {
      response = await this.fetchWithRetry(discoveryUrl, {
        method: "GET",
        headers: {
          "x-client-id": secretKey,
        },
      });
    } catch (error) {
      this.recordError("thirdweb discovery request failed", error);
      return [];
    }

    if (!response.ok) {
      this.recordError(
        `thirdweb discovery request failed with status ${response.status}`
      );
      return [];
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      this.recordError("thirdweb discovery response is not valid JSON", error);
      return [];
    }

    const normalizedAgents = this.parseAndNormalizePayload(payload);
    const filteredAgents = this.applyFilters(normalizedAgents, filters);
    this.cacheResults(filteredAgents);
    return filteredAgents;
  }

  async getById(id: string): Promise<UnifiedAgent | null> {
    const lookupId = id.trim();
    if (lookupId.length === 0) {
      return null;
    }

    const direct = this.providerAgentCache.get(lookupId);
    if (direct) {
      return direct;
    }

    const prefixed = lookupId.startsWith("thirdweb:")
      ? lookupId
      : `thirdweb:${lookupId}`;
    const cached = this.providerAgentCache.get(prefixed);
    if (cached) {
      return cached;
    }

    await this.search("", {});

    return (
      this.providerAgentCache.get(lookupId) ??
      this.providerAgentCache.get(prefixed) ??
      null
    );
  }

  async checkAvailability(endpointUrl: string): Promise<AvailabilityResult> {
    const result = await checkEndpoint(endpointUrl);
    return {
      isOnline: result.isOnline,
      latencyMs: result.latencyMs,
      lastChecked: result.lastChecked,
      statusCode: result.statusCode ?? 0,
    };
  }

  normalize(item: ThirdwebDiscoveryItem, index = 0): UnifiedAgent {
    const accepts = item.accepts[0];
    const metadata = item.metadata;
    const endpointUrl = ensureUrl(accepts?.resource ?? item.resource, index);
    const originalId = this.buildOriginalId(endpointUrl, index);
    const network = normalizeNetwork(accepts?.network);
    const rawAmount = accepts?.maxAmountRequired ?? "0";
    const rawAsset = normalizeAssetForPricing(accepts?.asset ?? "USDC");
    const pricing = normalizeToUsdcCents(rawAmount, rawAsset, network);
    const fallbackDescription = `Payable endpoint at ${endpointUrl}`;
    const nameFromUrl = (() => {
      try {
        return new URL(endpointUrl).hostname;
      } catch {
        return `Nexus Resource ${index + 1}`;
      }
    })();

    const candidate = {
      id: `thirdweb:${originalId}`,
      provider: "thirdweb" as const,
      originalId,
      name: readString(metadata, "name") ?? `Nexus Resource: ${nameFromUrl}`,
      description:
        accepts?.description ||
        readString(metadata, "description") ||
        fallbackDescription,
      category: readString(metadata, "category") ?? "General",
      tags: toTags(metadata?.tags),
      endpoint: {
        url: endpointUrl,
        method: normalizeMethod(readString(metadata, "method")),
      },
      pricing: {
        amountUsdcCents: pricing.amountUsdcCents,
        rawAmount,
        rawAsset,
        network,
      },
      availability: {
        isOnline: false,
        lastChecked: nowIsoString(),
        statusCode: 0,
      },
      metadata: {
        registeredAt: ensureIsoDate(
          readString(metadata, "registeredAt") ?? item.lastUpdated
        ),
        totalCalls:
          readPositiveNumber(metadata, "totalCalls") ??
          readPositiveNumber(metadata, "totalRequests"),
        rating: readPositiveNumber(metadata, "rating"),
      },
    };

    const parsed = UnifiedAgentSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }

    this.recordError(
      `thirdweb normalize fallback used for resource ${item.resource}`
    );
    return UnifiedAgentSchema.parse({
      id: `thirdweb:fallback-${index + 1}`,
      provider: "thirdweb",
      originalId: `fallback-${index + 1}`,
      name: `Nexus Resource ${index + 1}`,
      description: "Nexus payable endpoint",
      category: "General",
      tags: [],
      endpoint: {
        url: `${DEFAULT_UNKNOWN_ENDPOINT}/${index + 1}`,
        method: "GET",
      },
      pricing: {
        amountUsdcCents: 0,
        rawAmount: "0",
        rawAsset: "USDC",
        network: "eip155:8453",
      },
      availability: {
        isOnline: false,
        lastChecked: nowIsoString(),
        statusCode: 0,
      },
    });
  }

  private parseAndNormalizePayload(payload: unknown): UnifiedAgent[] {
    if (!isObjectRecord(payload) || !Array.isArray(payload.items)) {
      this.recordError("thirdweb discovery response missing items");
      return [];
    }

    const response = payload as Partial<ThirdwebDiscoveryResponse>;
    return (response.items ?? [])
      .map((item) => coerceDiscoveryItem(item))
      .map((item, index) => this.normalize(item, index));
  }

  private applyFilters(
    agents: UnifiedAgent[],
    filters: SearchFilters
  ): UnifiedAgent[] {
    let filtered = [...agents];

    if (filters.category) {
      const normalizedCategory = filters.category.toLowerCase();
      filtered = filtered.filter(
        (agent) => agent.category.toLowerCase() === normalizedCategory
      );
    }

    if (filters.minPrice !== undefined) {
      filtered = filtered.filter(
        (agent) => agent.pricing.amountUsdcCents >= filters.minPrice!
      );
    }

    if (filters.maxPrice !== undefined) {
      filtered = filtered.filter(
        (agent) => agent.pricing.amountUsdcCents <= filters.maxPrice!
      );
    }

    if (filters.sort === "price_asc") {
      filtered.sort(
        (left, right) =>
          left.pricing.amountUsdcCents - right.pricing.amountUsdcCents
      );
    } else if (filters.sort === "price_desc") {
      filtered.sort(
        (left, right) =>
          right.pricing.amountUsdcCents - left.pricing.amountUsdcCents
      );
    }

    return filtered;
  }

  private cacheResults(unifiedAgents: UnifiedAgent[]): void {
    for (const unifiedAgent of unifiedAgents) {
      this.providerAgentCache.set(unifiedAgent.id, unifiedAgent);
      this.providerAgentCache.set(unifiedAgent.originalId, unifiedAgent);
      this.providerAgentCache.set(unifiedAgent.endpoint.url, unifiedAgent);
    }
  }

  private buildDiscoveryUrl(query: string, filters: SearchFilters): string {
    const searchQuery =
      query.trim().length > 0 ? query.trim() : (filters.q ?? "");
    const limit = toSafePositiveInteger(filters.pageSize, DEFAULT_LIMIT);
    const page = toSafePositiveInteger(filters.page, 1);
    const offset = (page - 1) * limit;
    const { sortBy, sortOrder } = normalizeSort(filters.sort);

    const url = new URL(this.endpointUrl);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("query", searchQuery);
    url.searchParams.set("sortBy", sortBy);
    url.searchParams.set("sortOrder", sortOrder);
    return url.toString();
  }

  private buildOriginalId(resourceUrl: string, index: number): string {
    try {
      const parsedUrl = new URL(resourceUrl);
      const joined = `${parsedUrl.hostname}${parsedUrl.pathname}`;
      return sanitizeId(joined);
    } catch {
      const sanitized = sanitizeId(resourceUrl);
      return sanitized === "unknown" ? `resource-${index + 1}` : sanitized;
    }
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch {
      return this.fetchFn(url, init);
    }
  }

  private recordError(message: string, cause?: unknown): void {
    const withCause = cause ? `${message}: ${String(cause)}` : message;
    this.lastError = withCause;
    this.errorLog.push({
      at: nowIsoString(),
      message: withCause,
    });

    if (this.errorLog.length > MAX_ERROR_LOG) {
      this.errorLog.shift();
    }
  }
}
