import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { UnifiedAgent } from "@/lib/unified-schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProviderBadge } from "./provider-badge";
import { AvailabilityDot } from "./availability-dot";

interface AgentCardProps {
  agent: UnifiedAgent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const priceInUsdc = (agent.pricing.amountUsdcCents / 100).toFixed(2);
  const isOnline = agent.availability.isOnline;
  const latencyMs = agent.availability.latencyMs;

  return (
    <Link
      href={`/store/${agent.provider}/${encodeURIComponent(agent.originalId)}`}
      className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
    >
      <motion.div
        whileHover={{ y: -4, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="h-full"
      >
        <Card className="h-full flex flex-col transition-shadow hover:shadow-md">
          <CardHeader className="flex-none p-5 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg line-clamp-1">
                    {agent.name}
                  </CardTitle>
                  <AvailabilityDot isOnline={isOnline} latencyMs={latencyMs} />
                </div>
                <ProviderBadge provider={agent.provider} />
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-5 py-3">
            <CardDescription className="line-clamp-2 text-sm text-foreground/80 mb-4">
              {agent.description}
            </CardDescription>
            <div className="flex flex-wrap gap-1.5 mt-auto">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {agent.category}
              </Badge>
              {agent.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-muted-foreground border-border/50"
                >
                  {tag}
                </Badge>
              ))}
              {agent.tags.length > 3 && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-muted-foreground border-border/50"
                >
                  +{agent.tags.length - 3}
                </Badge>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex-none p-5 pt-3 flex items-center justify-between border-t bg-muted/20">
            <div className="text-sm font-semibold">
              ${priceInUsdc}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                USDC
              </span>
            </div>
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1 group-hover:text-primary transition-colors">
              View details &rarr;
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </Link>
  );
}
