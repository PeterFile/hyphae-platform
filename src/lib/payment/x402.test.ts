import { describe, expect, it } from "vitest";
import { getAddress } from "viem";

import {
  buildEip3009Authorization,
  buildX402TypedData,
  encodeXPaymentHeader,
  extractExactEvmPaymentRequirement,
} from "./x402";

describe("x402 payment helpers", () => {
  it("extracts exact evm requirement from 402 body.accepts", () => {
    const requirement = extractExactEvmPaymentRequirement({
      x402Version: 1,
      error: "Payment required",
      accepts: [
        {
          scheme: "exact",
          network: "base",
          maxAmountRequired: "1100",
          resource: "https://public.zapper.xyz/x402/defi-balances",
          payTo: "0x43a2a720cd0911690c248075f4a29a5e7716f758",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        },
      ],
    });

    expect(requirement).toEqual({
      x402Version: 1,
      scheme: "exact",
      network: "base",
      amount: "1100",
      payTo: "0x43A2A720cD0911690C248075f4a29a5e7716f758",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    });
  });

  it("builds transferWithAuthorization typed data", () => {
    const authorization = buildEip3009Authorization({
      from: "0x79b5D09B7fA1004D8D17A5feCC8D2349f79f06f6",
      to: "0x43a2a720cd0911690c248075f4a29a5e7716f758",
      value: "1100",
      nowMs: 1_735_800_000_000,
      nonce:
        "0x0000000000000000000000000000000000000000000000000000000000000abc",
    });

    expect(authorization).toEqual({
      from: getAddress("0x79b5D09B7fA1004D8D17A5feCC8D2349f79f06f6"),
      to: "0x43A2A720cD0911690C248075f4a29a5e7716f758",
      value: "1100",
      validAfter: "1735799940",
      validBefore: "1735800300",
      nonce:
        "0x0000000000000000000000000000000000000000000000000000000000000abc",
    });

    const typedData = buildX402TypedData({
      network: "base",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      authorization,
    });

    expect(typedData.domain).toEqual({
      name: "USD Coin",
      version: "2",
      chainId: 8453,
      verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    });
    expect(typedData.primaryType).toBe("TransferWithAuthorization");
    expect(typedData.types.TransferWithAuthorization).toHaveLength(6);
  });

  it("encodes x-payment header payload as base64 json", () => {
    const token = encodeXPaymentHeader({
      network: "base",
      signature:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      authorization: {
        from: "0x79b5D09B7fA1004D8D17A5feCC8D2349f79f06f6",
        to: "0x43a2a720cd0911690c248075f4a29a5e7716f758",
        value: "1100",
        validAfter: "1735799940",
        validBefore: "1735800300",
        nonce:
          "0x0000000000000000000000000000000000000000000000000000000000000abc",
      },
    });

    const decoded = JSON.parse(
      Buffer.from(token, "base64").toString("utf8")
    ) as {
      x402Version: number;
      scheme: string;
      network: string;
      payload: {
        signature: string;
        authorization: { to: string; value: string };
      };
    };

    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe("exact");
    expect(decoded.network).toBe("base");
    expect(decoded.payload.authorization.to).toBe(
      "0x43a2a720cd0911690c248075f4a29a5e7716f758"
    );
    expect(decoded.payload.authorization.value).toBe("1100");
  });
});
