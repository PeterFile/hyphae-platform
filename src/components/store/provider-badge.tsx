import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { ProviderName } from "@/lib/providers/types";
import { Box, Coins, Hexagon, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderBadgeProps {
  provider: ProviderName;
  className?: string;
}

export function ProviderBadge({ provider, className }: ProviderBadgeProps) {
  let colorClass = "";
  let Icon = Box;

  switch (provider) {
    case "coinbase":
      colorClass =
        "bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
      Icon = Coins;
      break;
    case "thirdweb":
      colorClass =
        "bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800";
      Icon = Hexagon;
      break;
    case "dexter":
      colorClass =
        "bg-green-100 text-green-800 hover:bg-green-200 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
      Icon = Box;
      break;
    case "payai":
      colorClass =
        "bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800";
      Icon = Wallet;
      break;
  }

  const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 px-1.5 py-0.5", colorClass, className)}
    >
      <Icon className="h-3 w-3" />
      <span className="text-[10px] font-medium leading-none">
        {displayName}
      </span>
    </Badge>
  );
}
