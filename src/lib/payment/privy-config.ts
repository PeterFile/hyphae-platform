import type { PrivyClientConfig } from "@privy-io/react-auth";
import { base, baseSepolia } from "viem/chains";

type PrivyEnv = {
  NEXT_PUBLIC_PRIVY_APP_ID?: string;
};

const RUNTIME_PUBLIC_PRIVY_APP_ID =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";

export function resolvePrivyAppId(env?: PrivyEnv): string {
  if (env) {
    return env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? "";
  }

  return RUNTIME_PUBLIC_PRIVY_APP_ID;
}

export function isPrivyEnabled(env?: PrivyEnv): boolean {
  return resolvePrivyAppId(env).length > 0;
}

export const PRIVY_CLIENT_CONFIG: PrivyClientConfig = {
  loginMethods: ["wallet"],
  appearance: {
    showWalletLoginFirst: true,
    walletChainType: "ethereum-only",
    walletList: [
      "detected_wallets",
      "metamask",
      "coinbase_wallet",
      "rainbow",
      "rabby_wallet",
      "wallet_connect",
    ],
  },
  supportedChains: [base, baseSepolia],
  defaultChain: base,
  embeddedWallets: {
    ethereum: {
      createOnLogin: "off",
    },
    solana: {
      createOnLogin: "off",
    },
  },
};
