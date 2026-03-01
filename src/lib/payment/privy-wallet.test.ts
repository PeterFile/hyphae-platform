import { describe, expect, it } from "vitest";

import { isPrivyEthereumSignableWallet } from "./privy-wallet";

describe("isPrivyEthereumSignableWallet", () => {
  it("accepts wallet with address and getEthereumProvider when chain marker is absent", () => {
    const wallet = {
      address: "0x123",
      getEthereumProvider: async () => ({
        request: async () => "0xsignature",
      }),
    };

    expect(isPrivyEthereumSignableWallet(wallet)).toBe(true);
  });

  it("accepts wallet explicitly marked as ethereum", () => {
    const wallet = {
      type: "ethereum",
      address: "0x123",
      getEthereumProvider: async () => ({
        request: async () => "0xsignature",
      }),
    };

    expect(isPrivyEthereumSignableWallet(wallet)).toBe(true);
  });

  it("rejects non-ethereum chain marker", () => {
    const wallet = {
      type: "solana",
      address: "0x123",
      getEthereumProvider: async () => ({
        request: async () => "0xsignature",
      }),
    };

    expect(isPrivyEthereumSignableWallet(wallet)).toBe(false);
  });
});
