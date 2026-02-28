import { describe, expect, it, vi } from "vitest";

import type { ProviderAdapter } from "@/lib/providers/types";
import type { UnifiedAgent } from "@/lib/unified-schema";

import { createInvokeRouteHandler } from "./handler";

type InvokeAdapter = Pick<ProviderAdapter, "getById"> &
  Partial<Pick<ProviderAdapter, "search">>;

function createAgent(
  id: string,
  endpoint: { url: string; method: "GET" | "POST" }
): UnifiedAgent {
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
    endpoint,
    pricing: {
      amountUsdcCents: 100,
      rawAmount: "1",
      rawAsset: "USDC",
      network: "base",
    },
    availability: {
      isOnline: true,
      lastChecked: "2026-02-27T00:00:00.000Z",
      statusCode: 200,
    },
  };
}

function buildRequest(body: unknown): Request {
  return new Request("https://unit.test/api/store/invoke", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/store/invoke", () => {
  it("returns 413 when request body exceeds 64KB", async () => {
    const handler = createInvokeRouteHandler();
    const tooLargeBody = "x".repeat(65 * 1024);
    const request = new Request("https://unit.test/api/store/invoke", {
      method: "POST",
      body: tooLargeBody,
    });

    const response = await handler(request);

    expect(response.status).toBe(413);
  });

  it("returns 413 when content-length header exceeds 64KB", async () => {
    const handler = createInvokeRouteHandler();
    const request = new Request("https://unit.test/api/store/invoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(65 * 1024),
      },
      body: "{}",
    });

    const response = await handler(request);

    expect(response.status).toBe(413);
  });

  it("returns 422 for invalid payload", async () => {
    const handler = createInvokeRouteHandler();

    const response = await handler(buildRequest({}));

    expect(response.status).toBe(422);
  });

  it("returns 422 for invalid provider prefix in id", async () => {
    const handler = createInvokeRouteHandler();

    const response = await handler(
      buildRequest({
        id: "unknown:agent-1",
      })
    );

    expect(response.status).toBe(422);
  });

  it("returns 404 when agent is not found", async () => {
    const getById = vi.fn().mockResolvedValue(null);
    const fetchFn = vi.fn();
    const handler = createInvokeRouteHandler({
      adapters: {
        dexter: { getById } satisfies InvokeAdapter,
      },
      fetchFn,
    });

    const response = await handler(
      buildRequest({
        id: "dexter:missing",
      })
    );

    expect(response.status).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 422 for localhost or private endpoint URL", async () => {
    const agent = createAgent("payai:agent-1", {
      url: "http://127.0.0.1:8080/run",
      method: "POST",
    });
    const getById = vi.fn().mockResolvedValue(agent);
    const fetchFn = vi.fn();
    const handler = createInvokeRouteHandler({
      adapters: {
        payai: { getById } satisfies InvokeAdapter,
      },
      fetchFn,
    });

    const response = await handler(
      buildRequest({
        id: "payai:agent-1",
      })
    );

    expect(response.status).toBe(422);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 422 for IPv6 localhost endpoint URL literal", async () => {
    const agent = createAgent("coinbase:agent-ipv6", {
      url: "http://[::1]:8080/run",
      method: "POST",
    });
    const getById = vi.fn().mockResolvedValue(agent);
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const handler = createInvokeRouteHandler({
      adapters: {
        coinbase: { getById } satisfies InvokeAdapter,
      },
      fetchFn,
    });

    const response = await handler(
      buildRequest({
        id: "coinbase:agent-ipv6",
      })
    );

    expect(response.status).toBe(422);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 422 when GET endpoint receives non-object input", async () => {
    const agent = createAgent("coinbase:agent-1", {
      url: "https://api.example.com/invoke",
      method: "GET",
    });
    const getById = vi.fn().mockResolvedValue(agent);
    const fetchFn = vi.fn();
    const handler = createInvokeRouteHandler({
      adapters: {
        coinbase: { getById } satisfies InvokeAdapter,
      },
      fetchFn,
    });

    const response = await handler(
      buildRequest({
        id: "coinbase:agent-1",
        input: "not-an-object",
      })
    );

    expect(response.status).toBe(422);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("proxies GET invoke with query params, manual redirect, and passthrough 402", async () => {
    const agent = createAgent("coinbase:agent-2", {
      url: "https://api.example.com/invoke",
      method: "GET",
    });
    const getById = vi.fn().mockResolvedValue(agent);
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "payment required" }), {
        status: 402,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "X-PAYMENT-RESPONSE": "challenge-token",
          "x-ignored": "ignore-me",
        },
      })
    );
    const handler = createInvokeRouteHandler({
      adapters: {
        coinbase: { getById } satisfies InvokeAdapter,
      },
      fetchFn,
    });

    const response = await handler(
      buildRequest({
        id: "coinbase:agent-2",
        input: {
          q: "hello",
          retries: 2,
          nested: { key: "value" },
          tags: ["a", "b"],
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload).toEqual({ error: "payment required" });
    expect(response.headers.get("X-PAYMENT-RESPONSE")).toBe("challenge-token");
    expect(response.headers.get("x-ignored")).toBeNull();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [targetUrl, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(targetUrl);

    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      "https://api.example.com/invoke"
    );
    expect(parsedUrl.searchParams.get("q")).toBe("hello");
    expect(parsedUrl.searchParams.get("retries")).toBe("2");
    expect(parsedUrl.searchParams.get("nested")).toBe(
      JSON.stringify({ key: "value" })
    );
    expect(parsedUrl.searchParams.get("tags")).toBe(JSON.stringify(["a", "b"]));

    const headers = new Headers(init.headers);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBeNull();
    expect(headers.get("X-PAYMENT")).toBeNull();
    expect(init.body).toBeUndefined();
  });

  it("proxies POST invoke with payment header and text response", async () => {
    const agent = createAgent("thirdweb:agent-3", {
      url: "https://upstream.example.com/run",
      method: "POST",
    });
    const getById = vi.fn().mockResolvedValue(agent);
    const fetchFn = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 201,
        headers: {
          "content-type": "text/plain",
          "PAYMENT-RESPONSE": "pay-ok",
          "x-extra-header": "drop",
        },
      })
    );
    const handler = createInvokeRouteHandler({
      adapters: {
        thirdweb: { getById } satisfies InvokeAdapter,
      },
      fetchFn,
    });

    const response = await handler(
      buildRequest({
        id: "thirdweb:agent-3",
        input: {
          prompt: "hi",
        },
        payment: {
          headerName: "X-PAYMENT",
          value: "signed-value",
        },
      })
    );
    const payloadText = await response.text();

    expect(response.status).toBe(201);
    expect(payloadText).toBe("ok");
    expect(response.headers.get("PAYMENT-RESPONSE")).toBe("pay-ok");
    expect(response.headers.get("x-extra-header")).toBeNull();

    const [targetUrl, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(targetUrl).toBe("https://upstream.example.com/run");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toBe(JSON.stringify({ prompt: "hi" }));

    const headers = new Headers(init.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-PAYMENT")).toBe("signed-value");
  });

  it("warms thirdweb cache by search on first getById miss", async () => {
    const agent = createAgent("thirdweb:agent-warm", {
      url: "https://upstream.example.com/run",
      method: "POST",
    });
    const getById = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(agent);
    const search = vi.fn().mockResolvedValue([agent]);
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const handler = createInvokeRouteHandler({
      adapters: {
        thirdweb: { getById, search } satisfies InvokeAdapter,
      },
      fetchFn,
    });

    const response = await handler(
      buildRequest({
        id: "thirdweb:agent-warm",
        input: { ping: "pong" },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(getById).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("");
  });
});
