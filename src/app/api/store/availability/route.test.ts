import { describe, expect, it, vi } from "vitest";

import type { UnifiedAgent } from "@/lib/unified-schema";
import type { AvailabilityResult } from "@/lib/providers/types";

import { createAvailabilityRouteHandler } from "./handler";

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
      method: "GET",
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

function buildRequest(id?: string): Request {
  const query = id ? `?id=${encodeURIComponent(id)}` : "";
  return new Request(`https://unit.test/api/store/availability${query}`);
}

describe("GET /api/store/availability", () => {
  it("returns availability payload for valid id", async () => {
    const agentId = "coinbase:https://api.example.com/resource";
    const agent = createAgent(agentId, "https://api.example.com/health");
    const getById = vi.fn().mockResolvedValue(agent);
    const checkAvailability = vi.fn().mockResolvedValue({
      isOnline: true,
      latencyMs: 23,
      lastChecked: "2026-02-26T08:00:00.000Z",
      statusCode: 200,
    } satisfies AvailabilityResult);
    const handler = createAvailabilityRouteHandler({
      adapters: {
        coinbase: {
          getById,
          checkAvailability,
        },
      },
    });

    const response = await handler(buildRequest(agentId));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      isOnline: true,
      latencyMs: 23,
      lastChecked: "2026-02-26T08:00:00.000Z",
    });
    expect(getById).toHaveBeenCalledWith(agentId);
    expect(checkAvailability).toHaveBeenCalledWith(
      "https://api.example.com/health"
    );
  });

  it("returns 422 when id is missing", async () => {
    const handler = createAvailabilityRouteHandler();

    const response = await handler(buildRequest());

    expect(response.status).toBe(422);
  });

  it("returns 422 when provider prefix is invalid", async () => {
    const handler = createAvailabilityRouteHandler();

    const response = await handler(buildRequest("unknown:abc"));

    expect(response.status).toBe(422);
  });

  it("returns 404 when id is not found", async () => {
    const getById = vi.fn().mockResolvedValue(null);
    const checkAvailability = vi.fn();
    const handler = createAvailabilityRouteHandler({
      adapters: {
        dexter: {
          getById,
          checkAvailability,
        },
      },
    });

    const response = await handler(buildRequest("dexter:missing"));

    expect(response.status).toBe(404);
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it("returns 422 for localhost/internal endpoint URL", async () => {
    const agent = createAgent("payai:agent-1", "http://127.0.0.1:3000/health");
    const getById = vi.fn().mockResolvedValue(agent);
    const checkAvailability = vi.fn();
    const handler = createAvailabilityRouteHandler({
      adapters: {
        payai: {
          getById,
          checkAvailability,
        },
      },
    });

    const response = await handler(buildRequest("payai:agent-1"));

    expect(response.status).toBe(422);
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it("caches probe results for 30 seconds", async () => {
    let nowMs = 1_000_000;
    const agentId = "coinbase:https://api.example.com/resource-cache";
    const agent = createAgent(agentId, "https://api.example.com/health");
    const getById = vi.fn().mockResolvedValue(agent);
    const checkAvailability = vi.fn().mockResolvedValue({
      isOnline: false,
      latencyMs: 80,
      lastChecked: "2026-02-26T08:00:00.000Z",
      statusCode: 503,
    } satisfies AvailabilityResult);
    const handler = createAvailabilityRouteHandler({
      adapters: {
        coinbase: {
          getById,
          checkAvailability,
        },
      },
      now: () => nowMs,
    });

    const first = await handler(buildRequest(agentId));
    nowMs += 10_000;
    const second = await handler(buildRequest(agentId));
    nowMs += 30_001;
    const third = await handler(buildRequest(agentId));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(checkAvailability).toHaveBeenCalledTimes(2);
  });
});
