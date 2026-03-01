# Repository Guidelines

## Project Structure & Module Organization

- `src/app/`: Next.js App Router routes (UI) and API routes under `src/app/api/**/route.ts`.
- `src/app/api/**/route.ts` 只能导出 Next.js 认可的 route 字段（如 `GET`/`POST`）；可测试的辅助逻辑放到同级 `handler.ts` 等文件。
- `src/components/`: reusable UI components (keep generic, no route-specific logic).
- `src/hooks/`: shared React hooks.
- `src/lib/`: shared utilities (API clients, validators, helpers).
- `src/stores/`: client state (e.g., Zustand stores).
- `public/`: static assets served as-is.
- Key config: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `tailwind.config.js`, `src/app/globals.css`.

## Build, Test, and Development Commands

Use `pnpm` (lockfile: `pnpm-lock.yaml`).

- `pnpm install`: install dependencies.
- `pnpm dev`: run the local dev server at `http://localhost:3000`.
- `pnpm build`: production build (must pass before merging).
- `pnpm start`: run the production build locally.
- `pnpm lint`: run ESLint (Next.js core-web-vitals + TypeScript rules).

## Coding Style & Naming Conventions

- TypeScript + React (strict mode enabled in `tsconfig.json`).
- Match existing formatting: 2-space indentation, double quotes, semicolons.
- Prefer the path alias for internal imports: `@/app/...`, `@/lib/...` (configured in `tsconfig.json`).
- Keep styling in Tailwind; use design tokens/CSS variables from `src/app/globals.css` + `tailwind.config.js` instead of hardcoded colors.

## Testing Guidelines

- Unit tests use `vitest` (Node environment), focused on `src/lib/**`.
- Minimum local checks before a PR: `pnpm test`, `pnpm lint`, and `pnpm build`.
- With ESLint 9 + Next 15 flat config, use `FlatCompat` in `eslint.config.mjs` for `next/core-web-vitals` and `next/typescript`; ignore generated files like `.next/**` and `next-env.d.ts`.

## Provider Contracts

- `ProviderAdapter.search()` / `getById()` should return normalized `UnifiedAgent` objects; provider-specific raw payload types stay internal to each adapter.
- Canonical `SearchFilters.sort` values are `price_asc`, `price_desc`, `relevance`, and `availability`.
- Registry aggregation should return partial successes with `{ results, errors }` instead of throwing when one upstream provider fails.

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits (e.g., `chore: scaffold ...`, `feat: ...`, `fix: ...`).
- PRs should be small and focused; include:
  - a short description of what changed and why,
  - linked issue/ticket (if any),
  - screenshots/GIFs for UI changes,
  - notes for any new env vars or config changes.

## Security & Configuration Tips

- Do not commit secrets; use `.env.local` for local configuration.
- Only `NEXT_PUBLIC_*` variables are exposed to the browser—keep sensitive values server-only.
- Validate external input (especially in API routes) with `zod`.

## Provider Adapter Conventions

- Dexter marketplace records currently do not provide a stable explicit id; use `encodeURIComponent(resourceUrl)` as `originalId` and `dexter:${originalId}` as unified id.
- For best-effort providers, keep API failures non-fatal: retry once, then return mock fallback data with explicit metadata markers so downstream layers can surface degraded mode.
- Thirdweb `getById()` should cold-start hydrate discovery cache, but discovery is still paginated; keep `/api/store/invoke` fail-fast with `provider_not_invokable_yet` until lookup stability is guaranteed without pagination misses.

## Wallet Test Flow

- `src/components/store/agent-playground.tsx` wraps itself with `PrivyProvider` only when `NEXT_PUBLIC_PRIVY_APP_ID` is set, and forces wallet-only login (`loginMethods: ["wallet"]`) with no social methods.
- In Playground 402 retry flow, sign from `body.accepts` exact-EVM requirement (`payTo`, `asset`, `maxAmountRequired`); if env is missing, fallback stays burner-only and is expected to remain demo-grade.
- In Privy external wallet UX, `connectWallet()` only establishes wallet connection; it does not guarantee `authenticated === true`. If UI state depends on `authenticated`, trigger `connectedWallet.loginOrLink()` to complete SIWE auth/link.
- Reuse `isPrivyEthereumSignableWallet` (`src/lib/payment/privy-wallet.ts`) across wallet-aware UI (`TopNav`, `AgentPlayground`) to avoid diverging wallet detection rules (`type`/`chainType` may vary by wallet client).
