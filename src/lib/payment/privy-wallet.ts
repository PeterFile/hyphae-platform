export type PrivyEthereumSignableWallet = {
  address: string;
  getEthereumProvider: () => Promise<{
    request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
  }>;
  loginOrLink?: unknown;
};

export function isPrivyEthereumSignableWallet(
  wallet: unknown
): wallet is PrivyEthereumSignableWallet {
  if (!wallet || typeof wallet !== "object") {
    return false;
  }

  const candidate = wallet as {
    type?: unknown;
    chainType?: unknown;
    address?: unknown;
    getEthereumProvider?: unknown;
  };

  if (candidate.type !== undefined && candidate.type !== "ethereum") {
    return false;
  }

  if (candidate.chainType !== undefined && candidate.chainType !== "ethereum") {
    return false;
  }

  return (
    typeof candidate.address === "string" &&
    typeof candidate.getEthereumProvider === "function"
  );
}
