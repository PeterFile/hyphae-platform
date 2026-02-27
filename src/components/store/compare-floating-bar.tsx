"use client";

import { useCompareStore } from "@/stores/compare-store";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function CompareFloatingBar() {
  const selectedIds = useCompareStore((state) => state.selectedIds);
  const clear = useCompareStore((state) => state.clear);
  const router = useRouter();

  if (selectedIds.length === 0) {
    return null;
  }

  const handleCompare = () => {
    const query = new URLSearchParams({ ids: selectedIds.join(",") });
    router.push(`/compare?${query.toString()}`);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5">
      <div className="bg-background/80 backdrop-blur-md border shadow-lg rounded-full px-4 py-3 flex items-center gap-4">
        <div className="text-sm font-medium">
          <span className="text-primary">{selectedIds.length}</span>/4 Selected
        </div>
        <div className="h-4 w-[1px] bg-border" />
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
        <Button size="sm" onClick={handleCompare}>
          Compare Now
        </Button>
      </div>
    </div>
  );
}
