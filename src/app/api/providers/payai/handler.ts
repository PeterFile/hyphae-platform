import { createProviderProxyHandler } from "@/app/api/providers/_shared/proxy";

const DEFAULT_ENCODING = "base64";

function readRequiredEnv(name: "PAYAI_RPC_URL" | "PAYAI_PROGRAM_ID"): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function readEncoding(request: Request): string {
  const value = new URL(request.url).searchParams.get("encoding")?.trim();
  return value && value.length > 0 ? value : DEFAULT_ENCODING;
}

function readWithContext(request: Request): boolean {
  return new URL(request.url).searchParams.get("withContext") === "true";
}

export const GET = createProviderProxyHandler({
  provider: "payai",
  resolveUpstreamRequest: (request) => {
    const rpcUrl = new URL(readRequiredEnv("PAYAI_RPC_URL"));
    const requestUrl = new URL(request.url);

    requestUrl.searchParams.forEach((value, key) => {
      rpcUrl.searchParams.append(key, value);
    });

    return {
      url: rpcUrl,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getProgramAccounts",
          params: [
            readRequiredEnv("PAYAI_PROGRAM_ID"),
            {
              withContext: readWithContext(request),
              encoding: readEncoding(request),
            },
          ],
        }),
      },
    };
  },
});
