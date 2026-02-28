# Gateway MVP：10 分钟跑通

## 目标

用一个 Node18+ 脚本串起以下流程：

1. `GET /api/store/search` 拿 `result.id`
2. `POST /api/store/invoke`（第一次不带 `payment`）
3. 收到 `402` 后展示 `body.accepts`
4. 本地签名（`signPayment(...)` 占位）并带 `payment: { headerName, value }` 重试

## 前置条件

- 已安装 Node 18+
- 已安装依赖：`pnpm install`

## 运行方式

```bash
pnpm dev
```

新开一个终端：

```bash
node examples/gateway-invoke.mjs
```

## 示例脚本

脚本文件：`examples/gateway-invoke.mjs`

- 脚本默认请求：`http://localhost:3000`
- 默认 `provider=dexter`
- 会先 search，再 invoke
- `status===402` 时打印 `body.accepts`，不会打印 `payment.value`

## 本地签名说明（关键）

`examples/gateway-invoke.mjs` 里有 `signPayment(...)` 占位函数：

- **Hyphae 不托管私钥**
- 签名必须由调用方在本地完成（钱包/密钥管理系统/HSM 等）
- 脚本仅演示协议流程，不做 Privy、不做钱包 UI、不做托管支付

为方便本地联调，脚本支持临时使用环境变量提供已签名值：

```bash
GATEWAY_PAYMENT_VALUE="<pre-signed-token>" node examples/gateway-invoke.mjs
```

未设置 `GATEWAY_PAYMENT_VALUE` 时，脚本会使用 `"<replace-with-local-signature>"` 占位值继续重试，便于演示完整请求链路。

> 注意：不要把真实签名值写入代码或日志。

## 可选环境变量

- `GATEWAY_BASE_URL`：默认 `http://localhost:3000`
- `GATEWAY_PROVIDER`：默认 `dexter`
- `GATEWAY_SEARCH_Q`：默认空字符串
- `GATEWAY_SEARCH_PAGE_SIZE`：默认 `20`
- `GATEWAY_PAYMENT_VALUE`：可选，仅用于本地快速重试
