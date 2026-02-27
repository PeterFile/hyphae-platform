"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useFilterStore } from "@/stores/filter-store";
import type { FilterState } from "@/stores/filter-store";

const DEBOUNCE_MS = 200;

type SyncableKeys = Pick<
  FilterState,
  "query" | "page" | "status" | "sort" | "categories" | "priceRange"
>;

/** Serialize store state → URLSearchParams. Omits default / empty values for clean URLs. */
function toSearchParams(state: SyncableKeys): URLSearchParams {
  const p = new URLSearchParams();
  if (state.query) p.set("q", state.query);
  if (state.page > 1) p.set("page", String(state.page));
  if (state.status !== "all") p.set("status", state.status);
  if (state.sort !== "relevance") p.set("sort", state.sort);
  if (state.categories.length > 0)
    p.set("categories", state.categories.join(","));
  if (state.priceRange) {
    p.set("priceMin", String(state.priceRange.min));
    p.set("priceMax", String(state.priceRange.max));
  }
  return p;
}

/** Parse URLSearchParams → partial FilterState for initial hydration. */
function fromSearchParams(params: URLSearchParams): Partial<SyncableKeys> {
  const patch: Partial<SyncableKeys> = {};

  const q = params.get("q");
  if (q !== null) patch.query = q;

  const page = params.get("page");
  if (page !== null) {
    const n = parseInt(page, 10);
    if (!isNaN(n) && n >= 1) patch.page = n;
  }

  const status = params.get("status");
  if (status === "online" || status === "offline") patch.status = status;

  const sort = params.get("sort");
  if (
    sort === "price-asc" ||
    sort === "price-desc" ||
    sort === "availability" ||
    sort === "relevance"
  )
    patch.sort = sort;

  const categories = params.get("categories");
  if (categories) patch.categories = categories.split(",").filter(Boolean);

  const priceMin = params.get("priceMin");
  const priceMax = params.get("priceMax");
  if (priceMin !== null && priceMax !== null) {
    const min = parseFloat(priceMin);
    const max = parseFloat(priceMax);
    if (!isNaN(min) && !isNaN(max)) patch.priceRange = { min, max };
  }

  return patch;
}

/**
 * Bidirectional URL ↔ Zustand filter store sync.
 *
 * - On mount: URL params take priority over LocalStorage persisted state.
 * - On state change: debounce-push updates to URL via shallow router.replace().
 *
 * Mount this hook once near the root of each page/layout that hosts filters.
 */
export function useFilterUrlSync(): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const store = useFilterStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevent re-entrant URL writes triggered by the initial URL→Store hydration
  const isHydratingRef = useRef(false);

  // Phase 1: on mount, hydrate store from URL params (URL > LocalStorage)
  useEffect(() => {
    const patch = fromSearchParams(searchParams);
    if (Object.keys(patch).length === 0) return;

    isHydratingRef.current = true;
    const s = useFilterStore.getState();

    if (patch.query !== undefined) s.setQuery(patch.query);
    if (patch.page !== undefined) s.setPage(patch.page);
    if (patch.status !== undefined) s.setStatus(patch.status);
    if (patch.sort !== undefined) s.setSort(patch.sort);
    if (patch.categories !== undefined) s.setCategories(patch.categories);
    if (patch.priceRange !== undefined) s.setPriceRange(patch.priceRange);

    // Allow URL-sync writes again after this tick settles
    requestAnimationFrame(() => {
      isHydratingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // Phase 2: subscribe to store changes and push to URL
  useEffect(() => {
    const unsubscribe = useFilterStore.subscribe((state) => {
      if (isHydratingRef.current) return;

      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        const params = toSearchParams(state);
        const newSearch = params.toString();
        const currentSearch = new URLSearchParams(
          window.location.search
        ).toString();

        if (newSearch !== currentSearch) {
          const url = newSearch ? `${pathname}?${newSearch}` : pathname;
          router.replace(url, { scroll: false });
        }
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname, router]);
}
