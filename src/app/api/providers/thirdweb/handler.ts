import {
  createProviderProxyHandler,
  withForwardedQueryParams,
} from "@/app/api/providers/_shared/proxy";

const DEFAULT_THIRDWEB_DISCOVERY_URL =
  "https://api.thirdweb.com/v1/payments/x402/discovery/resources";

function resolveThirdwebSecretKey(): string {
  const secretKey = process.env.THIRDWEB_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("THIRDWEB_SECRET_KEY is not configured");
  }

  return secretKey;
}

function resolveThirdwebDiscoveryUrl(request: Request): URL {
  const configured = process.env.THIRDWEB_DISCOVERY_URL?.trim();
  const endpointUrl =
    configured && configured.length > 0
      ? configured
      : DEFAULT_THIRDWEB_DISCOVERY_URL;

  return withForwardedQueryParams(endpointUrl, request);
}

export const GET = createProviderProxyHandler({
  provider: "thirdweb",
  resolveUpstreamRequest: (request) => ({
    url: resolveThirdwebDiscoveryUrl(request),
    init: {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-client-id": resolveThirdwebSecretKey(),
      },
    },
  }),
});
