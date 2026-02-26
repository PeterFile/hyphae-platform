import { describe, expect, it, vi } from "vitest";

import {
  createProviderProxyHandler,
  withForwardedQueryParams,
} from "@/app/api/providers/_shared/proxy";

describe("withForwardedQueryParams", () => {
  it("forwards all incoming query params", () => {
    const request = new Request(
      "https://unit.test/api/providers/coinbase?q=agent&page=2"
    );

    const url = withForwardedQueryParams(
      "https://api.example.com/discovery/resources",
      request
    );

    expect(url.toString()).toBe(
      "https://api.example.com/discovery/resources?q=agent&page=2"
    );
  });
});

describe("createProviderProxyHandler", () => {
  it("returns upstream payload for successful response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json(
        {
          items: [{ id: "a1" }],
        },
        { status: 200 }
      )
    );
    const handler = createProviderProxyHandler({
      provider: "coinbase",
      fetchImpl,
      resolveUpstreamRequest: (request) => ({
        url: withForwardedQueryParams(
          "https://api.example.com/resources",
          request
        ),
        init: {
          method: "GET",
        },
      }),
    });

    const response = await handler(
      new Request("https://unit.test/api/providers/coinbase?q=weather")
    );
    const payload = await response.json();
    const firstCallArgs = fetchImpl.mock.calls[0];

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      items: [{ id: "a1" }],
    });
    expect(String(firstCallArgs[0])).toBe(
      "https://api.example.com/resources?q=weather"
    );
    expect(firstCallArgs[1]?.method).toBe("GET");
  });

  it("returns unified 502 payload when upstream status is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json(
        {
          message: "upstream unavailable",
        },
        { status: 503 }
      )
    );
    const handler = createProviderProxyHandler({
      provider: "dexter",
      fetchImpl,
      resolveUpstreamRequest: () => ({
        url: new URL("https://api.dexter.cash/resources"),
      }),
    });

    const response = await handler(
      new Request("https://unit.test/api/providers/dexter")
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      error: {
        provider: "dexter",
        code: "upstream_http_error",
        message: "Upstream returned status 503",
        upstreamStatus: 503,
        details: { message: "upstream unavailable" },
      },
    });
  });

  it("returns unified 504 payload on timeout", async () => {
    vi.useFakeTimers();

    try {
      const fetchImpl = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!(signal instanceof AbortSignal)) {
              return;
            }

            signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          })
      );
      const handler = createProviderProxyHandler({
        provider: "coinbase",
        timeoutMs: 25,
        fetchImpl,
        resolveUpstreamRequest: () => ({
          url: new URL("https://api.example.com/resources"),
        }),
      });

      const responsePromise = handler(
        new Request("https://unit.test/api/providers/coinbase")
      );

      await vi.advanceTimersByTimeAsync(30);
      const response = await responsePromise;
      const payload = await response.json();

      expect(response.status).toBe(504);
      expect(payload).toEqual({
        error: {
          provider: "coinbase",
          code: "upstream_timeout",
          message: "Upstream request timed out after 25ms",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
