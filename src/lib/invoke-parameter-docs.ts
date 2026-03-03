import type {
  AgentInputSchema,
  AgentInputProperty,
} from "@/lib/unified-schema";

type EndpointMethod = "GET" | "POST";

export type InvokeParameterDocField = {
  name: string;
  required: boolean;
  type: string;
  description: string;
};

export type InvokeParameterDocs = {
  fields: InvokeParameterDocField[];
  transportNotes: string[];
  invokeExampleJson: string;
  retryExampleJson: string;
};

function getInputDescription(endpointMethod: EndpointMethod): string {
  if (endpointMethod === "GET") {
    return "Optional plain object. Gateway appends keys as query string parameters; nested objects/arrays are JSON-stringified.";
  }

  return "Optional object. Gateway forwards it as JSON body. When omitted, gateway sends {}.";
}

function getInputExample(
  endpointMethod: EndpointMethod
): Record<string, string> {
  if (endpointMethod === "GET") {
    return {
      city: "Shanghai",
      unit: "c",
    };
  }

  return {
    prompt: "hello",
  };
}

function getPropertyExampleValue(property: AgentInputProperty): unknown {
  if (property.example !== undefined) {
    return property.example;
  }

  switch (property.type) {
    case "string":
      return "example";
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return null;
  }
}

function buildStructuredInputFields(
  inputSchema: AgentInputSchema | undefined
): InvokeParameterDocField[] {
  if (!inputSchema) {
    return [];
  }

  const names = Object.keys(inputSchema.properties).sort();
  if (names.length === 0) {
    return [];
  }

  const requiredSet = new Set(inputSchema.required);

  return names.map((name) => {
    const property = inputSchema.properties[name];
    const enumSuffix =
      property.enum && property.enum.length > 0
        ? ` Allowed values: ${property.enum.join(", ")}.`
        : "";
    const description = property.description ?? "No description provided.";

    return {
      name: `input.${name}`,
      required: requiredSet.has(name),
      type: property.type,
      description: `${description}${enumSuffix}`,
    };
  });
}

function buildInputExample(
  endpointMethod: EndpointMethod,
  inputSchema?: AgentInputSchema
): Record<string, unknown> {
  if (!inputSchema) {
    return getInputExample(endpointMethod);
  }

  if (inputSchema.example) {
    return inputSchema.example;
  }

  const propertyEntries = Object.entries(inputSchema.properties);
  if (propertyEntries.length === 0) {
    return getInputExample(endpointMethod);
  }

  return Object.fromEntries(
    propertyEntries.map(([name, property]) => [
      name,
      getPropertyExampleValue(property),
    ])
  );
}

export function buildInvokeParameterDocs(input: {
  agentId: string;
  endpointMethod: EndpointMethod;
  inputSchema?: AgentInputSchema;
}): InvokeParameterDocs {
  const inputExample = buildInputExample(
    input.endpointMethod,
    input.inputSchema
  );
  const structuredInputFields = buildStructuredInputFields(input.inputSchema);
  const hasStructuredInputFields = structuredInputFields.length > 0;

  const fields: InvokeParameterDocField[] = [
    {
      name: "id",
      required: true,
      type: "string",
      description:
        "Required unified agent id in provider:originalId format, usually from GET /api/store/search results[i].id.",
    },
    {
      name: "input",
      required: false,
      type: "object",
      description: hasStructuredInputFields
        ? "Optional structured object. See input.* fields below."
        : getInputDescription(input.endpointMethod),
    },
    ...structuredInputFields,
    {
      name: "payment",
      required: false,
      type: "object",
      description:
        "Optional payment proof object used when upstream responds with HTTP 402.",
    },
    {
      name: "payment.headerName",
      required: false,
      type: '"X-PAYMENT" | "PAYMENT-SIGNATURE"',
      description:
        "Supported payment header names forwarded by gateway: X-PAYMENT or PAYMENT-SIGNATURE.",
    },
    {
      name: "payment.value",
      required: false,
      type: "string",
      description:
        "Signed payment token/value generated client-side from 402 requirement.",
    },
  ];

  const transportNotes =
    input.endpointMethod === "GET"
      ? [
          "This agent endpoint is GET, so gateway maps input fields to query string.",
          "GET input must be a plain object.",
        ]
      : [
          "This agent endpoint is POST, so gateway forwards input as JSON body.",
          "If input is omitted, gateway sends an empty object {}.",
        ];

  const invokeExampleJson = JSON.stringify(
    {
      id: input.agentId,
      input: inputExample,
    },
    null,
    2
  );

  const retryExampleJson = JSON.stringify(
    {
      id: input.agentId,
      input: inputExample,
      payment: {
        headerName: "X-PAYMENT",
        value: "<signed-payment-token>",
      },
    },
    null,
    2
  );

  return {
    fields,
    transportNotes,
    invokeExampleJson,
    retryExampleJson,
  };
}
