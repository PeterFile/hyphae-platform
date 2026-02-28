"use client";

import { useState } from "react";
import {
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  KeySquare,
} from "lucide-react";
import { generateMockPaymentSignature } from "@/lib/payment/burner-wallet";
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
  | "SUCCESS"
  | "ERROR";

export function AgentPlayground({ agent }: AgentPlaygroundProps) {
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
      // Validate JSON
      let parsedBody;
      try {
        parsedBody = JSON.parse(requestBody);
      } catch (e: unknown) {
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

      // Handle 402 Flow
      if (res.status === 402) {
        setUiState("PAYMENT_REQUIRED");
        const errorData = await res.json();
        const acceptsHeader = res.headers.get("accepts") || "Unknown Cost";
        appendLog(`Received HTTP 402: Payment Required`, true);
        appendLog(`Requirement: ${acceptsHeader}`);

        // Wait a small amount of time for UX
        await new Promise((resolve) => setTimeout(resolve, 1500));

        setUiState("SIGNING");
        appendLog(`Automatically activating burner wallet to sign payload...`);

        // Use our automatic burner wallet since there is no connected Web3 wallet Context
        const paymentAuth = await generateMockPaymentSignature({
          amount: agent.pricing.rawAmount,
          asset: agent.pricing.rawAsset,
        });

        appendLog(
          `Signed Ticket Generated: ${paymentAuth.value.substring(0, 30)}...`
        );

        await new Promise((resolve) => setTimeout(resolve, 1500));

        setUiState("RETRYING");
        appendLog(`Retrying Request with appended Authorization Ticket...`);

        const retryRes = await fetch("/api/store/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: agent.id,
            input: parsedBody,
            payment: {
              headerName: "X-PAYMENT",
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
        // Unexpectedly succeeded without payment required
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

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col">
      <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/30">
        <h3 className="font-semibold leading-none tracking-tight flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          Interactive Test Workspace
        </h3>
        <p className="text-sm text-muted-foreground">
          Auto X402 Flow Demonstration (Burner Wallet Enabled)
        </p>
      </div>

      <div className="p-6 grid gap-6 md:grid-cols-2">
        {/* Left Col: Request Config */}
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
                uiState !== "SUCCESS"
              }
            />
          </div>

          <div className="mt-auto pt-4">
            <Button
              onClick={handleInvoke}
              className="w-full h-12 text-md font-bold transition-all relative overflow-hidden"
              disabled={
                uiState === "REQUESTING" ||
                uiState === "SIGNING" ||
                uiState === "PAYMENT_REQUIRED" ||
                uiState === "RETRYING"
              }
            >
              {uiState === "REQUESTING" ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Issuing
                  Request
                </>
              ) : uiState === "PAYMENT_REQUIRED" ? (
                <>
                  <AlertCircle className="mr-2 h-5 w-5 text-destructive-foreground animate-pulse" />{" "}
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

        {/* Right Col: Console Log / Output */}
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

          {/* Visual Indicators Overlay */}
          {uiState === "PAYMENT_REQUIRED" && (
            <div className="absolute bottom-4 left-4 right-4 bg-red-500/10 border border-red-500/30 rounded-md p-3 text-red-400 text-xs font-mono animate-in slide-in-from-bottom-2 fade-in">
              <span className="font-bold">HTTP 402</span>: Service rejected
              request due to missing payment. Triggering auto-sign protocol.
            </div>
          )}

          {uiState === "SIGNING" && (
            <div className="absolute bottom-4 left-4 right-4 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-amber-400 text-xs font-mono animate-in slide-in-from-bottom-2 fade-in flex items-center gap-3">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>
                Burner Wallet signing X402 ticket for {agent.pricing.rawAmount}{" "}
                {agent.pricing.rawAsset}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
