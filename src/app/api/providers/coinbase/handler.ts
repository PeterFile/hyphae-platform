import {
  createProviderProxyHandler,
  withForwardedQueryParams,
} from "@/app/api/providers/_shared/proxy";
import { resolveCoinbaseFacilitatorUrl } from "@/lib/providers/coinbase-adapter";

function resolveDiscoveryUrl(request: Request): URL {
  const facilitatorUrl = resolveCoinbaseFacilitatorUrl();
  return withForwardedQueryParams(
    `${facilitatorUrl}/discovery/resources`,
    request
  );
}

export const GET = createProviderProxyHandler({
  provider: "coinbase",
  resolveUpstreamRequest: (request) => ({
    url: resolveDiscoveryUrl(request),
    init: {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  }),
});
