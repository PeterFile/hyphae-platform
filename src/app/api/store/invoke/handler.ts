import { z } from "zod";

import { CoinbaseAdapter } from "@/lib/providers/coinbase-adapter";
import { DexterAdapter } from "@/lib/providers/dexter-adapter";
import { PayAIAdapter } from "@/lib/providers/payai-adapter";
import { ThirdwebAdapter } from "@/lib/providers/thirdweb-adapter";
import { getProviderInvokeBlockMessage } from "@/lib/providers/invoke-policy";
import type { ProviderAdapter, ProviderName } from "@/lib/providers/types";
import { ProviderNameSchema } from "@/lib/providers/types";

type InvokeAdapter = Pick<ProviderAdapter, "getById">;

type InvokeRouteDependencies = {
  adapters?: Partial<Record<ProviderName, InvokeAdapter>>;
};

const InvokeRequestSchema = z.object({
  id: z.string().trim().min(1),
});

const defaultAdapters: Record<ProviderName, InvokeAdapter> = {
  coinbase: new CoinbaseAdapter(),
  thirdweb: new ThirdwebAdapter(),
  dexter: new DexterAdapter(),
  payai: new PayAIAdapter(),
};

function errorResponse(
  status: number,
  payload: { error: string; [key: string]: unknown }
): Response {
  return Response.json(payload, { status });
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

export function createInvokeRouteHandler(
  dependencies: InvokeRouteDependencies = {}
) {
  const adapters = {
    ...defaultAdapters,
    ...dependencies.adapters,
  };

  return async function POST(request: Request): Promise<Response> {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(422, {
        error: "Invalid request payload",
      });
    }

    const parsedBody = InvokeRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return errorResponse(422, {
        error: "Invalid request payload",
      });
    }

    const parsedId = parseProviderFromId(parsedBody.data.id);
    if (!parsedId) {
      return errorResponse(422, {
        error: "Invalid id format, expected provider:originalId",
      });
    }

    const blockedMessage = getProviderInvokeBlockMessage(parsedId.provider);
    if (blockedMessage !== null) {
      return errorResponse(422, {
        error: "provider_not_invokable_yet",
        provider: parsedId.provider,
        message: blockedMessage,
      });
    }

    const adapter = adapters[parsedId.provider];
    if (!adapter) {
      return errorResponse(500, {
        error: `Provider adapter "${parsedId.provider}" is not configured`,
      });
    }

    let agent;
    try {
      agent = await adapter.getById(parsedId.lookupId);
    } catch {
      return errorResponse(500, {
        error: "Failed to load agent by id",
      });
    }

    if (!agent) {
      return errorResponse(404, {
        error: "Agent not found",
      });
    }

    return errorResponse(501, {
      error: "invoke_not_implemented_yet",
      provider: parsedId.provider,
      id: agent.id,
      endpoint: {
        url: agent.endpoint.url,
        method: agent.endpoint.method,
      },
    });
  };
}

export const POST = createInvokeRouteHandler();
