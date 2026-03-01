import { describe, expect, it, vi } from "vitest";

import { ensurePrivyWalletAuthenticated } from "./privy-wallet-auth";

describe("ensurePrivyWalletAuthenticated", () => {
  it("calls loginOrLink when wallet supports it", async () => {
    const loginOrLink = vi.fn(async () => undefined);

    const result = await ensurePrivyWalletAuthenticated({
      loginOrLink,
    });

    expect(result).toBe(true);
    expect(loginOrLink).toHaveBeenCalledTimes(1);
  });

  it("returns false when wallet cannot loginOrLink", async () => {
    await expect(
      ensurePrivyWalletAuthenticated({
        loginOrLink: undefined,
      })
    ).resolves.toBe(false);
  });
});
