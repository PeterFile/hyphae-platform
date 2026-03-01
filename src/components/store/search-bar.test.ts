import { describe, expect, it } from "vitest";
import { shouldSyncLocalQueryFromGlobal } from "./search-bar";

describe("search-bar query sync", () => {
  it("does not sync local input when global query is unchanged", () => {
    expect(
      shouldSyncLocalQueryFromGlobal({
        prevGlobalQuery: "",
        nextGlobalQuery: "",
      })
    ).toBe(false);
  });

  it("syncs when global query changes to empty", () => {
    expect(
      shouldSyncLocalQueryFromGlobal({
        prevGlobalQuery: "agent",
        nextGlobalQuery: "",
      })
    ).toBe(true);
  });

  it("syncs when global query changes to a new value", () => {
    expect(
      shouldSyncLocalQueryFromGlobal({
        prevGlobalQuery: "old",
        nextGlobalQuery: "new",
      })
    ).toBe(true);
  });
});
