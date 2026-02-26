import { z } from "zod";
import type { UnifiedAgent } from "@/lib/unified-schema";

export const providerNames = [
  "coinbase",
  "thirdweb",
  "dexter",
  "payai",
] as const;

export const ProviderNameSchema = z.enum(providerNames);

export type ProviderName = z.infer<typeof ProviderNameSchema>;

export type SearchFilters = {
  q?: string;
  provider?: ProviderName | ProviderName[];
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "price_asc" | "price_desc" | "relevance" | "availability";
  page?: number;
  pageSize?: number;
};

export type AvailabilityResult = {
  isOnline: boolean;
  lastChecked: string;
  latencyMs?: number;
  statusCode: number;
};

export type ProviderError = {
  provider: ProviderName;
  type: "timeout" | "adapter_error";
  message: string;
  cause?: unknown;
};

export interface ProviderAdapter {
  readonly name: ProviderName;
  search(query: string, filters?: SearchFilters): Promise<UnifiedAgent[]>;
  getById(id: string): Promise<UnifiedAgent | null>;
  checkAvailability(endpointUrl: string): Promise<AvailabilityResult>;
}
