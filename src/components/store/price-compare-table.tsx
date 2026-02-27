"use client";

import { useMemo } from "react";
import { UnifiedAgent } from "@/lib/unified-schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { ProviderBadge } from "./provider-badge";
import { AvailabilityDot } from "./availability-dot";

interface PriceCompareTableProps {
  agents: UnifiedAgent[];
  onRemove: (id: string) => void;
}

export function PriceCompareTable({
  agents,
  onRemove,
}: PriceCompareTableProps) {
  const minPrice = useMemo(() => {
    if (agents.length === 0) return null;
    return Math.min(...agents.map((a) => a.pricing.amountUsdcCents));
  }, [agents]);

  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="w-full overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">Dimension</TableHead>
            {agents.map((agent) => (
              <TableHead key={agent.id} className="min-w-[250px] align-top">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground text-lg">
                      {agent.name}
                    </div>
                    <ProviderBadge provider={agent.provider} />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(agent.id)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove</span>
                  </Button>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Description */}
          <TableRow>
            <TableCell className="font-medium text-muted-foreground">
              Description
            </TableCell>
            {agents.map((agent) => (
              <TableCell key={agent.id} className="align-top">
                <p className="text-sm line-clamp-3">{agent.description}</p>
              </TableCell>
            ))}
          </TableRow>

          {/* Pricing */}
          <TableRow>
            <TableCell className="font-medium text-muted-foreground">
              Price (USDC)
            </TableCell>
            {agents.map((agent) => {
              const priceUsdc = (agent.pricing.amountUsdcCents / 100).toFixed(
                2
              );
              const isLowest =
                agent.pricing.amountUsdcCents === minPrice && agents.length > 1;

              return (
                <TableCell key={agent.id} className="align-top">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-lg font-semibold ${isLowest ? "text-green-600 dark:text-green-500" : ""}`}
                    >
                      ${priceUsdc}
                    </span>
                    {isLowest && (
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                      >
                        Lowest
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Network:{" "}
                    <span className="capitalize">{agent.pricing.network}</span>
                  </div>
                </TableCell>
              );
            })}
          </TableRow>

          {/* Availability & Latency */}
          <TableRow>
            <TableCell className="font-medium text-muted-foreground">
              Status / Latency
            </TableCell>
            {agents.map((agent) => (
              <TableCell key={agent.id} className="align-top">
                <div className="flex items-center gap-2">
                  <AvailabilityDot
                    isOnline={agent.availability.isOnline}
                    latencyMs={agent.availability.latencyMs}
                  />
                  <span className="text-sm">
                    {agent.availability.isOnline ? "Online" : "Offline"}
                    {agent.availability.latencyMs &&
                      ` (${agent.availability.latencyMs}ms)`}
                  </span>
                </div>
              </TableCell>
            ))}
          </TableRow>

          {/* Rating */}
          <TableRow>
            <TableCell className="font-medium text-muted-foreground">
              Rating (0-5)
            </TableCell>
            {agents.map((agent) => (
              <TableCell key={agent.id} className="align-top">
                <span className="text-sm">
                  {agent.metadata?.rating !== undefined
                    ? `${agent.metadata.rating} / 5`
                    : "No rating"}
                </span>
              </TableCell>
            ))}
          </TableRow>

          {/* Category & Tags */}
          <TableRow>
            <TableCell className="font-medium text-muted-foreground">
              Category / Tags
            </TableCell>
            {agents.map((agent) => (
              <TableCell key={agent.id} className="align-top space-y-2">
                <div>
                  <Badge variant="secondary" className="text-xs">
                    {agent.category}
                  </Badge>
                </div>
                {agent.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-xs text-muted-foreground"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
