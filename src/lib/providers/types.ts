import { z } from "zod";

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
  sort?: "price_asc" | "price_desc" | "name" | "rating";
  page?: number;
  pageSize?: number;
};

type CoinbaseProviderAgent = {
  provider: "coinbase";
  agent: {
    id: string;
  };
};

type ThirdwebProviderAgent = {
  provider: "thirdweb";
  agent: {
    id: string;
  };
};

type DexterProviderAgent = {
  provider: "dexter";
  agent: {
    id: string;
  };
};

type PayaiProviderAgent = {
  provider: "payai";
  agent: {
    id: string;
  };
};

export type ProviderAgent =
  | CoinbaseProviderAgent
  | ThirdwebProviderAgent
  | DexterProviderAgent
  | PayaiProviderAgent;

export type AvailabilityResult = {
  isOnline: boolean;
  lastChecked: string;
  latencyMs?: number;
  statusCode: number;
};

export interface ProviderAdapter {
  readonly name: ProviderName;
  search(query: string, filters?: SearchFilters): Promise<ProviderAgent[]>;
  getById(id: string): Promise<ProviderAgent | null>;
  checkAvailability(endpointUrl: string): Promise<AvailabilityResult>;
}
