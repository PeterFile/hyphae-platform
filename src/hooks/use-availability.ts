import { useQueries, useQuery } from "@tanstack/react-query";

export type AvailabilityResponse = {
  isOnline: boolean;
  latencyMs: number;
  lastChecked: string;
};

export function useAvailability(agentId: string) {
  const query = useQuery({
    queryKey: ["store", "availability", agentId],
    queryFn: async () => {
      const res = await fetch(
        `/api/store/availability?id=${encodeURIComponent(agentId)}`
      );
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

export function useAvailabilityBatch(agentIds: string[]) {
  const queries = useQueries({
    queries: agentIds.map((id) => ({
      queryKey: ["store", "availability", id],
      queryFn: async () => {
        const res = await fetch(
          `/api/store/availability?id=${encodeURIComponent(id)}`
        );
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
      const id = agentIds[index];
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
