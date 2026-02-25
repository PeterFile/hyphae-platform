import { z } from "zod";

import { checkEndpoint } from "@/lib/availability-checker";
import { normalizeToUsdcCents } from "@/lib/price-normalizer";
import { UnifiedAgentSchema, type UnifiedAgent } from "@/lib/unified-schema";

import type {
  AvailabilityResult,
  ProviderAdapter,
  ProviderAgent,
  SearchFilters,
} from "./types";

const DEFAULT_DEXTER_API_URL =
  "https://api.dexter.cash/api/facilitator/marketplace/resources";
const FALLBACK_NOTE =
  "Coming Soon: Dexter API unavailable, returning mock fallback data.";
const ISO_DATETIME_SCHEMA = z.string().datetime({ offset: true });

const DexterResourceSchema = z
  .object({
    resourceUrl: z.string().url(),
    displayName: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    method: z.enum(["GET", "POST"]).nullable().optional(),
    priceAtomic: z.string().nullable().optional(),
    priceUsdc: z.number().nonnegative().nullable().optional(),
    priceAsset: z.string().nullable().optional(),
    priceNetwork: z.string().nullable().optional(),
    totalSettlements: z.number().int().nonnegative().nullable().optional(),
    qualityScore: z.number().min(0).max(100).nullable().optional(),
    verificationStatus: z.string().nullable().optional(),
    lastVerifiedAt: z.string().datetime({ offset: true }).nullable().optional(),
    lastSettlementAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
    seller: z
      .object({
        displayName: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const DexterMarketplaceResponseSchema = z
  .object({
    ok: z.boolean(),
    resources: z.array(DexterResourceSchema),
  })
  .passthrough();

type DexterMarketplaceResource = z.infer<typeof DexterResourceSchema>;
type DexterDataSource = "api" | "mock-fallback";
type NormalizationContext = {
  source: DexterDataSource;
  note?: string;
};

const MOCK_DEXTER_RESOURCES: DexterMarketplaceResource[] = [
  {
    resourceUrl: "https://dexter.cash/coming-soon/mock-marketplace-resource",
    displayName: "Dexter Marketplace Listing",
    description:
      "Coming Soon: Dexter marketplace integration is temporarily using mock data.",
    category: "General",
    method: "POST",
    priceAtomic: "50000",
    priceUsdc: 0.05,
    priceAsset: "USDC",
    priceNetwork: "solana",
    totalSettlements: 0,
    qualityScore: 0,
    verificationStatus: "inconclusive",
    lastVerifiedAt: "2026-02-25T00:00:00.000Z",
  },
];

function buildOriginalId(resourceUrl: string): string {
  return encodeURIComponent(resourceUrl);
}

function parseDexterUnifiedId(id: string): string | null {
  if (!id.startsWith("dexter:")) {
    return null;
  }

  const originalId = id.slice("dexter:".length).trim();

  if (originalId.length === 0) {
    return null;
  }

  return originalId;
}

function getIsoDatetimeOrUndefined(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    if (ISO_DATETIME_SCHEMA.safeParse(value).success) {
      return value;
    }
  }

  return undefined;
}

function normalizeMethod(method: string | null | undefined): "GET" | "POST" {
  if (method === "GET" || method === "POST") {
    return method;
  }

  return "POST";
}

function normalizeRating(score: number | null | undefined): number | undefined {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return undefined;
  }

  const clamped = Math.max(0, Math.min(100, score));
  return Math.round((clamped / 20) * 10) / 10;
}

function isPositiveInteger(value: number | undefined): value is number {
  if (typeof value !== "number") {
    return false;
  }

  if (!Number.isFinite(value)) {
    return false;
  }

  if (value <= 0) {
    return false;
  }

  return Number.isInteger(value);
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeQuery(
  query: string,
  filterQuery: string | null | undefined
): string {
  if (hasText(query)) {
    return query.trim().toLowerCase();
  }

  if (hasText(filterQuery)) {
    return filterQuery.trim().toLowerCase();
  }

  return "";
}

function matchesProviderFilter(
  providerFilter: SearchFilters["provider"]
): boolean {
  if (!providerFilter) {
    return true;
  }

  if (Array.isArray(providerFilter)) {
    return providerFilter.includes("dexter");
  }

  return providerFilter === "dexter";
}

export class DexterAdapter implements ProviderAdapter {
  public readonly name = "dexter" as const;

  private readonly apiUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(options?: {
    apiUrl?: string;
    fetchFn?: typeof fetch;
    now?: () => Date;
  }) {
    this.apiUrl =
      options?.apiUrl ?? process.env.DEXTER_API_URL ?? DEFAULT_DEXTER_API_URL;
    this.fetchFn = options?.fetchFn ?? fetch;
    this.now = options?.now ?? (() => new Date());
  }

  public async search(
    query: string,
    filters?: SearchFilters
  ): Promise<ProviderAgent[]> {
    if (!matchesProviderFilter(filters?.provider)) {
      return [];
    }

    const { resources, source, note } = await this.fetchResourcesBestEffort();
    const normalizedAgents = resources.map((resource) =>
      this.normalize(resource, { source, note })
    );

    const filteredAgents = this.applyFilters(
      normalizedAgents,
      normalizeQuery(query, filters?.q),
      filters
    );

    return filteredAgents.map((agent) => ({
      provider: "dexter",
      agent,
    }));
  }

  public async getById(id: string): Promise<ProviderAgent | null> {
    const originalId = parseDexterUnifiedId(id);

    if (!originalId) {
      return null;
    }

    const { resources, source, note } = await this.fetchResourcesBestEffort();
    const matchedResource = resources.find(
      (resource) => buildOriginalId(resource.resourceUrl) === originalId
    );

    if (!matchedResource) {
      return null;
    }

    return {
      provider: "dexter",
      agent: this.normalize(matchedResource, { source, note }),
    };
  }

  public async checkAvailability(
    endpointUrl: string
  ): Promise<AvailabilityResult> {
    const checked = await checkEndpoint(endpointUrl);

    return {
      isOnline: checked.isOnline,
      latencyMs: checked.latencyMs,
      lastChecked: checked.lastChecked,
      statusCode: checked.statusCode ?? 0,
    };
  }

  public normalize(
    resource: DexterMarketplaceResource,
    context: NormalizationContext = { source: "api" }
  ): UnifiedAgent {
    const originalId = buildOriginalId(resource.resourceUrl);
    const unifiedId = `dexter:${originalId}`;
    const price = this.normalizePrice(resource);
    const nowIso = this.now().toISOString();
    const lastChecked =
      getIsoDatetimeOrUndefined(
        resource.lastVerifiedAt,
        resource.lastSettlementAt
      ) ?? nowIso;
    const registeredAt = getIsoDatetimeOrUndefined(
      resource.lastVerifiedAt,
      resource.lastSettlementAt
    );
    const metadataNote =
      context.source === "mock-fallback"
        ? (context.note ?? FALLBACK_NOTE)
        : undefined;

    return UnifiedAgentSchema.parse({
      id: unifiedId,
      provider: "dexter",
      originalId,
      name: hasText(resource.displayName)
        ? resource.displayName.trim()
        : "Dexter Marketplace Listing",
      description: hasText(resource.description)
        ? resource.description.trim()
        : (metadataNote ?? "No description provided."),
      category: hasText(resource.category)
        ? resource.category.trim()
        : "General",
      tags:
        context.source === "mock-fallback"
          ? ["coming-soon", "mock-fallback"]
          : [],
      endpoint: {
        url: resource.resourceUrl,
        method: normalizeMethod(resource.method),
      },
      pricing: price,
      availability: {
        isOnline: resource.verificationStatus?.toLowerCase() === "pass",
        lastChecked,
        statusCode:
          resource.verificationStatus?.toLowerCase() === "pass" ? 200 : 503,
      },
      metadata: {
        registeredAt,
        totalCalls:
          typeof resource.totalSettlements === "number"
            ? resource.totalSettlements
            : undefined,
        rating: normalizeRating(resource.qualityScore),
        source: context.source,
        note: metadataNote,
        comingSoon: context.source === "mock-fallback" ? true : undefined,
      },
    });
  }

  private applyFilters(
    agents: UnifiedAgent[],
    query: string,
    filters?: SearchFilters
  ): UnifiedAgent[] {
    let filtered = agents;

    if (query.length > 0) {
      filtered = filtered.filter((agent) => {
        const fields = [
          agent.name,
          agent.description,
          agent.category,
          agent.endpoint.url,
        ];

        return fields.some((field) => field.toLowerCase().includes(query));
      });
    }

    if (hasText(filters?.category)) {
      const normalizedCategory = filters?.category?.trim().toLowerCase();
      filtered = filtered.filter(
        (agent) => agent.category.toLowerCase() === normalizedCategory
      );
    }

    const minPrice = filters?.minPrice;
    if (typeof minPrice === "number") {
      filtered = filtered.filter(
        (agent) => agent.pricing.amountUsdcCents >= minPrice
      );
    }

    const maxPrice = filters?.maxPrice;
    if (typeof maxPrice === "number") {
      filtered = filtered.filter(
        (agent) => agent.pricing.amountUsdcCents <= maxPrice
      );
    }

    const sorted = [...filtered];

    if (filters?.sort === "price_asc") {
      sorted.sort(
        (a, b) => a.pricing.amountUsdcCents - b.pricing.amountUsdcCents
      );
    }

    if (filters?.sort === "price_desc") {
      sorted.sort(
        (a, b) => b.pricing.amountUsdcCents - a.pricing.amountUsdcCents
      );
    }

    if (filters?.sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (filters?.sort === "rating") {
      sorted.sort(
        (a, b) => (b.metadata?.rating ?? 0) - (a.metadata?.rating ?? 0)
      );
    }

    if (
      !isPositiveInteger(filters?.page) ||
      !isPositiveInteger(filters?.pageSize)
    ) {
      return sorted;
    }

    const start = (filters.page - 1) * filters.pageSize;
    return sorted.slice(start, start + filters.pageSize);
  }

  private normalizePrice(
    resource: DexterMarketplaceResource
  ): UnifiedAgent["pricing"] {
    const rawAmount = this.getRawAmount(
      resource.priceAtomic,
      resource.priceUsdc
    );
    const rawAsset = hasText(resource.priceAsset)
      ? resource.priceAsset.trim()
      : "USDC";
    const network = hasText(resource.priceNetwork)
      ? resource.priceNetwork.trim()
      : "solana";

    if (
      typeof resource.priceUsdc === "number" &&
      Number.isFinite(resource.priceUsdc)
    ) {
      return {
        amountUsdcCents: Math.max(0, Math.round(resource.priceUsdc * 100)),
        rawAmount,
        rawAsset,
        network,
      };
    }

    const normalized = normalizeToUsdcCents(rawAmount, rawAsset, network);

    return {
      amountUsdcCents: normalized.priceUnavailable
        ? 0
        : normalized.amountUsdcCents,
      rawAmount,
      rawAsset,
      network,
    };
  }

  private getRawAmount(
    priceAtomic: string | null | undefined,
    priceUsdc: number | null | undefined
  ): string {
    if (typeof priceAtomic === "string" && /^\d+$/.test(priceAtomic)) {
      return priceAtomic;
    }

    if (
      typeof priceUsdc === "number" &&
      Number.isFinite(priceUsdc) &&
      priceUsdc >= 0
    ) {
      return Math.round(priceUsdc * 1_000_000).toString();
    }

    return "0";
  }

  private async fetchResourcesBestEffort(): Promise<{
    resources: DexterMarketplaceResource[];
    source: DexterDataSource;
    note?: string;
  }> {
    try {
      const resources = await this.fetchResourcesWithRetry();
      return { resources, source: "api" };
    } catch {
      return {
        resources: MOCK_DEXTER_RESOURCES,
        source: "mock-fallback",
        note: FALLBACK_NOTE,
      };
    }
  }

  private async fetchResourcesWithRetry(): Promise<
    DexterMarketplaceResource[]
  > {
    try {
      return await this.fetchResources();
    } catch {
      return this.fetchResources();
    }
  }

  private async fetchResources(): Promise<DexterMarketplaceResource[]> {
    const response = await this.fetchFn(this.apiUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Dexter API request failed with status ${response.status}`
      );
    }

    const payload = await response.json();
    const parsed = DexterMarketplaceResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw new Error("Dexter API response is invalid");
    }

    return parsed.data.resources;
  }
}

export const dexterApiDefaults = {
  apiUrl: DEFAULT_DEXTER_API_URL,
};
