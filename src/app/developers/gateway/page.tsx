import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gateway Developer Guide | Hyphae",
  description:
    "Detailed integration guide for Hyphae Gateway: /api/store/search and /api/store/invoke, including x402 payment flow details.",
};

const quickStartCommands = [
  "pnpm install",
  "pnpm dev",
  "node examples/gateway-invoke.mjs",
];

const endpointRows = [
  {
    endpoint: "GET /api/store/search",
    purpose: "Search providers and get a stable unified agent id.",
    details:
      "Supports provider/category/price filters. Use results[i].id as invoke input.",
  },
  {
    endpoint: "POST /api/store/invoke",
    purpose: "Gateway proxy invocation for provider endpoint.",
    details:
      "Validates id, resolves provider agent, blocks private-network targets, forwards request and selected payment headers.",
  },
];

const x402MappingRows = [
  {
    concept: "HTTP 402 Payment Required",
    protocol: "Seller/API returns 402 when payment proof is missing/invalid.",
    hyphae:
      "Gateway passes through upstream 402 status and body so client can continue payment flow.",
  },
  {
    concept: "accepts requirements",
    protocol:
      "Payment requirements include network, amount, asset, payTo and scheme details.",
    hyphae:
      "Client side reads body.accepts (if present) and decides how to sign and retry.",
  },
  {
    concept: "Payment headers",
    protocol:
      "Common headers in x402 ecosystem include PAYMENT-REQUIRED and PAYMENT-SIGNATURE.",
    hyphae:
      "Current invoke API accepts payment.headerName = X-PAYMENT or PAYMENT-SIGNATURE, and forwards upstream payment response headers X-PAYMENT-RESPONSE / PAYMENT-RESPONSE.",
  },
  {
    concept: "Key custody",
    protocol:
      "Buyer signs locally; avoid exposing private keys to third-party services.",
    hyphae:
      "Project docs follow non-custodial model. signPayment is placeholder; implement local wallet/KMS/HSM signing.",
  },
];

const errorCodeRows = [
  {
    code: "200 / 201",
    meaning: "Upstream invocation succeeded and response is proxied back.",
  },
  {
    code: "402",
    meaning:
      "Payment required from upstream. Read body.accepts and response payment headers, then retry with payment field.",
  },
  {
    code: "404",
    meaning: "Agent id not found in corresponding provider adapter.",
  },
  {
    code: "413",
    meaning: "Request body exceeds 64KB limit.",
  },
  {
    code: "422",
    meaning:
      "Invalid payload/id, blocked endpoint (localhost/private network), unsupported provider invoke policy, or invalid GET input shape.",
  },
  {
    code: "502",
    meaning:
      "Gateway failed to call upstream endpoint or upstream returned invalid JSON.",
  },
  {
    code: "504",
    meaning: "Gateway upstream timeout (default 10s).",
  },
];

