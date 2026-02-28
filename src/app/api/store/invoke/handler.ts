import { isIP } from "node:net";
import { z } from "zod";

import { CoinbaseAdapter } from "@/lib/providers/coinbase-adapter";
import { DexterAdapter } from "@/lib/providers/dexter-adapter";
import { PayAIAdapter } from "@/lib/providers/payai-adapter";
import { ThirdwebAdapter } from "@/lib/providers/thirdweb-adapter";
import type { ProviderAdapter, ProviderName } from "@/lib/providers/types";
import { ProviderNameSchema } from "@/lib/providers/types";

const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const PAYMENT_RESPONSE_HEADERS = ["X-PAYMENT-RESPONSE", "PAYMENT-RESPONSE"];

const InvokeRequestSchema = z.object({
  id: z.string().trim().min(1),
  input: z.unknown().optional(),
  payment: z
    .object({
      headerName: z.enum(["X-PAYMENT", "PAYMENT-SIGNATURE"]),
      value: z.string().min(1),
    })
    .optional(),
});

type InvokeRequest = z.infer<typeof InvokeRequestSchema>;
type InvokeAdapter = Pick<ProviderAdapter, "getById"> &
  Partial<Pick<ProviderAdapter, "search">>;

export type InvokeRouteDependencies = {
  adapters?: Partial<Record<ProviderName, InvokeAdapter>>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

const defaultAdapters: Record<ProviderName, InvokeAdapter> = {
  coinbase: new CoinbaseAdapter(),
  thirdweb: new ThirdwebAdapter(),
  dexter: new DexterAdapter(),
  payai: new PayAIAdapter(),
};

function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

function parseProviderFromId(
  id: string
): { provider: ProviderName; lookupId: string } | null {
  const trimmed = id.trim();
  const delimiterIndex = trimmed.indexOf(":");

  if (delimiterIndex <= 0 || delimiterIndex === trimmed.length - 1) {
    return null;
  }

  const provider = ProviderNameSchema.safeParse(
    trimmed.slice(0, delimiterIndex)
  );
  if (!provider.success) {
    return null;
  }

  return {
    provider: provider.data,
    lookupId: trimmed,
  };
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number(part));
  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets;

  if (first === 10 || first === 127 || first === 0) {
    return true;
  }

  if (first === 169 && second === 254) {
    return true;
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }

  return first === 192 && second === 168;
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized === "::"
  ) {
    return true;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  if (
    normalized.startsWith("fe80") ||
    normalized.startsWith("fe90") ||
    normalized.startsWith("fea0") ||
    normalized.startsWith("feb0")
  ) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isPrivateIpv4(mapped);
  }

  return false;
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = (() => {
    const lower = hostname.toLowerCase();
    const withoutBrackets =
      lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
    const zoneDelimiterIndex = withoutBrackets.indexOf("%");
    if (zoneDelimiterIndex === -1) {
      return withoutBrackets;
    }

    return withoutBrackets.slice(0, zoneDelimiterIndex);
  })();

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
}

function validateEndpointUrl(url: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return "Invalid agent endpoint URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Endpoint protocol must be http or https";
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return "Endpoint URL must not include credentials";
  }

  if (isUnsafeHostname(parsed.hostname)) {
    return "Endpoint URL points to localhost or private network";
  }

  return null;
}

function parseContentLengthHeader(
  contentLengthHeader: string | null
): number | null {
  if (contentLengthHeader === null) {
    return null;
  }

  const trimmed = contentLengthHeader.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

async function readBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<{ body: string } | { error: "too_large" | "invalid_body" }> {
  const contentLength = parseContentLengthHeader(
    request.headers.get("content-length")
  );
  if (contentLength !== null && contentLength > maxBytes) {
    return { error: "too_large" };
  }

  if (!request.body) {
    return { body: "" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {}

        return { error: "too_large" };
      }

      chunks.push(value);
    }
  } catch {
    return { error: "invalid_body" };
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    body: new TextDecoder().decode(merged),
  };
}

async function resolveAgentById(
  adapter: InvokeAdapter,
  provider: ProviderName,
  lookupId: string
) {
  const direct = await adapter.getById(lookupId);
  if (direct) {
    return direct;
  }

  if (provider === "thirdweb" && adapter.search) {
    await adapter.search("");
    return adapter.getById(lookupId);
  }

  return null;
}

