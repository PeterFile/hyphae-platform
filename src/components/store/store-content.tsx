"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

import { useFilterStore } from "@/stores/filter-store";
import {
  useInfiniteUnifiedSearch,
  type SearchResponse,
} from "@/hooks/use-unified-search";
import { useAvailabilityBatch } from "@/hooks/use-availability";
import { AgentCard } from "@/components/store/agent-card";
import { Button } from "@/components/ui/button";
import type { FilterState } from "@/stores/filter-store";

interface StoreContentProps {
  initialData?: SearchResponse;
}

function AgentCardSkeleton() {
  return (
    <div className="h-[210px] w-full animate-pulse rounded-xl bg-muted/50 border shadow-sm">
      <div className="p-5 pb-3">
        <div className="flex gap-4">
          <div className="h-5 w-1/2 bg-muted rounded"></div>
        </div>
        <div className="h-4 w-1/4 bg-muted rounded mt-2"></div>
      </div>
      <div className="p-5 py-3 flex-1">
        <div className="h-3 w-full bg-muted rounded mb-2"></div>
        <div className="h-3 w-4/5 bg-muted rounded mb-4"></div>
        <div className="flex gap-2">
          <div className="h-4 w-12 bg-muted rounded"></div>
          <div className="h-4 w-16 bg-muted rounded"></div>
        </div>
      </div>
      <div className="p-5 pt-3 border-t">
        <div className="h-4 w-1/4 bg-muted rounded"></div>
      </div>
    </div>
  );
}

export function StoreContent({ initialData }: StoreContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    query,
    providers,
    categories,
    priceRange,
    status,
    sort,
    setQuery,
    setCategories,
    setSort,
    setAvailableCategories,
  } = useFilterStore();

  const isInitialMount = React.useRef(true);

  // Sync initial URL search params to store
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const q = searchParams.get("q");
      if (q) setQuery(q);

      const cat = searchParams.get("category");
      if (cat) setCategories([cat]);

      const sortParam = searchParams.get("sort");
      if (
        sortParam === "relevance" ||
        sortParam === "price-asc" ||
        sortParam === "price-desc" ||
        sortParam === "availability"
      ) {
        setSort(sortParam);
      }
    }
  }, [searchParams, setQuery, setCategories, setSort]);

  // Sync store changes back to URL
  React.useEffect(() => {
    if (isInitialMount.current) return;
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    if (categories.length > 0) params.set("category", categories[0]); // Only sync first category to URL for simplicity
    if (sort && sort !== "relevance") params.set("sort", sort);
    if (priceRange?.max && priceRange.max < 1000)
      params.set("maxPrice", priceRange.max.toString());

    providers.forEach((p) => params.append("provider", p));

    const newUrl = params.toString() ? `?${params.toString()}` : "/store";
    router.replace(newUrl, { scroll: false });
  }, [query, providers, categories, priceRange, sort, router]);

  // Execute infinite search
  const {
    agents: rawAgents,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteUnifiedSearch({
    q: query,
    provider: providers,
    category: categories[0],
    minPrice: priceRange?.min,
    maxPrice: priceRange?.max,
    // Provide default sort to avoid TS mismatch, sort from store maps nicely to handler exceptions
    sort:
      sort === "price-asc"
        ? "price_asc"
        : sort === "price-desc"
          ? "price_desc"
          : sort,
  });

  // Client-side filtering for properties not fully handled by backend yet
  const filteredAgents = React.useMemo(() => {
    // If no agents yet, attempt to use initialData for first render SSR consistency
    let baseAgents =
      rawAgents.length > 0 ? rawAgents : (initialData?.results ?? []);

    if (status !== "all") {
      baseAgents = baseAgents.filter((agent) =>
        status === "online"
          ? agent.availability.isOnline
          : !agent.availability.isOnline
      );
    }
    return baseAgents;
  }, [rawAgents, initialData, status]);

  // Extract unique categories from results and sync to store
  const extractedCategories = React.useMemo(() => {
    const base =
      rawAgents.length > 0 ? rawAgents : (initialData?.results ?? []);
    const cats = [...new Set(base.map((a) => a.category).filter(Boolean))];
    return cats.sort();
  }, [rawAgents, initialData]);

  // Guard with a ref to avoid triggering store updates on every render
  const prevCategoriesRef = React.useRef<string>("");
  React.useEffect(() => {
    if (extractedCategories.length === 0) return;
    const next = extractedCategories.join(",");
    if (next !== prevCategoriesRef.current) {
      prevCategoriesRef.current = next;
      setAvailableCategories(extractedCategories);
    }
  }, [extractedCategories, setAvailableCategories]);

  // Poll live availability for visible agents
  const agentIds = React.useMemo(
    () => filteredAgents.map((a) => a.id),
    [filteredAgents]
  );
  const availabilityMap = useAvailabilityBatch(agentIds);

  const displayCount =
    rawAgents.length > 0 ? totalCount : (initialData?.totalCount ?? 0);

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground whitespace-nowrap">
          {isLoading && !initialData ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching...
            </span>
          ) : (
            `Found ${displayCount} agent${displayCount === 1 ? "" : "s"}`
          )}
        </p>

        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm font-medium sr-only">
            Sort by
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as FilterState["sort"])}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="relevance">Relevance</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="availability">Availability</option>
          </select>
        </div>
      </div>

      {!isLoading && filteredAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-dashed text-foreground/70 bg-muted/20">
          <p className="text-lg font-medium mb-1">No agents found</p>
          <p className="text-sm max-w-sm mb-6">
            Try adjusting your search query or filters to find what you&apos;re
            looking for.
          </p>
          <Button
            variant="outline"
            onClick={() => useFilterStore.getState().resetAll()}
          >
            Clear All Filters
          </Button>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.05 },
            },
          }}
        >
          <AnimatePresence>
            {isLoading && filteredAgents.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <AgentCardSkeleton key={`skeleton-${i}`} />
                ))
              : filteredAgents.map((agent) => (
                  <motion.div
                    key={agent.id}
                    layout
                    variants={{
                      hidden: { opacity: 0, scale: 0.95, y: 10 },
                      show: { opacity: 1, scale: 1, y: 0 },
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <AgentCard
                      agent={agent}
                      availabilityOverride={
                        availabilityMap[agent.id]
                          ? {
                              isOnline: availabilityMap[agent.id].isOnline,
                              latencyMs: availabilityMap[agent.id].latencyMs,
                            }
                          : undefined
                      }
                    />
                  </motion.div>
                ))}
          </AnimatePresence>
        </motion.div>
      )}

      {hasNextPage && displayCount > filteredAgents.length && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full sm:w-auto min-w-[200px]"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
