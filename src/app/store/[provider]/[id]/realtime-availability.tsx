"use client";

import { useEffect, useState } from "react";
import { useAvailability } from "@/hooks/use-availability";
import { AvailabilityDot } from "@/components/store/availability-dot";
import type { UnifiedAgent } from "@/lib/unified-schema";

interface RealtimeAvailabilityProps {
  agent: UnifiedAgent;
}

export function RealtimeAvailability({ agent }: RealtimeAvailabilityProps) {
  const { isOnline, latencyMs, lastChecked } = useAvailability(agent.id);
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (lastChecked) {
      setHasFetched(true);
    }
  }, [lastChecked]);

  const displayOnline = hasFetched ? isOnline : agent.availability.isOnline;
  const displayLatency = hasFetched
    ? latencyMs
    : (agent.availability.latencyMs ?? 0);

  return (
    <AvailabilityDot isOnline={displayOnline} latencyMs={displayLatency} />
  );
}
