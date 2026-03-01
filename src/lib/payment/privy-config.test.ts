import { describe, expect, it } from "vitest";

import { isPrivyEnabled, resolvePrivyAppId } from "./privy-config";

describe("privy config helpers", () => {
  it("trims NEXT_PUBLIC_PRIVY_APP_ID and returns empty string when absent", () => {
    expect(resolvePrivyAppId({})).toBe("");
    expect(resolvePrivyAppId({ NEXT_PUBLIC_PRIVY_APP_ID: "  app_123  " })).toBe(
      "app_123"
    );
  });

  it("reports whether privy is enabled", () => {
    expect(isPrivyEnabled({ NEXT_PUBLIC_PRIVY_APP_ID: "" })).toBe(false);
    expect(isPrivyEnabled({ NEXT_PUBLIC_PRIVY_APP_ID: "   " })).toBe(false);
    expect(isPrivyEnabled({ NEXT_PUBLIC_PRIVY_APP_ID: "app_123" })).toBe(true);
  });
});
