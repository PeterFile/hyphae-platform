"use client";

import * as React from "react";
import { useFilterStore } from "@/stores/filter-store";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import type { ProviderName } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

const PROVIDERS: { id: ProviderName; label: string }[] = [
  { id: "coinbase", label: "Coinbase" },
  { id: "thirdweb", label: "Thirdweb" },
  { id: "dexter", label: "Dexter" },
  { id: "payai", label: "PayAI" },
];

export function FilterPanel({ className }: { className?: string }) {
  const {
    providers,
    categories,
    availableCategories,
    priceRange,
    status,
    toggleProvider,
    setCategories,
    setPriceRange,
    setStatus,
    resetAll,
  } = useFilterStore();

  const handleCategoryToggle = (cat: string) => {
    if (categories.includes(cat)) {
      setCategories(categories.filter((c) => c !== cat));
    } else {
      setCategories([...categories, cat]);
    }
  };

  const handlePriceChange = (value: number[]) => {
    // Value represents max price right now, assuming 0 to 1000 range.
    setPriceRange({ min: 0, max: value[0] });
  };

  return (
    <aside
      className={cn("w-full md:w-64 shrink-0 flex flex-col gap-6", className)}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Filters</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetAll}
          className="h-8 text-muted-foreground hover:text-foreground hover:bg-transparent px-0 underline underline-offset-4"
        >
          Clear All
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-medium leading-none">Providers</h3>
        <div className="flex flex-col gap-2.5">
          {PROVIDERS.map((p) => (
            <div key={p.id} className="flex items-center space-x-2">
              <Checkbox
                id={`provider-${p.id}`}
                checked={providers.includes(p.id)}
                onCheckedChange={() => toggleProvider(p.id)}
              />
              <Label
                htmlFor={`provider-${p.id}`}
                className="text-sm cursor-pointer select-none leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {p.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-medium leading-none">Categories</h3>
        <div className="flex flex-col gap-2.5">
          {availableCategories.map((cat) => (
            <div key={cat} className="flex items-center space-x-2">
              <Checkbox
                id={`cat-${cat}`}
                checked={categories.includes(cat)}
                onCheckedChange={() => handleCategoryToggle(cat)}
              />
              <Label
                htmlFor={`cat-${cat}`}
                className="text-sm cursor-pointer select-none leading-none"
              >
                {cat}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium leading-none">Max Price (USDC)</h3>
          <span className="text-xs text-muted-foreground">
            {priceRange?.max ? `< $${priceRange.max}` : "Any"}
          </span>
        </div>
        <Slider
          defaultValue={[1000]}
          max={1000}
          step={10}
          value={[priceRange?.max ?? 1000]}
          onValueChange={handlePriceChange}
          className="w-full"
        />
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-medium leading-none">Status</h3>
        <div className="flex flex-col gap-2.5">
          {["all", "online", "offline"].map((s) => (
            <div key={s} className="flex items-center space-x-2">
              <Checkbox
                id={`status-${s}`}
                checked={status === s}
                onCheckedChange={() =>
                  setStatus(s as "all" | "online" | "offline")
                }
              />
              <Label
                htmlFor={`status-${s}`}
                className="text-sm cursor-pointer capitalize select-none leading-none"
              >
                {s}
              </Label>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
