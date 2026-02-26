import { z } from "zod";

import { CoinbaseAdapter } from "@/lib/providers/coinbase-adapter";
import { DexterAdapter } from "@/lib/providers/dexter-adapter";
import {
  AdapterRegistry,
  type SearchAllResponse,
} from "@/lib/providers/registry";
import { ThirdwebAdapter } from "@/lib/providers/thirdweb-adapter";
import {
  ProviderNameSchema,
  type ProviderName,
  type SearchFilters,
} from "@/lib/providers/types";
import { PayAIAdapter } from "@/lib/providers/payai-adapter";

const CACHE_TTL_MS = 60_000;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const SortSchema = z.enum([
  "price_asc",
  "price_desc",
  "relevance",
  "availability",
]);

const SearchQuerySchema = z
  .object({
    q: z.string().default(""),
    provider: z.array(ProviderNameSchema).min(1).optional(),
    category: z.string().optional(),
    minPrice: z.number().nonnegative().optional(),
    maxPrice: z.number().nonnegative().optional(),
    sort: SortSchema.optional(),
    page: z.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE),
  })
  .superRefine((value, context) => {
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minPrice must be less than or equal to maxPrice",
        path: ["minPrice"],
      });
    }
  });

type SearchQuery = z.infer<typeof SearchQuerySchema>;
type RegistryLike = Pick<AdapterRegistry, "searchAll">;
type SearchCacheEntry = {
  expiresAt: number;
  response: SearchAllResponse;
};

const searchCache = new Map<string, SearchCacheEntry>();

let sharedRegistry: RegistryLike | null = null;
let registryFactory: () => RegistryLike = () => createDefaultRegistry();

function parseOptionalNumberParam(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return Number.NaN;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseOptionalStringParam(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseProviderParam(
  searchParams: URLSearchParams
): string[] | undefined {
  const rawValues = searchParams.getAll("provider");
  if (rawValues.length === 0) {
    return undefined;
  }

  return rawValues
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function dedupeProviders(
  providers: ProviderName[] | undefined
): ProviderName[] | undefined {
  if (!providers || providers.length === 0) {
    return undefined;
  }

  return [...new Set(providers)].sort();
}

function parseQuery(
  request: Request
): z.SafeParseReturnType<SearchQuery, SearchQuery> {
  const searchParams = new URL(request.url).searchParams;
  const q = (searchParams.get("q") ?? "").trim();

  return SearchQuerySchema.safeParse({
    q,
    provider: parseProviderParam(searchParams),
    category: parseOptionalStringParam(searchParams.get("category")),
    minPrice: parseOptionalNumberParam(searchParams.get("minPrice")),
    maxPrice: parseOptionalNumberParam(searchParams.get("maxPrice")),
    sort: parseOptionalStringParam(searchParams.get("sort")),
    page: parseOptionalNumberParam(searchParams.get("page")),
    pageSize: parseOptionalNumberParam(searchParams.get("pageSize")),
  });
}

function toIssuePayload(issues: z.ZodIssue[]) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function buildCacheKey(query: SearchQuery): string {
  return JSON.stringify({
    q: query.q,
    provider: dedupeProviders(query.provider)?.join(",") ?? "",
    category: query.category ?? "",
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
    sort: query.sort ?? "relevance",
  });
}

function buildFilters(query: SearchQuery): SearchFilters {
  const providers = dedupeProviders(query.provider);
  const filters: SearchFilters = {};

  if (providers !== undefined) {
    filters.provider = providers;
  }

  if (query.category !== undefined) {
    filters.category = query.category;
  }

  if (query.minPrice !== undefined) {
    filters.minPrice = query.minPrice;
  }

  if (query.maxPrice !== undefined) {
    filters.maxPrice = query.maxPrice;
  }

  if (query.sort !== undefined) {
    filters.sort = query.sort;
  }

  return filters;
}

function paginate<T>(results: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return results.slice(start, start + pageSize);
}

function cleanupExpiredCacheEntries(now: number): void {
  for (const [key, entry] of searchCache.entries()) {
    if (entry.expiresAt <= now) {
      searchCache.delete(key);
    }
  }
}

function getRegistry(): RegistryLike {
  if (sharedRegistry === null) {
    sharedRegistry = registryFactory();
  }

  return sharedRegistry;
}

function createDefaultRegistry(): AdapterRegistry {
  return new AdapterRegistry({
    adapters: [
      new CoinbaseAdapter(),
      new ThirdwebAdapter(),
      new DexterAdapter(),
      new PayAIAdapter(),
    ],
  });
}

export function __setRegistryFactoryForTests(
  factory: () => RegistryLike
): void {
  registryFactory = factory;
  sharedRegistry = null;
}

export function __resetSearchRouteStateForTests(): void {
  registryFactory = () => createDefaultRegistry();
  sharedRegistry = null;
  searchCache.clear();
}

export async function GET(request: Request): Promise<Response> {
  const parsedQuery = parseQuery(request);

  if (!parsedQuery.success) {
    return Response.json(
      {
        error: "Invalid query parameters",
        issues: toIssuePayload(parsedQuery.error.issues),
      },
      { status: 422 }
    );
  }

  const query = parsedQuery.data;
  const now = Date.now();
  cleanupExpiredCacheEntries(now);

  const cacheKey = buildCacheKey(query);
  const cachedEntry = searchCache.get(cacheKey);
  let aggregated: SearchAllResponse;

  if (cachedEntry && cachedEntry.expiresAt > now) {
    aggregated = cachedEntry.response;
  } else {
    aggregated = await getRegistry().searchAll(query.q, buildFilters(query));
    searchCache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      response: aggregated,
    });
  }

  const totalCount = aggregated.results.length;
  const paginatedResults = paginate(
    aggregated.results,
    query.page,
    query.pageSize
  );

  if (totalCount === 0 && aggregated.errors.length > 0) {
    return Response.json(
      {
        error: "All upstream providers failed",
        results: [],
        totalCount,
        page: query.page,
        pageSize: query.pageSize,
        errors: aggregated.errors,
      },
      { status: 500 }
    );
  }

  return Response.json(
    {
      results: paginatedResults,
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
      errors: aggregated.errors,
    },
    { status: 200 }
  );
}
