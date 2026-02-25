# Repository Guidelines

## Project Structure & Module Organization

- `src/app/`: Next.js App Router routes (UI) and API routes under `src/app/api/**/route.ts`.
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
