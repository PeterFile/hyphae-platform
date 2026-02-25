import { describe, expect, test } from "vitest";

import { UnifiedAgentSchema } from "./unified-schema";

describe("UnifiedAgentSchema", () => {
  test("parses a valid unified agent", () => {
    const parsed = UnifiedAgentSchema.parse({
      id: "coinbase:cb-001",
      provider: "coinbase",
      originalId: "cb-001",
      name: "Base Weather Agent",
      description: "Returns weather forecast.",
      category: "Weather",
      tags: ["forecast", "api"],
      endpoint: {
        url: "https://api.example.com/weather",
        method: "GET",
      },
      pricing: {
        amountUsdcCents: 199,
        rawAmount: "1990000",
        rawAsset: "USDC",
        network: "base",
      },
      availability: {
        isOnline: true,
        lastChecked: "2026-02-25T02:29:24Z",
        latencyMs: 87,
        statusCode: 200,
      },
      metadata: {
        registeredAt: "2026-02-20T10:00:00Z",
        totalCalls: 1024,
        rating: 4.7,
      },
    });

    expect(parsed.id).toBe("coinbase:cb-001");
    expect(parsed.availability.statusCode).toBe(200);
  });

  test("fills default category and tags", () => {
    const parsed = UnifiedAgentSchema.parse({
      id: "thirdweb:tw-001",
      provider: "thirdweb",
      originalId: "tw-001",
      name: "Nexus Agent",
      description: "Thirdweb search result.",
      endpoint: {
        url: "https://api.example.com/nexus",
        method: "POST",
      },
      pricing: {
        amountUsdcCents: 300,
        rawAmount: "3000000",
        rawAsset: "USDC",
        network: "ethereum",
      },
      availability: {
        isOnline: false,
        lastChecked: "2026-02-25T02:29:24Z",
        statusCode: 503,
      },
    });

    expect(parsed.category).toBe("General");
    expect(parsed.tags).toEqual([]);
  });

  test("rejects id not matching provider prefix", () => {
    const result = UnifiedAgentSchema.safeParse({
      id: "thirdweb:tw-001",
      provider: "coinbase",
      originalId: "tw-001",
      name: "Broken",
      description: "Broken mapping.",
      endpoint: {
        url: "https://api.example.com/broken",
        method: "GET",
      },
      pricing: {
        amountUsdcCents: 10,
        rawAmount: "100000",
        rawAsset: "USDC",
        network: "base",
      },
      availability: {
        isOnline: true,
        lastChecked: "2026-02-25T02:29:24Z",
        statusCode: 200,
      },
    });

    expect(result.success).toBe(false);
  });

  test("rejects non-ISO datetime strings", () => {
    const result = UnifiedAgentSchema.safeParse({
      id: "coinbase:cb-002",
      provider: "coinbase",
      originalId: "cb-002",
      name: "Bad Date Agent",
      description: "Uses invalid datetime.",
      endpoint: {
        url: "https://api.example.com/invalid-date",
        method: "GET",
      },
      pricing: {
        amountUsdcCents: 25,
        rawAmount: "250000",
        rawAsset: "USDC",
        network: "base",
      },
      availability: {
        isOnline: true,
        lastChecked: "2026-02-25",
        statusCode: 200,
      },
      metadata: {
        registeredAt: "2026/02/20 10:00:00",
      },
    });

    expect(result.success).toBe(false);
  });
});
