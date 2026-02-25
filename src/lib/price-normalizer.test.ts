import { describe, expect, it } from "vitest";
import { normalizeToUsdcCents } from "./price-normalizer";

describe("normalizeToUsdcCents", () => {
  it("converts 1 USDC on EVM to 100 cents", () => {
    expect(normalizeToUsdcCents("1000000", "USDC", "base")).toEqual({
      amountUsdcCents: 100,
      priceUnavailable: false,
    });
  });

  it("converts 1 USDC on Solana to 100 cents", () => {
    expect(normalizeToUsdcCents("1000000", "USDC", "solana")).toEqual({
      amountUsdcCents: 100,
      priceUnavailable: false,
    });
  });

  it("converts fractional USDC raw amount to cents", () => {
    expect(normalizeToUsdcCents("250000", "USDC", "base")).toEqual({
      amountUsdcCents: 25,
      priceUnavailable: false,
    });
  });

  it("converts 1 ETH (wei) with fallback rate to USDC cents", () => {
    expect(
      normalizeToUsdcCents("1000000000000000000", "ETH", "ethereum")
    ).toEqual({
      amountUsdcCents: 300000,
      priceUnavailable: false,
    });
  });

  it("converts 1 SOL (lamports) with fallback rate to USDC cents", () => {
    expect(normalizeToUsdcCents("1000000000", "SOL", "solana")).toEqual({
      amountUsdcCents: 15000,
      priceUnavailable: false,
    });
  });

  it("returns unavailable marker for unknown assets", () => {
    expect(normalizeToUsdcCents("1000000", "DOGE", "dogechain")).toEqual({
      amountUsdcCents: 0,
      priceUnavailable: true,
    });
  });
});
