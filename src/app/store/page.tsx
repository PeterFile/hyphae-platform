import * as React from "react";
import { Suspense } from "react";
import { type Metadata } from "next";
import { headers } from "next/headers";
import { FilterPanel } from "@/components/store/filter-panel";
import { SearchBar } from "@/components/store/search-bar";
import { StoreContent } from "@/components/store/store-content";
import { SearchResponse } from "@/hooks/use-unified-search";

export const metadata: Metadata = {
  title: "Hyphae Store | Discover AI Agents",
  description:
    "Search and discover thousands of AI Agents across multiple compute providers in the Hyphae ecosystem.",
  openGraph: {
    title: "Hyphae Store | Discover AI Agents",
    description:
      "Search and discover thousands of AI Agents across multiple compute providers in the Hyphae ecosystem.",
  },
};

async function getInitialSearchData(searchParams: {
  [key: string]: string | string[] | undefined;
}): Promise<SearchResponse | undefined> {
  try {
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = process.env.NODE_ENV === "development" ? "http" : "https";

    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q as string);
    if (searchParams.category)
      params.set("category", searchParams.category as string);
    if (searchParams.sort) params.set("sort", searchParams.sort as string);

    // Filter store defines default providers: coinbase, thirdweb, dexter, payai
    // Only fetch default if non provided
    if (searchParams.provider) {
      const providers = Array.isArray(searchParams.provider)
        ? searchParams.provider
        : [searchParams.provider];
      providers.forEach((p) => params.append("provider", p));
    } else {
      params.append("provider", "coinbase");
      params.append("provider", "thirdweb");
      params.append("provider", "dexter");
      params.append("provider", "payai");
    }

    const res = await fetch(
      `${protocol}://${host}/api/store/search?${params.toString()}`,
      {
        next: { revalidate: 60 }, // Cache search for 60 seconds
      }
    );

    if (!res.ok) {
      console.error(`Store SSR fetch failed with ${res.status}`);
      return undefined;
    }

    return (await res.json()) as SearchResponse;
  } catch (err) {
    console.error("Store SSR error:", err);
    return undefined;
  }
}

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const initialData = await getInitialSearchData(resolvedSearchParams);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background relative overflow-hidden">
      {/* Background Decorators */}
      <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-br from-primary/5 via-transparent to-transparent -z-10 pointer-events-none" />
      <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full -z-10 pointer-events-none translate-x-1/2 translate-y-1/2" />

      <main className="container max-w-screen-2xl mx-auto flex-1 px-4 py-8 md:py-12">
        {/* Header Area */}
        <section className="flex flex-col items-center mb-10 space-y-6 text-center">
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight">
            Discover Agents
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground font-medium">
            Search across thousands of verified AI agents from different
            providers to find exactly what you need.
          </p>
          <div className="w-full max-w-3xl flex justify-center sticky top-20 z-10 p-2">
            <SearchBar className="bg-background/40 shadow shadow-primary/5 border border-border/80" />
          </div>
        </section>

        {/* Content Area */}
        <section className="flex flex-col md:flex-row items-start gap-8 lg:gap-12 w-full max-w-7xl mx-auto relative">
          <FilterPanel className="hidden md:flex sticky top-36 overflow-y-auto max-h-[calc(100vh-10rem)] p-1 scrollbar-hide" />

          {/* Mobile Filter Trigger could be here optionally, but layout keeps it simple for now based on issue requirements. */}

          <div className="flex-1 w-full min-w-0">
            <Suspense
              fallback={
                <div className="flex justify-center p-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              }
            >
              <StoreContent initialData={initialData} />
            </Suspense>
          </div>
        </section>
      </main>
    </div>
  );
}
