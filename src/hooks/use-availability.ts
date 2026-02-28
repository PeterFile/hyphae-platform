import { useQueries, useQuery } from "@tanstack/react-query";

export type AvailabilityResponse = {
  isOnline: boolean;
  latencyMs: number;
  lastChecked: string;
};

function buildAvailabilityUrl(id: string, endpointUrl?: string): string {
  const params = new URLSearchParams({ id });
  if (endpointUrl) params.set("endpointUrl", endpointUrl);
  return `/api/store/availability?${params.toString()}`;
}

export function useAvailability(agentId: string, endpointUrl?: string) {
  const query = useQuery({
    queryKey: ["store", "availability", agentId],
    queryFn: async () => {
      const res = await fetch(buildAvailabilityUrl(agentId, endpointUrl));
      if (!res.ok) {
        throw new Error("Failed to fetch availability");
      }
      return res.json() as Promise<AvailabilityResponse>;
    },
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
    enabled: Boolean(agentId),
  });

  return {
    isOnline: query.data?.isOnline ?? false,
    latencyMs: query.data?.latencyMs ?? 0,
    lastChecked: query.data?.lastChecked ?? null,
    isChecking: query.isLoading || query.isFetching,
    error: query.error,
  };
}

type AgentRef = { id: string; endpointUrl?: string };

export function useAvailabilityBatch(agents: AgentRef[] | string[]) {
  // Normalise string[] → AgentRef[] for backward compatibility
  const normalised: AgentRef[] = agents.map((a) =>
    typeof a === "string" ? { id: a } : a
  );

  const queries = useQueries({
    queries: normalised.map(({ id, endpointUrl }) => ({
      queryKey: ["store", "availability", id],
      queryFn: async () => {
        const res = await fetch(buildAvailabilityUrl(id, endpointUrl));
        if (!res.ok) {
          throw new Error("Failed to fetch availability");
        }
        return res.json() as Promise<AvailabilityResponse>;
      },
      refetchInterval: 30 * 1000,
      refetchIntervalInBackground: false,
      enabled: Boolean(id),
    })),
  });

  return queries.reduce(
    (acc, query, index) => {
      const id = normalised[index]!.id;
      acc[id] = {
        isOnline: query.data?.isOnline ?? false,
        latencyMs: query.data?.latencyMs ?? 0,
        lastChecked: query.data?.lastChecked ?? null,
        isChecking: query.isLoading || query.isFetching,
        error: query.error,
      };
      return acc;
    },
    {} as Record<
      string,
      {
        isOnline: boolean;
        latencyMs: number;
        lastChecked: string | null;
        isChecking: boolean;
        error: unknown;
      }
    >
  );
}
