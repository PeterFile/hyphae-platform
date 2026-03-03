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
    source: z.enum(["api", "mock-fallback"]).optional(),
    note: z.string().optional(),
    comingSoon: z.boolean().optional(),
  })
  .optional();

const InputPropertyTypeSchema = z.enum([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
]);

const InputSchemaPropertySchema = z.object({
  type: InputPropertyTypeSchema,
  description: z.string().optional(),
  enum: z.array(z.string()).min(1).optional(),
  items: z
    .object({
      type: InputPropertyTypeSchema,
      description: z.string().optional(),
    })
    .optional(),
  example: z.unknown().optional(),
});

const InputSchemaSchema = z
  .object({
    type: z.literal("object"),
    description: z.string().optional(),
    properties: z.record(InputSchemaPropertySchema).default({}),
    required: z.array(z.string()).default([]),
    additionalProperties: z.boolean().optional(),
    example: z.record(z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    for (const fieldName of value.required) {
      if (!(fieldName in value.properties)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["required"],
          message: `required field "${fieldName}" must exist in properties`,
        });
      }
    }
  });

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
    inputSchema: InputSchemaSchema.optional(),
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
export type AgentInputSchema = z.infer<typeof InputSchemaSchema>;
export type AgentInputProperty = z.infer<typeof InputSchemaPropertySchema>;

export function createOpenInputSchema(
  endpointMethod: "GET" | "POST"
): AgentInputSchema {
  const description =
    endpointMethod === "GET"
      ? "Gateway input object for GET endpoints. Keys are converted to query string parameters."
      : "Gateway input object for POST endpoints. Keys are forwarded as JSON body fields.";

  return {
    type: "object",
    description,
    properties: {},
    required: [],
    additionalProperties: true,
    example: {},
  };
}
