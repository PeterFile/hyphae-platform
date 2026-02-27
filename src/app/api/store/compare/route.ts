import { z } from "zod";
import { CoinbaseAdapter } from "@/lib/providers/coinbase-adapter";
import { DexterAdapter } from "@/lib/providers/dexter-adapter";
import { AdapterRegistry } from "@/lib/providers/registry";
import { ThirdwebAdapter } from "@/lib/providers/thirdweb-adapter";
import { PayAIAdapter } from "@/lib/providers/payai-adapter";

const CompareRequestSchema = z.object({
  ids: z.array(z.string()).min(1).max(4),
});

function createDefaultRegistry(): AdapterRegistry {
  return new AdapterRegistry({
    adapters: [
      new CoinbaseAdapter(),
      new ThirdwebAdapter(),
      new DexterAdapter(),
      new PayAIAdapter(),
    ],
  });
}

const registry = createDefaultRegistry();

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = CompareRequestSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request payload", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { ids } = parsed.data;
    const adapters = registry.list();

    const fetchPromises = ids.map(async (id) => {
      const providerName = id.split(":")[0];
      const adapter = adapters.find((a) => a.name === providerName);
      if (!adapter) return null;
      try {
        return await adapter.getById(id);
      } catch (error) {
        console.error(`Error fetching agent ${id}:`, error);
        return null;
      }
    });

    const results = await Promise.all(fetchPromises);
    const validResults = results.filter((r) => r !== null);

    return Response.json({ results: validResults }, { status: 200 });
  } catch (error) {
    console.error("Compare API error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
