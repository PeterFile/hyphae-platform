import { describe, expect, it } from "vitest";

import { buildInvokeParameterDocs } from "@/lib/invoke-parameter-docs";

describe("buildInvokeParameterDocs", () => {
  it("documents POST input as JSON body and keeps id in examples", () => {
    const docs = buildInvokeParameterDocs({
      agentId: "coinbase:weather-agent",
      endpointMethod: "POST",
    });

    const inputField = docs.fields.find((field) => field.name === "input");
    expect(inputField).toBeDefined();
    expect(inputField?.description).toContain("JSON body");

    const invokeExample = JSON.parse(docs.invokeExampleJson) as {
      id: string;
      input: Record<string, string>;
    };
    expect(invokeExample.id).toBe("coinbase:weather-agent");
    expect(invokeExample.input).toMatchObject({ prompt: "hello" });
  });

  it("documents GET input as query parameters and plain object only", () => {
    const docs = buildInvokeParameterDocs({
      agentId: "dexter:agent-1",
      endpointMethod: "GET",
    });

    const inputField = docs.fields.find((field) => field.name === "input");
    expect(inputField).toBeDefined();
    expect(inputField?.description).toContain("query string");
    expect(inputField?.description).toContain("plain object");
  });

  it("documents 402 retry payment fields and supported header names", () => {
    const docs = buildInvokeParameterDocs({
      agentId: "payai:agent-2",
      endpointMethod: "POST",
    });

    const headerNameField = docs.fields.find(
      (field) => field.name === "payment.headerName"
    );
    expect(headerNameField).toBeDefined();
    expect(headerNameField?.description).toContain("X-PAYMENT");
    expect(headerNameField?.description).toContain("PAYMENT-SIGNATURE");

    const retryExample = JSON.parse(docs.retryExampleJson) as {
      payment?: {
        headerName?: string;
      };
    };
    expect(retryExample.payment?.headerName).toBe("X-PAYMENT");
  });
});
