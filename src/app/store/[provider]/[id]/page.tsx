import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cache } from "react";

import { ProviderNameSchema } from "@/lib/providers/types";
import { CoinbaseAdapter } from "@/lib/providers/coinbase-adapter";
import { ThirdwebAdapter } from "@/lib/providers/thirdweb-adapter";
import { DexterAdapter } from "@/lib/providers/dexter-adapter";
import { PayAIAdapter } from "@/lib/providers/payai-adapter";
import { ProviderBadge } from "@/components/store/provider-badge";
import { RealtimeAvailability } from "./realtime-availability";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const getAdapter = (providerName: string) => {
  switch (providerName) {
    case "coinbase":
      return new CoinbaseAdapter();
    case "thirdweb":
      return new ThirdwebAdapter();
    case "dexter":
      return new DexterAdapter();
    case "payai":
      return new PayAIAdapter();
    default:
      return null;
  }
};

const getAgent = cache(async (provider: string, id: string) => {
  const parsedProvider = ProviderNameSchema.safeParse(provider);
  if (!parsedProvider.success) {
    return null;
  }
  const adapter = getAdapter(parsedProvider.data);
  if (!adapter) return null;
  return adapter.getById(id);
});

export async function generateMetadata(props: {
  params: Promise<{ provider: string; id: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const agent = await getAgent(params.provider, params.id);

  if (!agent) {
    return {
      title: "Agent Not Found",
    };
  }

  return {
    title: agent.name,
    description: agent.description,
  };
}

export default async function AgentDetailPage(props: {
  params: Promise<{ provider: string; id: string }>;
}) {
  const params = await props.params;
  const agent = await getAgent(params.provider, params.id);

  if (!agent) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <Link
          href="/store"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Store
        </Link>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Main Content */}
        <div className="space-y-8 md:col-span-2">
          {/* Hero */}
          <div>
            <div className="mb-4 flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {agent.name}
              </h1>
              <ProviderBadge provider={agent.provider} />
              <RealtimeAvailability agent={agent} />
            </div>
            <p className="text-xl text-muted-foreground">{agent.description}</p>
          </div>

          {/* Tags */}
          {agent.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {agent.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Endpoint Card */}
          <Card>
            <CardHeader>
              <CardTitle>Endpoint Details</CardTitle>
              <CardDescription>How to connect to this agent</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="mb-1 text-sm font-medium">Method</h4>
                  <Badge variant="outline">{agent.endpoint.method}</Badge>
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-medium">URL</h4>
                  <code className="break-all rounded bg-muted px-2 py-1 text-sm select-all">
                    {agent.endpoint.url}
                  </code>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium">Example Use</h4>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
                    <code>
                      {`curl -X ${agent.endpoint.method} \\
  ${agent.endpoint.url} \\
  -H "Content-Type: application/json"`}
                    </code>
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Pricing Card */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-3xl font-bold">
                  {(agent.pricing.amountUsdcCents / 100).toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    USDC
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  ({agent.pricing.rawAmount} {agent.pricing.rawAsset} on{" "}
                  {agent.pricing.network})
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metadata Card */}
          {(agent.metadata?.registeredAt ||
            agent.metadata?.totalCalls !== undefined ||
            agent.metadata?.rating !== undefined ||
            agent.metadata?.note) && (
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4 text-sm">
                  {agent.metadata?.registeredAt && (
                    <div>
                      <dt className="text-muted-foreground">Registered At</dt>
                      <dd className="font-medium">
                        {new Date(
                          agent.metadata.registeredAt
                        ).toLocaleDateString()}
                      </dd>
                    </div>
                  )}
                  {agent.metadata?.totalCalls !== undefined && (
                    <div>
                      <dt className="text-muted-foreground">Total Calls</dt>
                      <dd className="font-medium">
                        {agent.metadata.totalCalls.toLocaleString()}
                      </dd>
                    </div>
                  )}
                  {agent.metadata?.rating !== undefined && (
                    <div>
                      <dt className="text-muted-foreground">Rating</dt>
                      <dd className="font-medium">
                        {agent.metadata.rating} / 5
                      </dd>
                    </div>
                  )}
                  {agent.metadata?.source && (
                    <div>
                      <dt className="text-muted-foreground">Source</dt>
                      <dd className="capitalize font-medium">
                        {agent.metadata.source}
                      </dd>
                    </div>
                  )}
                  {agent.metadata?.note && (
                    <div>
                      <dt className="text-muted-foreground">Note</dt>
                      <dd className="font-medium">{agent.metadata.note}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
