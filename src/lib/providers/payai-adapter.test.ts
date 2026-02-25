import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnifiedAgentSchema } from "@/lib/unified-schema";

import { PayAIAdapter } from "./payai-adapter";

describe("PayAIAdapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    delete process.env.PAYAI_RPC_URL;
    delete process.env.PAYAI_PROGRAM_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("returns mock fallback data when rpc config is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PayAIAdapter();
    const results = await adapter.search("mock");

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.provider === "payai")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries Solana RPC getProgramAccounts when env config exists", async () => {
    process.env.PAYAI_RPC_URL = "https://rpc.payai.example";
    process.env.PAYAI_PROGRAM_ID =
      "PayAiProgram11111111111111111111111111111111";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: [
            {
              pubkey: "AgentPubkey1111111111111111111111111111111111",
              account: {
                lamports: 10,
                owner: process.env.PAYAI_PROGRAM_ID,
                data: ["", "base64"],
                executable: false,
                rentEpoch: 0,
                space: 0,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PayAIAdapter();
    const results = await adapter.search("AgentPubkey111");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody.method).toBe("getProgramAccounts");
    expect(requestBody.params[0]).toBe(process.env.PAYAI_PROGRAM_ID);
    expect(results).toEqual([
      {
        provider: "payai",
        agent: { id: "AgentPubkey1111111111111111111111111111111111" },
      },
    ]);
  });

  it("falls back to mock data when rpc request fails", async () => {
    process.env.PAYAI_RPC_URL = "https://rpc.payai.example";
    process.env.PAYAI_PROGRAM_ID =
      "PayAiProgram11111111111111111111111111111111";
    const fetchMock = vi.fn().mockRejectedValue(new Error("rpc down"));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PayAIAdapter();
    const results = await adapter.search("");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.provider).toBe("payai");
  });

  it("returns item from fallback data in getById", async () => {
    const adapter = new PayAIAdapter();

    expect(await adapter.getById("payai-mock-echo")).toEqual({
      provider: "payai",
      agent: { id: "payai-mock-echo" },
    });
    expect(await adapter.getById("not-found")).toBeNull();
  });

  it("normalizes Solana USDC amounts with six decimals", () => {
    const adapter = new PayAIAdapter();
    const normalized = adapter.normalize({
      originalId: "payai-usdc-1",
      name: "PayAI USDC Agent",
      description: "Solana account based agent",
      endpointUrl: "https://payai.example/agents/payai-usdc-1",
      rawAmount: "1000000",
      rawAsset: "USDC",
      network: "solana",
      tags: ["payai", "solana"],
      category: "General",
    });

    expect(normalized.id).toBe("payai:payai-usdc-1");
    expect(normalized.pricing.amountUsdcCents).toBe(100);
    expect(UnifiedAgentSchema.safeParse(normalized).success).toBe(true);
  });
});
