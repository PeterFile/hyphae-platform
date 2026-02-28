import type { ProviderName } from "./types";

export type ProviderInvokePolicy = {
  directInvokeEnabled: boolean;
  message?: string;
};

export const providerInvokePolicies: Record<
  ProviderName,
  ProviderInvokePolicy
> = {
  coinbase: {
    directInvokeEnabled: true,
  },
  dexter: {
    directInvokeEnabled: true,
  },
  payai: {
    directInvokeEnabled: true,
  },
  thirdweb: {
    directInvokeEnabled: false,
    message:
      "thirdweb getById currently depends on prior discovery search cache and can miss ids due to pagination; direct invoke is disabled until adapter lookup is stable without search.",
  },
};

export function getProviderInvokeBlockMessage(
  provider: ProviderName
): string | null {
  const policy = providerInvokePolicies[provider];
  if (!policy.directInvokeEnabled) {
    return (
      policy.message ??
      "Provider getById is not stable for direct invoke in current MVP."
    );
  }

  return null;
}
