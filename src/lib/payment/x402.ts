import { getAddress, isAddress } from "viem";

export type X402Network = "base" | "base-sepolia";

export type Eip3009Authorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

export type ExactEvmPaymentRequirement = {
  x402Version: number;
  scheme: "exact";
  network: X402Network;
  amount: string;
  payTo: string;
  asset: string;
};

type TransferWithAuthorizationTypedData = {
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    TransferWithAuthorization: Array<{ name: string; type: string }>;
  };
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  primaryType: "TransferWithAuthorization";
  message: Eip3009Authorization;
};

type ExtractablePayload = {
  x402Version?: unknown;
  accepts?: unknown;
};

type ExtractableAccept = {
  scheme?: unknown;
  network?: unknown;
  maxAmountRequired?: unknown;
  amount?: unknown;
  payTo?: unknown;
  asset?: unknown;
};

const CHAIN_ID_BY_NETWORK: Record<X402Network, number> = {
  base: 8453,
  "base-sepolia": 84532,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSupportedX402Network(value: unknown): value is X402Network {
  return value === "base" || value === "base-sepolia";
}

function normalizeHexAddress(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) {
    return null;
  }

  return getAddress(trimmed);
}

function normalizeAmount(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function generateNonce(): string {
  if (typeof globalThis.crypto !== "undefined") {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  throw new Error("Web Crypto API is not available in this runtime");
}

export function extractExactEvmPaymentRequirement(
  payload: unknown
): ExactEvmPaymentRequirement | null {
  if (!isObject(payload)) {
    return null;
  }

  const parsedPayload = payload as ExtractablePayload;
  if (!Array.isArray(parsedPayload.accepts)) {
    return null;
  }

  for (const candidate of parsedPayload.accepts) {
    if (!isObject(candidate)) {
      continue;
    }

    const accept = candidate as ExtractableAccept;
    if (accept.scheme !== "exact" || !isSupportedX402Network(accept.network)) {
      continue;
    }

    const amount = normalizeAmount(accept.maxAmountRequired ?? accept.amount);
    const payTo = normalizeHexAddress(accept.payTo);
    const asset = normalizeHexAddress(accept.asset);
    if (!amount || !payTo || !asset) {
      continue;
    }

    const x402Version =
      typeof parsedPayload.x402Version === "number" &&
      Number.isFinite(parsedPayload.x402Version)
        ? Math.trunc(parsedPayload.x402Version)
        : 1;

    return {
      x402Version,
      scheme: "exact",
      network: accept.network,
      amount,
      payTo,
      asset,
    };
  }

  return null;
}

export function buildEip3009Authorization(params: {
  from: string;
  to: string;
  value: string;
  nowMs?: number;
  validitySeconds?: number;
  nonce?: string;
}): Eip3009Authorization {
  const from = normalizeHexAddress(params.from);
  const to = normalizeHexAddress(params.to);
  const value = normalizeAmount(params.value);
  if (!from || !to || !value) {
    throw new Error("Invalid transferWithAuthorization input");
  }

  const nowSeconds = Math.floor((params.nowMs ?? Date.now()) / 1000);
  const validitySeconds = params.validitySeconds ?? 300;
  const nonce = params.nonce ?? generateNonce();

  return {
    from,
    to,
    value,
    validAfter: String(nowSeconds - 60),
    validBefore: String(nowSeconds + validitySeconds),
    nonce,
  };
}

export function buildX402TypedData(params: {
  network: X402Network;
  asset: string;
  authorization: Eip3009Authorization;
}): TransferWithAuthorizationTypedData {
  const verifyingContract = normalizeHexAddress(params.asset);
  if (!verifyingContract) {
    throw new Error("Invalid asset contract address");
  }

  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: CHAIN_ID_BY_NETWORK[params.network],
      verifyingContract,
    },
    primaryType: "TransferWithAuthorization",
    message: params.authorization,
  };
}

export function encodeXPaymentHeader(params: {
  network: X402Network;
  signature: string;
  authorization: Eip3009Authorization;
}): string {
  const tokenPayload = {
    x402Version: 1,
    scheme: "exact",
    network: params.network,
    payload: {
      signature: params.signature,
      authorization: params.authorization,
    },
  };

  const serialized = JSON.stringify(tokenPayload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(serialized, "utf8").toString("base64");
  }

  if (typeof btoa !== "undefined") {
    return btoa(serialized);
  }

  throw new Error("No base64 encoder available");
}
