const DEFAULT_COMPARE_LIMIT = 4;

export interface CompareFetchContext {
  allIds: string[];
  requestIds: string[];
  requestKey: string;
}

export function buildCompareFetchContext(input: {
  idsParam: string | null;
  selectedIds: readonly string[];
  limit?: number;
}): CompareFetchContext {
  const limit = input.limit ?? DEFAULT_COMPARE_LIMIT;
  const allIds =
    input.idsParam === null
      ? [...input.selectedIds]
      : input.idsParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
  const requestIds = allIds.slice(0, limit);

  return {
    allIds,
    requestIds,
    requestKey: JSON.stringify(requestIds),
  };
}
