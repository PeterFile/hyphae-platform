"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import { isPrivyEnabled } from "@/lib/payment/privy-config";

const PRIVY_ENABLED = isPrivyEnabled();

type SignableWallet = {
  address: string;
  getEthereumProvider?: unknown;
};

function isSignableWallet(wallet: unknown): wallet is SignableWallet {
  if (!wallet || typeof wallet !== "object") {
    return false;
  }

  const candidate = wallet as {
    address?: unknown;
    getEthereumProvider?: unknown;
  };

  return (
    typeof candidate.address === "string" &&
    typeof candidate.getEthereumProvider === "function"
  );
}

function shortenAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function WalletAuthButton() {
  const { ready, authenticated, logout } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();

  const connectedWallet = wallets.find((wallet) => isSignableWallet(wallet));

  if (!ready) {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        Wallet...
      </Button>
    );
  }

  if (!authenticated || !connectedWallet) {
    return (
      <Button type="button" size="sm" onClick={() => connectWallet()}>
        <Wallet className="mr-2 h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" className="gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {shortenAddress(connectedWallet.address)}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => logout()}>
        Disconnect
      </Button>
    </div>
  );
}

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
        <div className="flex items-center gap-5">
          <Link href="/store" className="text-sm font-semibold tracking-tight">
            Hyphae
          </Link>
          <Link
            href="/developers/gateway"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Gateway Docs
          </Link>
        </div>

        {PRIVY_ENABLED ? (
          <WalletAuthButton />
        ) : (
          <Button type="button" size="sm" variant="outline" disabled>
            <Wallet className="mr-2 h-4 w-4" />
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  );
}
