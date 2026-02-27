import { describe, expect, it, beforeEach } from "vitest";
import { useFilterStore } from "./filter-store";

describe("useFilterStore", () => {
  beforeEach(() => {
    useFilterStore.getState().resetAll();
  });

  it("should have initial state", () => {
    const state = useFilterStore.getState();
    expect(state.query).toBe("");
    expect(state.providers).toEqual([
      "coinbase",
      "thirdweb",
      "dexter",
      "payai",
    ]);
    expect(state.page).toBe(1);
    expect(state.status).toBe("all");
    expect(state.sort).toBe("relevance");
  });

  it("should update query and reset page", () => {
    useFilterStore.getState().setPage(5);
    useFilterStore.getState().setQuery("test");

    const state = useFilterStore.getState();
    expect(state.query).toBe("test");
    expect(state.page).toBe(1);
  });

  it("should toggle providers", () => {
    // Initially all selected. Toggle coinbase off.
    useFilterStore.getState().toggleProvider("coinbase");
    expect(useFilterStore.getState().providers).not.toContain("coinbase");
    expect(useFilterStore.getState().providers).toContain("thirdweb");

    // Toggle coinbase back on.
    useFilterStore.getState().toggleProvider("coinbase");
    expect(useFilterStore.getState().providers).toContain("coinbase");
  });

  it("should set page and next page", () => {
    useFilterStore.getState().setPage(3);
    expect(useFilterStore.getState().page).toBe(3);

    useFilterStore.getState().nextPage();
    expect(useFilterStore.getState().page).toBe(4);
  });

  it("should reset all", () => {
    useFilterStore.getState().setQuery("search");
    useFilterStore.getState().setPage(10);
    useFilterStore.getState().resetAll();

    const state = useFilterStore.getState();
    expect(state.query).toBe("");
    expect(state.page).toBe(1);
  });
});
