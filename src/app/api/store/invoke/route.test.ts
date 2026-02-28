import { describe, expect, it, vi } from "vitest";

import type { UnifiedAgent } from "@/lib/unified-schema";

import { createInvokeRouteHandler } from "./handler";

function createAgent(id: string, endpointUrl: string): UnifiedAgent {
  const provider = id.split(":", 1)[0] as UnifiedAgent["provider"];
  const originalId = id.slice(provider.length + 1);

  return {
    id,
    provider,
    originalId,
    name: "Agent",
    description: "Test agent",
    category: "General",
    tags: [],
    endpoint: {
      url: endpointUrl,
      method: "POST",
    },
    pricing: {
      amountUsdcCents: 100,
      rawAmount: "1",
      rawAsset: "USDC",
      network: "base",
    },
    availability: {
      isOnline: false,
      lastChecked: "2026-02-25T00:00:00.000Z",
      statusCode: 0,
    },
  };
}

function buildRequest(body: unknown): Request {
  return new Request("https://unit.test/api/store/invoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/store/invoke", () => {
  it("returns 422 provider_not_invokable_yet for thirdweb", async () => {
    const getById = vi.fn();
    const handler = createInvokeRouteHandler({
      adapters: {
        thirdweb: {
          getById,
        },
      },
    });

    const response = await handler(buildRequest({ id: "thirdweb:agent-1" }));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      error: "provider_not_invokable_yet",
      provider: "thirdweb",
    });
    expect(typeof payload.message).toBe("string");
    expect(getById).not.toHaveBeenCalled();
  });

  it("returns 404 when provider is invokable but agent id is missing", async () => {
    const getById = vi.fn().mockResolvedValue(null);
    const handler = createInvokeRouteHandler({
      adapters: {
        coinbase: {
          getById,
        },
      },
    });

    const response = await handler(
      buildRequest({ id: "coinbase:https://api.example.com/missing" })
    );

    expect(response.status).toBe(404);
    expect(getById).toHaveBeenCalledWith(
      "coinbase:https://api.example.com/missing"
    );
  });

  it("returns 501 when provider is invokable and agent exists", async () => {
    const agent = createAgent(
      "coinbase:https://api.example.com/resource",
      "https://api.example.com/resource"
    );
    const getById = vi.fn().mockResolvedValue(agent);
    const handler = createInvokeRouteHandler({
      adapters: {
        coinbase: {
          getById,
        },
      },
    });

    const response = await handler(
      buildRequest({ id: "coinbase:https://api.example.com/resource" })
    );
    const payload = await response.json();

    expect(response.status).toBe(501);
    expect(payload).toEqual({
      error: "invoke_not_implemented_yet",
      provider: "coinbase",
      id: "coinbase:https://api.example.com/resource",
      endpoint: {
        url: "https://api.example.com/resource",
        method: "POST",
      },
    });
  });
});
