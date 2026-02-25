export interface NormalizedPrice {
  amountUsdcCents: number;
  priceUnavailable: boolean;
}

const BIGINT_ZERO = BigInt(0);
const BIGINT_TEN = BigInt(10);
const CENTS_PER_USDC = BigInt(100);

const ASSET_DECIMALS: Record<string, bigint> = {
  USDC: BigInt(6),
  ETH: BigInt(18),
  SOL: BigInt(9),
};

// TODO: replace fallback rates with on-chain oracle / market feed quotes.
const FALLBACK_USDC_RATE: Record<string, bigint> = {
  ETH: BigInt(3000),
  SOL: BigInt(150),
};

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function parseRawAmount(rawAmount: string): bigint | null {
  try {
    const parsedAmount = BigInt(rawAmount);

    if (parsedAmount < BIGINT_ZERO) {
      return null;
    }

    return parsedAmount;
  } catch {
    return null;
  }
}

function toSafeNumber(value: bigint): number | null {
  if (value > MAX_SAFE_INTEGER_BIGINT) {
    return null;
  }

  return Number(value);
}

function normalizeAsset(rawAsset: string): string {
  return rawAsset.trim().toUpperCase();
}

function convertToUsdcCents(rawAmount: bigint, asset: string): bigint | null {
  if (asset === "USDC" || asset === "USDC.E") {
    return (rawAmount * CENTS_PER_USDC) / BIGINT_TEN ** ASSET_DECIMALS.USDC;
  }

  const fallbackRate = FALLBACK_USDC_RATE[asset];
  const decimals = ASSET_DECIMALS[asset];

  if (fallbackRate === undefined || decimals === undefined) {
    return null;
  }

  return (rawAmount * fallbackRate * CENTS_PER_USDC) / BIGINT_TEN ** decimals;
}

export function normalizeToUsdcCents(
  rawAmount: string,
  rawAsset: string,
  network: string
): NormalizedPrice {
  void network;
  const parsedAmount = parseRawAmount(rawAmount);

  if (parsedAmount === null) {
    return { amountUsdcCents: 0, priceUnavailable: true };
  }

  const asset = normalizeAsset(rawAsset);
  const rawCents = convertToUsdcCents(parsedAmount, asset);

  if (rawCents === null) {
    return { amountUsdcCents: 0, priceUnavailable: true };
  }

  const amountUsdcCents = toSafeNumber(rawCents);

  if (amountUsdcCents === null) {
    return { amountUsdcCents: 0, priceUnavailable: true };
  }

  return { amountUsdcCents, priceUnavailable: false };
}
