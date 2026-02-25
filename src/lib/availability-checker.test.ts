import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkEndpoint, checkMultiple } from "./availability-checker";

describe("availability-checker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends HEAD with manual redirect and reports online when endpoint returns 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpoint("https://example.com/health");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/health");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "HEAD",
      redirect: "manual",
    });
    expect(result.isOnline).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBeTypeOf("number");
    expect(Number.isNaN(Date.parse(result.lastChecked))).toBe(false);
  });

  it("falls back to GET when HEAD returns 405", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpoint("https://example.com/fallback");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
    expect(result.isOnline).toBe(true);
    expect(result.statusCode).toBe(204);
  });

  it("falls back to GET when HEAD returns 403", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpoint("https://example.com/forbidden-head");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
    expect(result.isOnline).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("treats 3xx as online and returns the original statusCode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpoint("https://example.com/redirect");

    expect(result.isOnline).toBe(true);
    expect(result.statusCode).toBe(302);
  });

  it("treats 5xx as online because endpoint responded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpoint("https://example.com/error");

    expect(result.isOnline).toBe(true);
    expect(result.statusCode).toBe(503);
  });

  it("returns offline and statusCode null when fetch throws network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkEndpoint("https://example.com/network-error");

    expect(result.isOnline).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.latencyMs).toBeTypeOf("number");
  });

  it("uses default timeout 3000ms and marks endpoint offline on timeout", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }

        signal.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("The operation was aborted.", "AbortError")
            ),
          { once: true }
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pendingResult = checkEndpoint("https://example.com/slow");
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pendingResult;

    expect(result.isOnline).toBe(false);
    expect(result.statusCode).toBeNull();
  });

  it("checkMultiple preserves input order and respects concurrency limit", async () => {
    vi.useFakeTimers();

    const urls = [
      "https://example.com/0",
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
      "https://example.com/5",
    ];

    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const index = Number(String(input).split("/").at(-1));
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          resolve(new Response(null, { status: 200 + index }));
        }, 20);
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pendingResults = checkMultiple(urls, 2);
    await vi.advanceTimersByTimeAsync(300);
    const results = await pendingResults;

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(results).toHaveLength(urls.length);
    expect(results.map((item) => item.statusCode)).toEqual([
      200, 201, 202, 203, 204, 205,
    ]);
  });
});
