"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import {
  PRIVY_CLIENT_CONFIG,
  isPrivyEnabled,
  resolvePrivyAppId,
} from "@/lib/payment/privy-config";

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // one QueryClient per session; stable across re-renders
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
          },
        },
      })
  );

  const queryTree = (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  if (!isPrivyEnabled()) {
    return queryTree;
  }

  return (
    <PrivyProvider appId={resolvePrivyAppId()} config={PRIVY_CLIENT_CONFIG}>
      {queryTree}
    </PrivyProvider>
  );
}
