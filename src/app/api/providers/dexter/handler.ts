import {
  createProviderProxyHandler,
  withForwardedQueryParams,
} from "@/app/api/providers/_shared/proxy";
import { dexterApiDefaults } from "@/lib/providers/dexter-adapter";

function resolveDexterApiUrl(request: Request): URL {
  const configured = process.env.DEXTER_API_URL?.trim();
  const endpointUrl =
    configured && configured.length > 0 ? configured : dexterApiDefaults.apiUrl;

  return withForwardedQueryParams(endpointUrl, request);
}

export const GET = createProviderProxyHandler({
  provider: "dexter",
  resolveUpstreamRequest: (request) => ({
    url: resolveDexterApiUrl(request),
    init: {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  }),
});
