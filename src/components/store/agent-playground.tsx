"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  KeySquare,
} from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import { generateMockPaymentSignature } from "@/lib/payment/burner-wallet";
import {
  buildEip3009Authorization,
  buildX402TypedData,
  encodeXPaymentHeader,
  extractExactEvmPaymentRequirement,
  type ExactEvmPaymentRequirement,
} from "@/lib/payment/x402";
import { isPrivyEnabled } from "@/lib/payment/privy-config";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AgentPlaygroundProps {
  agent: {
    id: string;
    provider: string;
    endpoint: { url: string; method: string };
    pricing: { rawAmount: string; rawAsset: string; amountUsdcCents: number };
  };
}

type UIState =
  | "IDLE"
  | "REQUESTING"
  | "PAYMENT_REQUIRED"
  | "SIGNING"
  | "RETRYING"
  | "WALLET_REQUIRED"
  | "SUCCESS"
  | "ERROR";

type SignableWallet = {
  address: string;
  chainType?: string;
  walletClientType?: string;
  getEthereumProvider: () => Promise<{
    request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
  }>;
};

type WalletAuthContext = {
  ready: boolean;
  authenticated: boolean;
  connectedWallet: SignableWallet | null;
};

function isSignableWallet(wallet: unknown): wallet is SignableWallet {
  if (!wallet || typeof wallet !== "object") {
    return false;
  }

  const candidate = wallet as {
    address?: unknown;
    chainType?: unknown;
    getEthereumProvider?: unknown;
  };

  return (
    typeof candidate.address === "string" &&
    candidate.chainType === "ethereum" &&
    typeof candidate.getEthereumProvider === "function"
  );
}

function shortenAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function signExactPaymentWithWallet(
  wallet: SignableWallet,
  requirement: ExactEvmPaymentRequirement
): Promise<{ headerName: "X-PAYMENT"; value: string }> {
  const authorization = buildEip3009Authorization({
    from: wallet.address,
    to: requirement.payTo,
    value: requirement.amount,
  });

  const typedData = buildX402TypedData({
    network: requirement.network,
    asset: requirement.asset,
    authorization,
  });

  const provider = await wallet.getEthereumProvider();
  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [authorization.from, JSON.stringify(typedData)],
  });

  if (typeof signature !== "string" || signature.length === 0) {
    throw new Error("Wallet returned an invalid signature payload");
  }

  return {
    headerName: "X-PAYMENT",
    value: encodeXPaymentHeader({
      network: requirement.network,
      signature,
      authorization,
    }),
  };
}

function AgentPlaygroundWithPrivy({ agent }: AgentPlaygroundProps) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  const connectedWallet = useMemo(() => {
    const wallet = wallets.find((entry) => isSignableWallet(entry));
    return wallet ?? null;
  }, [wallets]);

  return (
    <AgentPlaygroundCore
      agent={agent}
      walletAuth={{
        ready,
        authenticated,
        connectedWallet,
      }}
      walletMode="privy"
    />
  );
}

