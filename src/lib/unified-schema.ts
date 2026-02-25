import { z } from "zod";

import { ProviderNameSchema } from "@/lib/providers/types";

const EndpointSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]),
});

const PricingSchema = z.object({
  amountUsdcCents: z.number().int().nonnegative(),
  rawAmount: z.string(),
  rawAsset: z.string(),
  network: z.string(),
});

const AvailabilitySchema = z.object({
  isOnline: z.boolean(),
  lastChecked: z.string().datetime({ offset: true }),
  latencyMs: z.number().nonnegative().optional(),
  statusCode: z.number().int().nonnegative(),
});

const MetadataSchema = z
  .object({
    registeredAt: z.string().datetime({ offset: true }).optional(),
    totalCalls: z.number().int().nonnegative().optional(),
    rating: z.number().min(0).max(5).optional(),
  })
  .optional();

export const UnifiedAgentSchema = z
  .object({
    id: z.string(),
    provider: ProviderNameSchema,
    originalId: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.string().default("General"),
    tags: z.array(z.string()).default([]),
    endpoint: EndpointSchema,
    pricing: PricingSchema,
    availability: AvailabilitySchema,
    metadata: MetadataSchema,
  })
  .superRefine((value, ctx) => {
    const expectedId = `${value.provider}:${value.originalId}`;
    if (value.id !== expectedId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `id must match ${expectedId}`,
        path: ["id"],
      });
    }
  });

export type UnifiedAgent = z.infer<typeof UnifiedAgentSchema>;
