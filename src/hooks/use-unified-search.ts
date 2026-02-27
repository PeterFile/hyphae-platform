import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";

import type { ProviderError, SearchFilters } from "@/lib/providers/types";
import type { UnifiedAgent } from "@/lib/unified-schema";

export type SearchResponse = {
  results: UnifiedAgent[];
  totalCount: number;
  page: number;
  pageSize: number;
  errors: ProviderError[];
};

function buildSearchParams(filters: SearchFilters): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q) searchParams.set("q", filters.q);
  if (filters.category) searchParams.set("category", filters.category);
  if (filters.minPrice !== undefined)
    searchParams.set("minPrice", filters.minPrice.toString());
  if (filters.maxPrice !== undefined)
    searchParams.set("maxPrice", filters.maxPrice.toString());
  if (filters.sort) searchParams.set("sort", filters.sort);
  if (filters.page) searchParams.set("page", filters.page.toString());
  if (filters.pageSize)
    searchParams.set("pageSize", filters.pageSize.toString());

  if (filters.provider) {
    if (Array.isArray(filters.provider)) {
      filters.provider.forEach((p) => searchParams.append("provider", p));
    } else {
      searchParams.append("provider", filters.provider);
    }
  }

  return searchParams;
}

export function useUnifiedSearch(filters: SearchFilters = {}) {
  const query = useQuery({
    queryKey: [
      "store",
      "search",
      {
        q: filters.q,
        provider: filters.provider,
        category: filters.category,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        sort: filters.sort,
        page: filters.page,
      },
    ],
    queryFn: async () => {
      const searchParams = buildSearchParams(filters);
      const res = await fetch(`/api/store/search?${searchParams.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch search results");
      }
      return res.json() as Promise<SearchResponse>;
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return {
    agents: query.data?.results ?? [],
    totalCount: query.data?.totalCount ?? 0,
    errors: query.data?.errors ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    fetchNextPage: () => {
      console.warn(
        "fetchNextPage is a no-op in useUnifiedSearch. Use useInfiniteUnifiedSearch for infinite scrolling."
      );
    },
  };
}

export function useInfiniteUnifiedSearch(
  filters: Omit<SearchFilters, "page"> = {}
) {
  const query = useInfiniteQuery({
    queryKey: [
      "store",
      "search",
      "infinite",
      {
        q: filters.q,
        provider: filters.provider,
        category: filters.category,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        sort: filters.sort,
      },
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const searchParams = buildSearchParams({
        ...filters,
        page: pageParam as number,
      });
      const res = await fetch(`/api/store/search?${searchParams.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch search results");
      }
      return res.json() as Promise<SearchResponse>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loadedCount = lastPage.page * lastPage.pageSize;
      if (loadedCount >= lastPage.totalCount) {
        return undefined;
      }
      return lastPage.page + 1;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const agents = query.data?.pages.flatMap((page) => page.results) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;
  const errors = query.data?.pages.flatMap((page) => page.errors) ?? [];

  return {
    agents,
    totalCount,
    errors,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
