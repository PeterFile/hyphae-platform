"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useFilterStore } from "@/stores/filter-store";
import { cn } from "@/lib/utils";

export function SearchBar({ className }: { className?: string }) {
  const query = useFilterStore((state) => state.query);
  const setQuery = useFilterStore((state) => state.setQuery);

  const [localQuery, setLocalQuery] = React.useState(query);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync to store with generic debounce
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(localQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery, setQuery]);

  // If global query resets (e.g. from Clear All), update local
  React.useEffect(() => {
    if (query === "" && localQuery !== "") {
      setLocalQuery("");
    }
  }, [query, localQuery]);

  // Shortcut to focus search bar
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault(); // prevent writing '/' immediately
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleClear = () => {
    setLocalQuery("");
    setQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setQuery(localQuery); // Immediate search on Enter
    }
  };

  return (
    <div
      className={cn("relative flex w-full max-w-2xl items-center", className)}
    >
      <Search className="absolute left-3 h-5 w-5 text-muted-foreground" />
      <Input
        ref={inputRef}
        placeholder="Search agents across all providers... (Press '/')"
        className="h-12 w-full rounded-2xl bg-white/5 pl-10 pr-10 text-base shadow-sm backdrop-blur-md outline-none border border-white/20 transition-colors placeholder:text-muted-foreground/50 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {localQuery && (
        <button
          onClick={handleClear}
          className="absolute right-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
