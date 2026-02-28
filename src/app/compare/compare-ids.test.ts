import { describe, expect, it } from "vitest";

import { buildCompareFetchContext } from "./compare-ids";

describe("buildCompareFetchContext", () => {
  it("uses ids from URL query when idsParam is present", () => {
    const context = buildCompareFetchContext({
      idsParam: "coinbase:a,thirdweb:b",
      selectedIds: ["payai:x"],
    });

    expect(context.allIds).toEqual(["coinbase:a", "thirdweb:b"]);
    expect(context.requestIds).toEqual(["coinbase:a", "thirdweb:b"]);
  });

  it("falls back to selectedIds when idsParam is null", () => {
    const context = buildCompareFetchContext({
      idsParam: null,
      selectedIds: ["coinbase:a", "payai:b"],
    });

    expect(context.allIds).toEqual(["coinbase:a", "payai:b"]);
    expect(context.requestIds).toEqual(["coinbase:a", "payai:b"]);
  });

  it("generates the same requestKey for identical values", () => {
    const first = buildCompareFetchContext({
      idsParam: null,
      selectedIds: ["coinbase:a", "thirdweb:b"],
    });
    const second = buildCompareFetchContext({
      idsParam: null,
      selectedIds: ["coinbase:a", "thirdweb:b"],
    });

    expect(first.requestKey).toBe(second.requestKey);
  });

  it("limits requestIds to first 4 ids while keeping allIds", () => {
    const context = buildCompareFetchContext({
      idsParam: null,
      selectedIds: ["a", "b", "c", "d", "e"],
    });

    expect(context.allIds).toEqual(["a", "b", "c", "d", "e"]);
    expect(context.requestIds).toEqual(["a", "b", "c", "d"]);
  });
});
