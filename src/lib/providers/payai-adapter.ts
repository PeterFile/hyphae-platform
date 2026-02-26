import { checkEndpoint } from "@/lib/availability-checker";
import { normalizeToUsdcCents } from "@/lib/price-normalizer";
import type {
  AvailabilityResult,
  ProviderAdapter,
  SearchFilters,
} from "@/lib/providers/types";
import { UnifiedAgentSchema, type UnifiedAgent } from "@/lib/unified-schema";

const DEFAULT_RPC_TIMEOUT_MS = 3000;
const PAYAI_PROVIDER_PREFIX = "payai:";
const JSON_RPC_VERSION = "2.0";

type ProgramAccount = {
  pubkey: string;
};

export type PayAIRawAgent = {
  originalId: string;
  name: string;
  description: string;
  endpointUrl: string;
  rawAmount: string;
  rawAsset: string;
  network: string;
  tags?: string[];
  category?: string;
};

type PayAIAdapterOptions = {
  rpcUrl?: string;
  programId?: string;
  fetchFn?: typeof fetch;
};

const MOCK_AGENTS: PayAIRawAgent[] = [
  {
    originalId: "payai-mock-echo",
    name: "PayAI Mock Echo",
    description:
      "Fallback mock agent for PayAI when Solana RPC is unavailable.",
    endpointUrl: "https://payai.example/agents/payai-mock-echo",
    rawAmount: "1000000",
    rawAsset: "USDC",
    network: "solana",
    tags: ["payai", "mock", "solana"],
    category: "General",
  },
  {
    originalId: "payai-mock-summarizer",
    name: "PayAI Mock Summarizer",
    description:
      "Fallback summarizer listing used for best-effort PayAI integration.",
    endpointUrl: "https://payai.example/agents/payai-mock-summarizer",
    rawAmount: "2500000",
    rawAsset: "USDC",
    network: "solana",
    tags: ["payai", "mock", "solana"],
    category: "General",
  },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseProgramAccounts(payload: unknown): ProgramAccount[] | null {
  if (!isObject(payload)) {
    return null;
  }

  const result = payload.result;
  if (!Array.isArray(result)) {
    return null;
  }

  const accounts: ProgramAccount[] = [];
  for (const item of result) {
    if (!isObject(item)) {
      return null;
    }

    const pubkey = item.pubkey;
    if (typeof pubkey !== "string" || pubkey.trim() === "") {
      return null;
    }

    accounts.push({ pubkey });
  }

  return accounts;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLookupId(id: string): string {
  const trimmedId = id.trim();
  if (trimmedId.startsWith(PAYAI_PROVIDER_PREFIX)) {
    return trimmedId.slice(PAYAI_PROVIDER_PREFIX.length);
  }

  return trimmedId;
}

export class PayAIAdapter implements ProviderAdapter {
  readonly name = "payai" as const;

  private readonly rpcUrl?: string;
  private readonly programId?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: PayAIAdapterOptions = {}) {
    this.rpcUrl = options.rpcUrl ?? process.env.PAYAI_RPC_URL;
    this.programId = options.programId ?? process.env.PAYAI_PROGRAM_ID;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async search(
    query: string,
    filters?: SearchFilters
  ): Promise<UnifiedAgent[]> {
    if (!this.shouldIncludeProvider(filters?.provider)) {
      return [];
    }

    const normalizedQuery = normalizeSearchText(query);
    const agents = await this.loadUnifiedAgents();
    const filteredAgents =
      normalizedQuery === ""
        ? agents
        : agents.filter((agent) => this.matchesQuery(agent, normalizedQuery));

    return filteredAgents;
  }

  async getById(id: string): Promise<UnifiedAgent | null> {
    const lookupId = normalizeLookupId(id);
    if (lookupId === "") {
      return null;
    }

    const agents = await this.loadUnifiedAgents();
    const matchedAgent = agents.find((agent) => agent.originalId === lookupId);

    if (!matchedAgent) {
      return null;
    }

    return matchedAgent;
  }

  async checkAvailability(endpointUrl: string): Promise<AvailabilityResult> {
    const result = await checkEndpoint(endpointUrl);
    return {
      isOnline: result.isOnline,
      lastChecked: result.lastChecked,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode ?? 0,
    };
  }

  normalize(rawAgent: PayAIRawAgent): UnifiedAgent {
    const pricing = normalizeToUsdcCents(
      rawAgent.rawAmount,
      rawAgent.rawAsset,
      rawAgent.network
    );
    const amountUsdcCents = pricing.priceUnavailable
      ? 0
      : pricing.amountUsdcCents;

    return UnifiedAgentSchema.parse({
      id: `${this.name}:${rawAgent.originalId}`,
      provider: this.name,
      originalId: rawAgent.originalId,
      name: rawAgent.name,
      description: rawAgent.description,
      category: rawAgent.category ?? "General",
      tags: rawAgent.tags ?? [],
      endpoint: {
        url: rawAgent.endpointUrl,
        method: "GET",
      },
      pricing: {
        amountUsdcCents,
        rawAmount: rawAgent.rawAmount,
        rawAsset: rawAgent.rawAsset,
        network: rawAgent.network,
      },
      availability: {
        isOnline: false,
        lastChecked: new Date().toISOString(),
        statusCode: 0,
      },
    });
  }

  private matchesQuery(agent: UnifiedAgent, query: string): boolean {
    return (
      normalizeSearchText(agent.id).includes(query) ||
      normalizeSearchText(agent.originalId).includes(query) ||
      normalizeSearchText(agent.name).includes(query) ||
      normalizeSearchText(agent.description).includes(query)
    );
  }

  private shouldIncludeProvider(
    provider: SearchFilters["provider"] | undefined
  ): boolean {
    if (!provider) {
      return true;
    }

    if (Array.isArray(provider)) {
      return provider.includes(this.name);
    }

    return provider === this.name;
  }

  private async loadUnifiedAgents(): Promise<UnifiedAgent[]> {
    const rpcAgents = await this.loadFromRpc();
    if (rpcAgents !== null && rpcAgents.length > 0) {
      return rpcAgents.map((item) => this.normalize(item));
    }

    return MOCK_AGENTS.map((item) => this.normalize(item));
  }

  private async loadFromRpc(): Promise<PayAIRawAgent[] | null> {
    if (!this.rpcUrl || !this.programId) {
      return null;
    }

    try {
      const programAccounts = await this.fetchProgramAccounts();
      return programAccounts.map((account) => this.mapProgramAccount(account));
    } catch {
      return null;
    }
  }

  private async fetchProgramAccounts(): Promise<ProgramAccount[]> {
    if (!this.rpcUrl || !this.programId) {
      return [];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DEFAULT_RPC_TIMEOUT_MS
    );

    try {
      const response = await this.fetchFn(this.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: JSON_RPC_VERSION,
          id: 1,
          method: "getProgramAccounts",
          params: [
            this.programId,
            {
              withContext: false,
              encoding: "base64",
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`PayAI RPC failed with status ${response.status}`);
      }

      const payload: unknown = await response.json();
      const accounts = parseProgramAccounts(payload);
      if (accounts === null) {
        throw new Error("PayAI RPC returned an unexpected payload");
      }

      return accounts;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private mapProgramAccount(account: ProgramAccount): PayAIRawAgent {
    const shortId = account.pubkey.slice(0, 8);
    return {
      originalId: account.pubkey,
      name: `PayAI Agent ${shortId}`,
      description: "Best-effort PayAI listing discovered from Solana program.",
      endpointUrl: `https://payai.example/agents/${account.pubkey}`,
      rawAmount: "1000000",
      rawAsset: "USDC",
      network: "solana",
      tags: ["payai", "solana"],
      category: "General",
    };
  }
}
