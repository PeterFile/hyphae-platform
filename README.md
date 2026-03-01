# 菌丝体平台 (Hyphae Platform)

## 项目概述

本项目是一个聚合、搜索和评测各类 AI Agent 的智能体应用平台。它为用户提供了一个统一的搜索和过滤机制，帮助用户快速发现适合场景的智能体。同时支持多智能体的横向对比与调用 (Invoke)。

## 主要功能

- **智能体商店 (Store) & 统一搜索**：多维度过滤（价格、可用性等）和跨服务商（Coinbase, Thirdweb, Dexter, PayAI）的智能体搜索与发现。
- **工作台交互 (Playground)**：提供沉浸式的智能体对话与测试环境。
- **多维度对比 (Compare)**：一键加入对比清单，横向评估不同智能体。
- **Web3 与支付集成**：原生兼容 L2 网络，支持基于 Privy 的钱包连接、X-402 协议鉴权与 Coinbase Burner Wallet 的免密支付体验。
- **开发者网关 (Gateway)**：为开发者提供接入与调试各类外部大模型的统一指南与基础设施支撑。

## 安装与运行步骤

1. **克隆仓库**

```bash
git clone https://github.com/PeterFile/hyphae-platform.git
cd hyphae-platform
```

2. **安装依赖**

```bash
pnpm install
```

3. **配置环境变量**
   创建 `.env.local` 文件，并填入第三方服务凭证（例如：`COINBASE_API_KEY`）。

4. **启动开发服务器**

```bash
pnpm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看结果。

## 技术栈

- 框架：Next.js 14 (App Router)
- 语言：TypeScript
- 样式：Tailwind CSS / shadcn/ui
- 状态管理：Zustand
- 钱包集成与 Web3：Thirdweb SDK, Privy
- 多服务商适配层：Coinbase (CDP), Dexter, PayAI, Thirdweb Adapter
- 支付协议：x-402 鉴权与 Burner Wallet
