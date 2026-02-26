import { isIP } from "node:net";
import { z } from "zod";

import { CoinbaseAdapter } from "@/lib/providers/coinbase-adapter";
import { DexterAdapter } from "@/lib/providers/dexter-adapter";
import { PayAIAdapter } from "@/lib/providers/payai-adapter";
import { ThirdwebAdapter } from "@/lib/providers/thirdweb-adapter";
import type {
  AvailabilityResult,
  ProviderAdapter,
  ProviderName,
} from "@/lib/providers/types";
import { ProviderNameSchema } from "@/lib/providers/types";

const CACHE_TTL_MS = 30_000;

const AvailabilityQuerySchema = z.object({
  id: z.string().trim().min(1),
});

type AvailabilityPayload = {
  isOnline: boolean;
  latencyMs: number;
  lastChecked: string;
};

type AvailabilityAdapter = Pick<
  ProviderAdapter,
  "getById" | "checkAvailability"
>;

type AvailabilityCacheEntry = {
  expiresAt: number;
  value: AvailabilityPayload;
};

export type AvailabilityRouteDependencies = {
  adapters?: Partial<Record<ProviderName, AvailabilityAdapter>>;
  cache?: Map<string, AvailabilityCacheEntry>;
  now?: () => number;
};

const defaultCache = new Map<string, AvailabilityCacheEntry>();

const defaultAdapters: Record<ProviderName, AvailabilityAdapter> = {
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
  const normalized = hostname.toLowerCase();

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

function toPayload(result: AvailabilityResult): AvailabilityPayload {
  return {
    isOnline: result.isOnline,
    latencyMs: result.latencyMs ?? 0,
    lastChecked: result.lastChecked,
  };
}

function readCache(
  cache: Map<string, AvailabilityCacheEntry>,
  key: string,
  nowMs: number
): AvailabilityPayload | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= nowMs) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function toCacheKey(id: string, endpointUrl: string): string {
  return `${id}:${endpointUrl}`;
}

export function createAvailabilityRouteHandler(
  dependencies: AvailabilityRouteDependencies = {}
) {
  const adapters = {
    ...defaultAdapters,
    ...dependencies.adapters,
  };
  const cache = dependencies.cache ?? defaultCache;
  const now = dependencies.now ?? (() => Date.now());

  return async function GET(request: Request): Promise<Response> {
    const parsedQuery = AvailabilityQuerySchema.safeParse({
      id: new URL(request.url).searchParams.get("id"),
    });
    if (!parsedQuery.success) {
      return errorResponse(422, "Invalid query parameter: id");
    }

    const parsedId = parseProviderFromId(parsedQuery.data.id);
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
      agent = await adapter.getById(parsedId.lookupId);
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

    const nowMs = now();
    const cacheKey = toCacheKey(agent.id, agent.endpoint.url);
    const cachedResult = readCache(cache, cacheKey, nowMs);
    if (cachedResult) {
      return Response.json(cachedResult);
    }

    let availabilityResult: AvailabilityResult;
    try {
      availabilityResult = await adapter.checkAvailability(agent.endpoint.url);
    } catch {
      return errorResponse(500, "Failed to check endpoint availability");
    }

    const payload = toPayload(availabilityResult);
    cache.set(cacheKey, {
      value: payload,
      expiresAt: nowMs + CACHE_TTL_MS,
    });

    return Response.json(payload);
  };
}
