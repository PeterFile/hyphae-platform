"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useCompareStore } from "@/stores/compare-store";
import { UnifiedAgent } from "@/lib/unified-schema";
import { PriceCompareTable } from "@/components/store/price-compare-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Suspense } from "react";

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const selectedIds = useCompareStore((state) => state.selectedIds);
  const toggleAgent = useCompareStore((state) => state.toggleAgent);
  const removeAgentStore = useCompareStore((state) => state.removeAgent);

  const [agents, setAgents] = useState<UnifiedAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read ids from query on initial load or from store
  const idsParam = searchParams.get("ids");
  const initialIds = idsParam ? idsParam.split(",").filter(Boolean) : [];

  // Use `initialIds` if present in URL, otherwise fallback to `selectedIds` from store
  const idsToFetch = idsParam !== null ? initialIds : selectedIds;

  useEffect(() => {
    // If URL has ids, we ensure store has them too (optional, but good for sync)
    if (idsParam !== null && initialIds.length > 0) {
      // Sync store to URL if they differ (best effort, to support sharing URL)
      // For simplicity, we just rely on `idsToFetch` to fetch data.
    }
  }, [idsParam, initialIds]);

  useEffect(() => {
    let isMounted = true;

    async function fetchAgents() {
      if (idsToFetch.length === 0) {
        setAgents([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/store/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: idsToFetch.slice(0, 4) }),
        });

        if (!res.ok) {
          throw new Error("Failed to fetch comparison data");
        }

        const data = await res.json();
        if (isMounted) {
          setAgents(data.results || []);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : "An error occurred fetching agents.";
          setError(errorMessage);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchAgents();

    return () => {
      isMounted = false;
    };
  }, [idsToFetch]); // Re-fetch on ID change

  const handleRemove = (id: string) => {
    const parts = id.split(":");
    if (parts.length >= 2) {
      removeAgentStore(parts[0], parts.slice(1).join(":"));
    }

    // Update URL to reflect removed agent
    const newIds = idsToFetch.filter((fetchId) => fetchId !== id);
    if (newIds.length > 0) {
      router.replace(`/compare?ids=${newIds.join(",")}`);
    } else {
      router.replace("/compare"); // Empty state
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-6xl py-10 flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading comparison data...</p>
      </div>
    );
  }

  if (idsToFetch.length === 0) {
    return (
      <div className="container max-w-6xl py-20 flex flex-col items-center justify-center space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Compare Agents</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            You haven&apos;t selected any agents to compare yet. Go back to the
            store to select up to 4 agents.
          </p>
        </div>
        <Button asChild>
          <Link href="/store">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Store
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compare Agents</h1>
          <p className="text-muted-foreground">
            Comparing {agents.length} agent{agents.length !== 1 ? "s" : ""}{" "}
            side-by-side.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/store">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Store
          </Link>
        </Button>
      </div>

      {idsToFetch.length > 4 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Selection limit exceeded</AlertTitle>
          <AlertDescription>
            You can only compare up to 4 agents at a time. Only the first 4 are
            shown.
          </AlertDescription>
        </Alert>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <PriceCompareTable agents={agents} onRemove={handleRemove} />
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="container max-w-6xl py-10 flex min-h-[50vh] flex-col items-center justify-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading compare page...</p>
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