function AgentPlaygroundCore({
  agent,
  walletAuth,
  walletMode,
}: AgentPlaygroundProps & {
  walletAuth: WalletAuthContext | null;
  walletMode: "privy" | "burner";
}) {
  const [uiState, setUiState] = useState<UIState>("IDLE");
  const [requestBody, setRequestBody] = useState("{\n  \n}");
  const [responseLog, setResponseLog] = useState<string>("");

  const appendLog = (message: string, isError = false) => {
    const timestamp = new Date().toLocaleTimeString();
    setResponseLog(
      (prev) => `${prev}[${timestamp}] ${isError ? "🚨 " : "➡️ "}${message}\n`
    );
  };

  const clearLog = () => setResponseLog("");

  const handleInvoke = async () => {
    try {
      let parsedBody;
      try {
        parsedBody = JSON.parse(requestBody);
      } catch {
        setUiState("ERROR");
        appendLog("Invalid JSON format in Request Body", true);
        return;
      }

      setUiState("REQUESTING");
      clearLog();

      const targetUrl = agent.endpoint.url;
      appendLog(
        `Sending API Request to /api/store/invoke for target: ${targetUrl}`
      );
      appendLog(`Payload: ${JSON.stringify(parsedBody)}`);

      const res = await fetch("/api/store/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agent.id,
          input: parsedBody,
        }),
      });

      if (res.status === 402) {
        setUiState("PAYMENT_REQUIRED");

        const errorData = await res.json().catch(() => null);
        const requirement = extractExactEvmPaymentRequirement(errorData);

        appendLog("Received HTTP 402: Payment Required", true);
        if (requirement) {
          appendLog(
            `Requirement: ${requirement.amount} units on ${requirement.network}`
          );
          appendLog(`Asset: ${requirement.asset}`);
          appendLog(`Pay To: ${requirement.payTo}`);
        } else {
          appendLog(
            "No usable exact-EVM accepts requirement found in 402 response body.",
            true
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));

        let paymentAuth: { headerName: "X-PAYMENT"; value: string };

        if (walletAuth) {
          if (!walletAuth.ready) {
            setUiState("WALLET_REQUIRED");
            appendLog(
              "Wallet connector not ready yet. Wait a moment and retry.",
              true
            );
            return;
          }

          if (!walletAuth.authenticated || !walletAuth.connectedWallet) {
            setUiState("WALLET_REQUIRED");
            appendLog(
              "No connected wallet detected. Click Connect Wallet and retry.",
              true
            );
            return;
          }

          if (!requirement) {
            setUiState("ERROR");
            appendLog(
              "Cannot sign payment because 402 body.accepts is missing a compatible exact-EVM requirement.",
              true
            );
            return;
          }

          setUiState("SIGNING");
          appendLog(
            `Requesting wallet signature from ${shortenAddress(walletAuth.connectedWallet.address)}...`
          );

          paymentAuth = await signExactPaymentWithWallet(
            walletAuth.connectedWallet,
            requirement
          );
        } else {
          setUiState("SIGNING");
          appendLog(
            "Privy is not configured. Using burner wallet mock signature for protocol demo only.",
            true
          );
          const mockPaymentAuth = await generateMockPaymentSignature({
            amount: agent.pricing.rawAmount,
            asset: agent.pricing.rawAsset,
          });
          paymentAuth = {
            headerName: "X-PAYMENT",
            value: mockPaymentAuth.value,
          };
        }

        appendLog(
          `Signed Ticket Generated: ${paymentAuth.value.substring(0, 30)}...`
        );

        await new Promise((resolve) => setTimeout(resolve, 800));

        setUiState("RETRYING");
        appendLog("Retrying Request with appended Authorization Ticket...");

        const retryRes = await fetch("/api/store/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: agent.id,
            input: parsedBody,
            payment: {
              headerName: paymentAuth.headerName,
              value: paymentAuth.value,
            },
          }),
        });

        if (!retryRes.ok) {
          const retryBodyInfo = await retryRes.text();
          throw new Error(
            `Execution failed after payment: ${retryRes.status} ${retryBodyInfo}`
          );
        }

        const passThroughData = await retryRes.json();
        setUiState("SUCCESS");
        appendLog(
          `HTTP 200 OK! Application Logic Result:\n${JSON.stringify(passThroughData, null, 2)}`
        );
      } else if (!res.ok) {
        const errorInfo = await res.text();
        throw new Error(`Proxy Request Failed: ${res.status} ${errorInfo}`);
      } else {
        setUiState("SUCCESS");
        const jsonResponse = await res.json();
        appendLog(
          `HTTP 200 OK! Result:\n${JSON.stringify(jsonResponse, null, 2)}`
        );
      }
    } catch (error) {
      setUiState("ERROR");
      if (error instanceof Error) {
        appendLog(error.message, true);
      } else {
        appendLog("An unknown error occurred", true);
      }
    }
  };

  const isBusy =
    uiState === "REQUESTING" ||
    uiState === "SIGNING" ||
    uiState === "PAYMENT_REQUIRED" ||
    uiState === "RETRYING";

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col">
      <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/30">
        <h3 className="font-semibold leading-none tracking-tight flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          Interactive Test Workspace
        </h3>
        <p className="text-sm text-muted-foreground">
          {walletMode === "privy"
            ? "Wallet-Signed X402 Flow (Privy Wallet Only)"
            : "Auto X402 Flow Demonstration (Burner Wallet Fallback)"}
        </p>
      </div>

      <div className="p-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-4 flex flex-col h-full">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Request Body (JSON)
            </label>
            <Textarea
              className="font-mono text-sm h-48 resize-y focus-visible:ring-primary"
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              disabled={
                uiState !== "IDLE" &&
                uiState !== "ERROR" &&
                uiState !== "SUCCESS" &&
                uiState !== "WALLET_REQUIRED"
              }
            />
          </div>

          <div className="mt-auto pt-4">
            <Button
              onClick={handleInvoke}
              className="w-full h-12 text-md font-bold transition-all relative overflow-hidden"
              disabled={isBusy}
            >
              {uiState === "REQUESTING" ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Issuing
                  Request
                </>
              ) : uiState === "PAYMENT_REQUIRED" ? (
                <>
                  <AlertCircle className="mr-2 h-5 w-5 text-destructive-foreground animate-pulse" />
                  402 Hit
                </>
              ) : uiState === "SIGNING" ? (
                <>
                  <KeySquare className="mr-2 h-5 w-5 animate-pulse" /> Signing
                  Auth Ticket
                </>
              ) : uiState === "RETRYING" ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verifying
                  Ticket
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" /> Invoke Agent
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="bg-black/95 rounded-lg border flex flex-col overflow-hidden relative group h-[300px] md:h-auto">
          <div className="absolute top-0 w-full flex justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400 font-mono z-10">
            <span>Terminal &gt; _</span>
            {uiState === "SUCCESS" && (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </div>

          <div className="flex-1 p-4 pt-10 overflow-auto font-mono text-sm text-zinc-300 whitespace-pre-wrap">
            {responseLog || (
              <span className="text-zinc-600 italic">
                Waiting to invoke agent logic...
              </span>
            )}
          </div>

          {uiState === "PAYMENT_REQUIRED" && (
            <div className="absolute bottom-4 left-4 right-4 bg-red-500/10 border border-red-500/30 rounded-md p-3 text-red-400 text-xs font-mono animate-in slide-in-from-bottom-2 fade-in">
              <span className="font-bold">HTTP 402</span>: Service rejected
              request due to missing payment. Preparing signature flow.
            </div>
          )}

          {uiState === "SIGNING" && (
            <div className="absolute bottom-4 left-4 right-4 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-amber-400 text-xs font-mono animate-in slide-in-from-bottom-2 fade-in flex items-center gap-3">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Signing X402 authorization payload...</span>
            </div>
          )}

          {uiState === "WALLET_REQUIRED" && walletAuth && (
            <div className="absolute bottom-4 left-4 right-4 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-amber-400 text-xs font-mono animate-in slide-in-from-bottom-2 fade-in">
              Connect Wallet in the top navigation, then invoke again.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentPlayground({ agent }: AgentPlaygroundProps) {
  if (!isPrivyEnabled()) {
    return (
      <AgentPlaygroundCore
        agent={agent}
        walletAuth={null}
        walletMode="burner"
      />
    );
  }

  return <AgentPlaygroundWithPrivy agent={agent} />;
}
