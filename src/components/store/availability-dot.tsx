import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AvailabilityDotProps {
  isOnline: boolean;
  latencyMs?: number;
  className?: string;
}

export function AvailabilityDot({
  isOnline,
  latencyMs,
  className,
}: AvailabilityDotProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative flex h-3 w-3 items-center justify-center",
              className
            )}
          >
            {isOnline ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
              </>
            ) : (
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {isOnline ? "Online" : "Offline"}
            {isOnline && latencyMs !== undefined && ` (${latencyMs}ms)`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