export default function GatewayDeveloperPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className="mb-8">
          <Link
            href="/store"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Back to Store
          </Link>
        </div>

        <header className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Hyphae Gateway 开发者指南
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            这页是面向接入方的完整说明：如何通过
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-sm">
              /api/store/search
            </code>
            和
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-sm">
              /api/store/invoke
            </code>
            完成 agent 调用，并处理 x402 的 402 支付重试流程。
          </p>
        </header>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">1. 快速开始</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm md:text-base">
            <li>启动本地服务并加载依赖。</li>
            <li>运行示例脚本，脚本会先 search，再 invoke，并演示 402 重试。</li>
          </ol>
          <pre className="overflow-x-auto rounded-xl border bg-muted p-4 text-sm leading-6">
            <code>{quickStartCommands.join("\n")}</code>
          </pre>
          <p className="text-sm text-muted-foreground">
            对应示例文件：
            <code className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">
              examples/gateway-invoke.mjs
            </code>
            ，文档基线：
            <code className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">
              docs/gateway-mvp.md
            </code>
            。
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            2. Gateway API 概览
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="border-b px-4 py-3 font-semibold">Endpoint</th>
                  <th className="border-b px-4 py-3 font-semibold">Purpose</th>
                  <th className="border-b px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {endpointRows.map((row) => (
                  <tr key={row.endpoint} className="align-top">
                    <td className="border-b px-4 py-3 font-mono text-xs md:text-sm">
                      {row.endpoint}
                    </td>
                    <td className="border-b px-4 py-3">{row.purpose}</td>
                    <td className="border-b px-4 py-3 text-muted-foreground">
                      {row.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            3. x402 流程与本项目映射
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="border-b px-4 py-3 font-semibold">Concept</th>
                  <th className="border-b px-4 py-3 font-semibold">
                    x402 / Protocol
                  </th>
                  <th className="border-b px-4 py-3 font-semibold">
                    Hyphae Gateway
                  </th>
                </tr>
              </thead>
              <tbody>
                {x402MappingRows.map((row) => (
                  <tr key={row.concept} className="align-top">
                    <td className="border-b px-4 py-3 font-medium">
                      {row.concept}
                    </td>
                    <td className="border-b px-4 py-3 text-muted-foreground">
                      {row.protocol}
                    </td>
                    <td className="border-b px-4 py-3 text-muted-foreground">
                      {row.hyphae}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">
            <p className="font-semibold">典型调用序列</p>
            <pre className="mt-3 overflow-x-auto rounded-lg border bg-background p-3 text-xs md:text-sm">
              <code>{`1) GET /api/store/search -> 选出 result.id
2) POST /api/store/invoke { id, input } -> 可能返回 402
3) 读取 body.accepts + X-PAYMENT-RESPONSE / PAYMENT-RESPONSE
4) 本地签名后重试:
   POST /api/store/invoke {
     id,
     input,
     payment: { headerName: "X-PAYMENT" | "PAYMENT-SIGNATURE", value: "..." }
   }`}</code>
            </pre>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">4. 请求示例</h2>
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <p className="mb-2 text-sm font-semibold">
                第一次调用（不带 payment）
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs md:text-sm">
                <code>{`curl -X POST http://localhost:3000/api/store/invoke \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "coinbase:https://api.example.com/weather",
    "input": {
      "city": "Shanghai",
      "unit": "c"
    }
  }'`}</code>
              </pre>
            </div>

            <div className="rounded-xl border p-4">
              <p className="mb-2 text-sm font-semibold">
                402 后带 payment 重试
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs md:text-sm">
                <code>{`curl -X POST http://localhost:3000/api/store/invoke \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "coinbase:https://api.example.com/weather",
    "input": {
      "city": "Shanghai",
      "unit": "c"
    },
    "payment": {
      "headerName": "X-PAYMENT",
      "value": "<your-local-signature>"
    }
  }'`}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            5. 错误码速查
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="border-b px-4 py-3 font-semibold">Code</th>
                  <th className="border-b px-4 py-3 font-semibold">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {errorCodeRows.map((row) => (
                  <tr key={row.code}>
                    <td className="border-b px-4 py-3 font-mono text-xs md:text-sm">
                      {row.code}
                    </td>
                    <td className="border-b px-4 py-3 text-muted-foreground">
                      {row.meaning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            6. 安全与落地建议
          </h2>
          <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6">
            <p>
              Security:
              不要把私钥托管到网关服务。推荐在调用方运行时（browser/serverless/agent
              runtime）本地签名，或使用 KMS/HSM。
            </p>
            <p className="mt-2">
              Security: 不要记录完整 payment token/signature
              到日志；只记录前缀、哈希或 request id。
            </p>
            <p className="mt-2">
              Security: 先做只读/沙盒验证：使用测试网络和小额度，验证 402 -&gt;
              retry -&gt; success 全链路后再放大流量。
            </p>
            <p className="mt-2">
              Warning: 当前项目为 Gateway MVP，协议字段和 provider
              兼容策略可能继续演进。
            </p>
          </div>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            7. 参考资料（x402）
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm md:text-base">
            <li>
              <a
                href="https://docs.cdp.coinbase.com/x402"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                Coinbase x402 Docs
              </a>
            </li>
            <li>
              <a
                href="https://docs.cdp.coinbase.com/x402/quickstart-for-buyers"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                x402 Quickstart for Buyers
              </a>
            </li>
            <li>
              <a
                href="https://github.com/coinbase/x402/blob/main/specs/transports-v2/http.md"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                x402 HTTP Transport Spec (402 / PAYMENT-REQUIRED)
              </a>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
