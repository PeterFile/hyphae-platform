import type { ProviderName } from "@/lib/providers/types";

const DEFAULT_PROXY_TIMEOUT_MS = 5_000;
const MAX_PROXY_TIMEOUT_MS = 60_000;

type ProxyErrorCode =
  | "missing_upstream_config"
  | "upstream_http_error"
  | "upstream_timeout"
  | "upstream_request_failed";

type ProxyErrorShape = {
  provider: ProviderName;
  code: ProxyErrorCode;
  message: string;
  upstreamStatus?: number;
  details?: unknown;
};

export type ProviderProxyRequest = {
  url: URL;
  init?: RequestInit;
};

type ProviderProxyHandlerOptions = {
  provider: ProviderName;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  resolveUpstreamRequest: (
    request: Request
  ) => ProviderProxyRequest | Promise<ProviderProxyRequest>;
};

function normalizeTimeoutMs(timeoutMs: number | undefined): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs === undefined) {
    return DEFAULT_PROXY_TIMEOUT_MS;
  }

  const floored = Math.floor(timeoutMs);
  if (floored <= 0) {
    return DEFAULT_PROXY_TIMEOUT_MS;
  }

  return Math.min(floored, MAX_PROXY_TIMEOUT_MS);
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error instanceof Error && error.name === "AbortError";
}

function errorResponse(status: number, error: ProxyErrorShape): Response {
  return Response.json({ error }, { status });
}

async function parseUpstreamPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  return response.text();
}

export function withForwardedQueryParams(
  baseUrl: string,
  request: Request
): URL {
  const upstreamUrl = new URL(baseUrl);
  const incomingParams = new URL(request.url).searchParams;

  incomingParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  return upstreamUrl;
}

export function createProviderProxyHandler(
  options: ProviderProxyHandlerOptions
): (request: Request) => Promise<Response> {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;

  return async function GET(request: Request): Promise<Response> {
    let upstreamRequest: ProviderProxyRequest;

    try {
      upstreamRequest = await options.resolveUpstreamRequest(request);
    } catch (error) {
      return errorResponse(500, {
        provider: options.provider,
        code: "missing_upstream_config",
        message:
          error instanceof Error
            ? error.message
            : "Failed to resolve upstream configuration",
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const upstreamResponse = await fetchImpl(upstreamRequest.url, {
        ...upstreamRequest.init,
        signal: controller.signal,
      });
      const payload = await parseUpstreamPayload(upstreamResponse);

      if (!upstreamResponse.ok) {
        return errorResponse(502, {
          provider: options.provider,
          code: "upstream_http_error",
          message: `Upstream returned status ${upstreamResponse.status}`,
          upstreamStatus: upstreamResponse.status,
          details: payload,
        });
      }

      return Response.json(payload, { status: upstreamResponse.status });
    } catch (error) {
      if (isAbortError(error)) {
        return errorResponse(504, {
          provider: options.provider,
          code: "upstream_timeout",
          message: `Upstream request timed out after ${timeoutMs}ms`,
        });
      }

      return errorResponse(502, {
        provider: options.provider,
        code: "upstream_request_failed",
        message:
          error instanceof Error ? error.message : "Failed to fetch upstream",
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