function parseInvokeRequest(payloadText: string): InvokeRequest | null {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(payloadText);
  } catch {
    return null;
  }

  const parsedBody = InvokeRequestSchema.safeParse(parsedJson);
  if (!parsedBody.success) {
    return null;
  }

  return parsedBody.data;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toQueryValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function buildGetInvokeUrl(
  endpointUrl: string,
  input: unknown
): { url: string } | { error: string } {
  const parsedEndpoint = new URL(endpointUrl);
  const normalizedInput = input ?? {};

  if (!isPlainObject(normalizedInput)) {
    return { error: "GET endpoint input must be a plain object" };
  }

  for (const [key, value] of Object.entries(normalizedInput)) {
    if (value === undefined) {
      continue;
    }

    parsedEndpoint.searchParams.append(key, toQueryValue(value));
  }

  return { url: parsedEndpoint.toString() };
}

function pickResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers();

  for (const headerName of PAYMENT_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(headerName);
    if (value !== null) {
      headers.set(headerName, value);
    }
  }

  return headers;
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("application/json") || normalized.includes("+json")
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError";
}

export function createInvokeRouteHandler(
  dependencies: InvokeRouteDependencies = {}
) {
  const adapters = {
    ...defaultAdapters,
    ...dependencies.adapters,
  };
  const fetchFn = dependencies.fetchFn ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function POST(request: Request): Promise<Response> {
    const limitedBody = await readBodyWithLimit(
      request,
      MAX_REQUEST_BODY_BYTES
    );
    if ("error" in limitedBody) {
      if (limitedBody.error === "too_large") {
        return errorResponse(413, "Request body exceeds 64KB limit");
      }

      return errorResponse(422, "Invalid request payload");
    }

    const rawBody = limitedBody.body;

    const invokeRequest = parseInvokeRequest(rawBody);
    if (!invokeRequest) {
      return errorResponse(422, "Invalid request payload");
    }

    const parsedId = parseProviderFromId(invokeRequest.id);
    if (!parsedId) {
      return errorResponse(
        422,
        "Invalid id format, expected provider:originalId"
      );
    }

    const adapter = adapters[parsedId.provider];
    if (!adapter) {
      return errorResponse(
        500,
        `Provider adapter "${parsedId.provider}" is not configured`
      );
    }

    let agent;
    try {
      agent = await resolveAgentById(
        adapter,
        parsedId.provider,
        parsedId.lookupId
      );
    } catch {
      return errorResponse(500, "Failed to load agent by id");
    }

    if (!agent) {
      return errorResponse(404, "Agent not found");
    }

    const endpointValidationError = validateEndpointUrl(agent.endpoint.url);
    if (endpointValidationError) {
      return errorResponse(422, endpointValidationError);
    }

    const headers = new Headers({
      Accept: "application/json",
    });
    if (invokeRequest.payment) {
      headers.set(
        invokeRequest.payment.headerName,
        invokeRequest.payment.value
      );
    }

    let upstreamUrl = agent.endpoint.url;
    let requestBody: string | undefined;
    if (agent.endpoint.method === "GET") {
      const builtUrl = buildGetInvokeUrl(
        agent.endpoint.url,
        invokeRequest.input
      );
      if ("error" in builtUrl) {
        return errorResponse(422, builtUrl.error);
      }

      upstreamUrl = builtUrl.url;
    } else {
      headers.set("Content-Type", "application/json");
      requestBody = JSON.stringify(invokeRequest.input ?? {});
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetchFn(upstreamUrl, {
        method: agent.endpoint.method,
        headers,
        body: requestBody,
        redirect: "manual",
        signal: abortController.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return errorResponse(504, "Upstream request timed out");
      }

      return errorResponse(502, "Failed to invoke upstream endpoint");
    } finally {
      clearTimeout(timeoutId);
    }

    const responseHeaders = pickResponseHeaders(upstreamResponse.headers);

    if (isJsonContentType(upstreamResponse.headers.get("content-type"))) {
      try {
        const payload = await upstreamResponse.json();
        return Response.json(payload, {
          status: upstreamResponse.status,
          headers: responseHeaders,
        });
      } catch {
        return errorResponse(502, "Invalid JSON response from upstream");
      }
    }

    const payloadText = await upstreamResponse.text();
    return new Response(payloadText, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  };
}
