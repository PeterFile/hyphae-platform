import { z } from "zod";

import { checkEndpoint } from "@/lib/availability-checker";
import { normalizeToUsdcCents } from "@/lib/price-normalizer";
import { UnifiedAgentSchema, type UnifiedAgent } from "@/lib/unified-schema";

import type {
  AvailabilityResult,
  ProviderAdapter,
  SearchFilters,
} from "./types";

export const DEFAULT_COINBASE_FACILITATOR_URL =
  "https://api.cdp.coinbase.com/platform/v2/x402";

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

// Module-level discovery cache shared across all adapter instances.
let _discoveryCacheTtlMs = 60_000;
const _discoveryCache: { data: BazaarResource[] | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
};

/** Exposed for tests: flush the in-process discovery cache. */
export function clearDiscoveryCache(): void {
  _discoveryCache.data = null;
  _discoveryCache.expiresAt = 0;
}

/** Exposed for tests: override cache TTL (ms). */
export function setDiscoveryCacheTtl(ms: number): void {
  _discoveryCacheTtlMs = ms;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const KNOWN_USDC_ASSETS = new Set([
  "usdc",
  "usdc.e",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
]);

type AdapterEnv = Partial<
  Record<"COINBASE_FACILITATOR_URL" | "NODE_ENV", string | undefined>
>;

const BazaarAcceptSchema = z
  .object({
    asset: z.string().optional().default(""),
    amount: z.string().optional(),
    maxAmountRequired: z.string().optional(),
    max_amount_required: z.string().optional(),
    network: z.string().optional().default("base"),
    description: z.string().optional().default(""),
    extra: z.record(z.unknown()).optional().default({}),
    outputSchema: z.record(z.unknown()).optional(),
    output_schema: z.record(z.unknown()).optional(),
  })
  .passthrough();

const BazaarResourceSchema = z
  .object({
    resource: z.string(),
    type: z.string().optional().default("http"),
    x402Version: z.number().int().optional(),
    x402_version: z.number().int().optional(),
    accepts: z.array(BazaarAcceptSchema).optional().default([]),
    lastUpdated: z.string().optional(),
    last_updated: z.string().optional(),
    metadata: z.record(z.unknown()).optional().default({}),
  })
  .passthrough();

export type BazaarAccept = {
  asset: string;
  amount?: string;
  maxAmountRequired?: string;
  network: string;
  description: string;
  extra: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
};

export type BazaarResource = {
  resource: string;
  type: string;
  x402Version: number;
  accepts: BazaarAccept[];
  lastUpdated?: string;
  metadata: Record<string, unknown>;
};

type CoinbaseAdapterOptions = {
  facilitatorUrl?: string;
  fetchImpl?: typeof fetch;
  availabilityChecker?: (endpointUrl: string) => Promise<AvailabilityResult>;
  now?: () => Date;
};

function toProviderAvailability(
  result: Awaited<ReturnType<typeof checkEndpoint>>
): AvailabilityResult {
  return {
    isOnline: result.isOnline,
    lastChecked: result.lastChecked,
    latencyMs: result.latencyMs,
    statusCode: result.statusCode ?? 0,
  };
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error("Unknown error");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveCoinbaseFacilitatorUrl(
  env: AdapterEnv = process.env
): string {
  const configuredUrl = env.COINBASE_FACILITATOR_URL?.trim();

  if (configuredUrl) {
    return stripTrailingSlash(configuredUrl);
  }

  if (env.NODE_ENV === "production") {
    console.warn(
      "[CoinbaseAdapter] COINBASE_FACILITATOR_URL is missing in production. Falling back to default URL."
    );
  }

  return DEFAULT_COINBASE_FACILITATOR_URL;
}

function normalizeAccept(
  input: z.infer<typeof BazaarAcceptSchema>
): BazaarAccept {
  return {
    asset: input.asset,
    amount: input.amount,
    maxAmountRequired: input.maxAmountRequired ?? input.max_amount_required,
    network: input.network,
    description: input.description,
    extra: input.extra,
    outputSchema: input.outputSchema ?? input.output_schema,
  };
}

function normalizeResource(
  input: z.infer<typeof BazaarResourceSchema>
): BazaarResource {
  return {
    resource: input.resource,
    type: input.type,
    x402Version: input.x402Version ?? input.x402_version ?? 1,
    accepts: input.accepts.map(normalizeAccept),
    lastUpdated: input.lastUpdated ?? input.last_updated,
    metadata: input.metadata,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDiscoveryPayload(payload: unknown): BazaarResource[] {
  let entries: unknown[] = [];

  if (Array.isArray(payload)) {
    entries = payload;
  } else if (isRecord(payload) && Array.isArray(payload.items)) {
    entries = payload.items;
  } else if (isRecord(payload) && typeof payload.resource === "string") {
    entries = [payload];
  }

  return entries
    .map((entry) => {
      const parsed = BazaarResourceSchema.safeParse(entry);
      if (!parsed.success) {
        return null;
      }

      return normalizeResource(parsed.data);
    })
    .filter((entry): entry is BazaarResource => entry !== null);
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readMetadataNumber(
  metadata: Record<string, unknown>,
  key: string
): number | null {
  const value = metadata[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function readMetadataStringArray(
  metadata: Record<string, unknown>,
  key: string
): string[] {
  const value = metadata[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function pickPrimaryAccept(resource: BazaarResource): BazaarAccept | null {
  return resource.accepts[0] ?? null;
}

function resolveMethod(accept: BazaarAccept | null): "GET" | "POST" {
  if (accept === null || accept.outputSchema === undefined) {
    return "GET";
  }

  const outputSchema = accept.outputSchema;
  const input = outputSchema.input;

  if (!isRecord(input)) {
    return "GET";
  }

  const method = input.method;

  if (typeof method !== "string") {
    return "GET";
  }

  return method.toUpperCase() === "POST" ? "POST" : "GET";
}

function resolveRawAmount(accept: BazaarAccept | null): string {
  if (accept === null) {
    return "0";
  }

  return accept.maxAmountRequired ?? accept.amount ?? "0";
}

function resolveNetwork(accept: BazaarAccept | null): string {
  if (accept === null) {
    return "base";
  }

  const trimmed = accept.network.trim();
  return trimmed.length > 0 ? trimmed : "base";
}

function resolveRawAsset(accept: BazaarAccept | null): string {
  if (accept === null) {
    return "USDC";
  }

  const symbol = accept.extra.symbol;
  if (typeof symbol === "string" && symbol.trim().length > 0) {
    return symbol.trim().toUpperCase();
  }

  const name = accept.extra.name;
  if (typeof name === "string" && /usd\s*coin|usdc/i.test(name)) {
    return "USDC";
  }

  const asset = accept.asset.trim();
  if (asset.length === 0) {
    return "USDC";
  }

  if (KNOWN_USDC_ASSETS.has(asset.toLowerCase())) {
    return "USDC";
  }

  return asset;
}

function inferNameFromResource(resourceUrl: string): string {
  try {
    const url = new URL(resourceUrl);
    const tail = url.pathname
      .split("/")
      .filter((entry) => entry.length > 0)
      .at(-1);

    if (tail && tail.length > 0) {
      return tail;
    }

    return url.hostname;
  } catch {
    return resourceUrl;
  }
}

function isIsoDateString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function matchesQuery(resource: BazaarResource, query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  const metadataName = readMetadataString(resource.metadata, "name") ?? "";
  const metadataDescription =
    readMetadataString(resource.metadata, "description") ?? "";
  const acceptsDescription = resource.accepts
    .map((accept) => accept.description)
    .join(" ");

  const searchable = [
    resource.resource,
    metadataName,
    metadataDescription,
    acceptsDescription,
  ]
    .join(" ")
    .toLowerCase();

  return searchable.includes(query);
}

function applyFilters(agent: UnifiedAgent, filters?: SearchFilters): boolean {
  if (!filters) {
    return true;
  }

  if (
    typeof filters.minPrice === "number" &&
    agent.pricing.amountUsdcCents < filters.minPrice
  ) {
    return false;
  }

  if (
    typeof filters.maxPrice === "number" &&
    agent.pricing.amountUsdcCents > filters.maxPrice
  ) {
    return false;
  }

  if (
    typeof filters.category === "string" &&
    filters.category.trim().length > 0 &&
    agent.category.toLowerCase() !== filters.category.trim().toLowerCase()
  ) {
    return false;
  }

  return true;
}

export class CoinbaseAdapter implements ProviderAdapter {
  readonly name = "coinbase" as const;

  private readonly facilitatorUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly availabilityChecker: (
    endpointUrl: string
  ) => Promise<AvailabilityResult>;
  private readonly now: () => Date;

  constructor(options: CoinbaseAdapterOptions = {}) {
    this.facilitatorUrl = stripTrailingSlash(
      options.facilitatorUrl ?? resolveCoinbaseFacilitatorUrl()
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.availabilityChecker =
      options.availabilityChecker ??
      (async (endpointUrl: string) => {
        const result = await checkEndpoint(endpointUrl);
        return toProviderAvailability(result);
      });
    this.now = options.now ?? (() => new Date());
  }

  async search(
    query: string,
    filters?: SearchFilters
  ): Promise<UnifiedAgent[]> {
    const resources = await this.fetchDiscoveryResources();
    const normalizedQuery = query.trim().toLowerCase();

    return resources
      .filter((resource) => matchesQuery(resource, normalizedQuery))
      .map((resource) => this.normalize(resource))
      .filter((agent) => applyFilters(agent, filters));
  }

  async getById(id: string): Promise<UnifiedAgent | null> {
    const normalizedId = id.trim();

    if (normalizedId.length === 0) {
      return null;
    }

    const resourceId = normalizedId.startsWith("coinbase:")
      ? normalizedId.slice("coinbase:".length)
      : normalizedId;

    const resources = await this.fetchDiscoveryResources();
    const found = resources.find(
      (resource) => resource.resource === resourceId
    );

    if (!found) {
      return null;
    }

    return this.normalize(found);
  }

  async checkAvailability(endpointUrl: string): Promise<AvailabilityResult> {
    return this.availabilityChecker(endpointUrl);
  }

  normalize(resource: BazaarResource): UnifiedAgent {
    const primaryAccept = pickPrimaryAccept(resource);
    const rawAmount = resolveRawAmount(primaryAccept);
    const rawAsset = resolveRawAsset(primaryAccept);
    const network = resolveNetwork(primaryAccept);
    const method = resolveMethod(primaryAccept);
    const normalizedPrice = normalizeToUsdcCents(rawAmount, rawAsset, network);

    const name =
      readMetadataString(resource.metadata, "name") ??
      inferNameFromResource(resource.resource);
    const description =
      readMetadataString(resource.metadata, "description") ??
      primaryAccept?.description ??
      "No description provided.";
    const category =
      readMetadataString(resource.metadata, "category") ?? "General";
    const tags = readMetadataStringArray(resource.metadata, "tags");

    const registeredAt =
      typeof resource.lastUpdated === "string" &&
      isIsoDateString(resource.lastUpdated)
        ? resource.lastUpdated
        : undefined;

    const totalCallsRaw = readMetadataNumber(resource.metadata, "totalCalls");
    const totalCalls =
      totalCallsRaw !== null && totalCallsRaw >= 0
        ? Math.floor(totalCallsRaw)
        : undefined;
    const ratingRaw = readMetadataNumber(resource.metadata, "rating");
    const rating =
      ratingRaw !== null && ratingRaw >= 0 && ratingRaw <= 5
        ? ratingRaw
        : undefined;
    const metadata =
      registeredAt !== undefined ||
      totalCalls !== undefined ||
      rating !== undefined
        ? {
            registeredAt,
            totalCalls,
            rating,
          }
        : undefined;

    const unified: UnifiedAgent = {
      id: `coinbase:${resource.resource}`,
      provider: "coinbase",
      originalId: resource.resource,
      name,
      description,
      category,
      tags,
      endpoint: {
        url: resource.resource,
        method,
      },
      pricing: {
        amountUsdcCents: normalizedPrice.amountUsdcCents,
        rawAmount,
        rawAsset,
        network,
      },
      availability: {
        isOnline: false,
        lastChecked: this.now().toISOString(),
        statusCode: 0,
      },
      metadata,
    };

    return UnifiedAgentSchema.parse(unified);
  }

  private async fetchDiscoveryResources(): Promise<BazaarResource[]> {
    const now = Date.now();

    // Cache hit: return without touching the network.
    if (_discoveryCache.data !== null && now < _discoveryCache.expiresAt) {
      return _discoveryCache.data;
    }

    const discoveryUrl = `${this.facilitatorUrl}/discovery/resources`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        // Brief backoff so we don't immediately re-trigger a rate limit.
        await sleep(500);
      }

      try {
        const response = await this.fetchImpl(discoveryUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const message = `[CoinbaseAdapter] Failed to fetch discovery resources: ${response.status}`;

          if (attempt === 0 && TRANSIENT_STATUSES.has(response.status)) {
            lastError = new Error(message);
            continue;
          }

          throw new Error(message);
        }

        const payload = await response.json();
        const resources = parseDiscoveryPayload(payload);

        // Populate cache on success.
        _discoveryCache.data = resources;
        _discoveryCache.expiresAt = Date.now() + _discoveryCacheTtlMs;

        return resources;
      } catch (error) {
        lastError = toError(error);

        if (attempt === 0) {
          continue;
        }

        throw lastError;
      }
    }

    throw (
      lastError ??
      new Error("[CoinbaseAdapter] Failed to fetch discovery resources")
    );
  }
}
