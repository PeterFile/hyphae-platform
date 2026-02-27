import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderName } from "@/lib/providers/types";

export interface FilterState {
  query: string;
  providers: ProviderName[];
  categories: string[];
  priceRange: { min: number; max: number } | null;
  status: "all" | "online" | "offline";
  sort: "relevance" | "price-asc" | "price-desc" | "availability";
  page: number;
}

export interface FilterActions {
  setQuery: (query: string) => void;
  toggleProvider: (provider: ProviderName) => void;
  setCategories: (categories: string[]) => void;
  setPriceRange: (range: { min: number; max: number } | null) => void;
  setStatus: (status: FilterState["status"]) => void;
  setSort: (sort: FilterState["sort"]) => void;
  setPage: (page: number) => void;
  nextPage: () => void;
  resetAll: () => void;
}

export type FilterStore = FilterState & FilterActions;

const defaultProviders: ProviderName[] = [
  "coinbase",
  "thirdweb",
  "dexter",
  "payai",
];

const initialState: FilterState = {
  query: "",
  providers: defaultProviders,
  categories: [],
  priceRange: null,
  status: "all",
  sort: "relevance",
  page: 1,
};

export const useFilterStore = create<FilterStore>()(
  persist(
    (set) => ({
      ...initialState,
      setQuery: (query) => set({ query, page: 1 }),
      toggleProvider: (provider) =>
        set((state) => {
          const isSelected = state.providers.includes(provider);
          const newProviders = isSelected
            ? state.providers.filter((p) => p !== provider)
            : [...state.providers, provider];
          return { providers: newProviders, page: 1 };
        }),
      setCategories: (categories) => set({ categories, page: 1 }),
      setPriceRange: (priceRange) => set({ priceRange, page: 1 }),
      setStatus: (status) => set({ status, page: 1 }),
      setSort: (sort) => set({ sort, page: 1 }),
      setPage: (page) => set({ page }),
      nextPage: () => set((state) => ({ page: state.page + 1 })),
      resetAll: () => set(initialState),
    }),
    {
      name: "filter-store",
      partialize: (state) => ({
        providers: state.providers,
        priceRange: state.priceRange,
        status: state.status,
        sort: state.sort,
      }),
    }
  )
);
