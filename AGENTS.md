# Project View contributor guide

## Stack and architecture

- Next.js 16 App Router, React 19, and TypeScript.
- Tailwind CSS 4 with shadcn/ui and Radix UI primitives.
- Jest and Testing Library for tests.
- pnpm for dependency management.
- BotID protects server-action POST requests. The `/api/*` BotID rule is intentionally retained for future API routes.
- YouTube Data API provides channel and live-stream data.
- Upstash Redis is an optional cache. It is not the application's database.

This application intentionally has no user authentication and no database. Do not add auth, database migrations, ORM setup, or preview databases without an approved product requirement.

## Environment

The supported environment variable names are:

- `YOUTUBE_API_KEY`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Never commit or document environment variable values. The app must degrade gracefully when configuration is absent: missing YouTube or Redis configuration should leave the project unconfigured instead of crashing the page.

There is no test-login route because Project View has no gated user pages.

## Commands

- `pnpm install --frozen-lockfile` — install the locked dependencies.
- `pnpm dev` — run the development server on port 3000.
- `pnpm lint` — run ESLint.
- `pnpm typecheck` — run TypeScript without emitting files.
- `pnpm test` — run the Jest suite.
- `pnpm build` — create the production Next.js build.

Run lint, typecheck, tests, and build before handing off changes.

## Cloud Agent

`.cursor/environment.json` installs dependencies with the frozen lockfile, starts `pnpm dev`, and exposes port 3000. Configure the environment variable names above as Cloud Agent secrets when live YouTube and Redis behavior is required; checks and the unconfigured UI must still work without them.

## Shared-file convention

Treat root configuration, CI workflows, environment documentation, and shared modules under `lib/` and `components/ui/` as cross-cutting files. Search all usages before changing them, preserve existing exported contracts unless the task explicitly changes them, and keep related configuration and documentation synchronized. Keep infrastructure-only work separate from app behavior, UI, search, and cache changes.
