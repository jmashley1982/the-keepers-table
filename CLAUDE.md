# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Keeper's Table — a tabletop RPG campaign-management web app. React/Vite frontend, Express backend, PostgreSQL via Prisma. Deployed on Replit (Cloud Run target).

## Commands

Use `pnpm`, not `npm` (the repo has both lockfiles, but `pnpm-lock.yaml` and `.replit`'s workflow/post-merge script are authoritative).

- `pnpm run dev` — runs client (Vite, port 5000) and server (tsx watch, port 3001) concurrently. Vite proxies `/api` and `/auth` to the server.
- `pnpm run build` — `prisma generate` → `tsc -p tsconfig.json` (server) → `vite build` (client to `dist/public`).
- `pnpm run start` — runs the built server (`node server/dist/index.js`), serving the built client as static files.
- `pnpm run db:generate` — regenerate the Prisma client after schema changes.
- `pnpm run db:push` — push schema changes to the database (no migration files are committed; `server/prisma/migrations/` is gitignored).
- `pnpm run db:seed` — run `server/src/seed.ts`.

There are no lint or test scripts configured in this repo.

## Architecture

**Two separate TypeScript projects sharing one repo**: `tsconfig.json` builds only `server/src/**` (NodeNext modules, emits to `server/dist`); the client is built by Vite directly from `client/src` (not driven by `tsconfig.json`). Don't assume a single shared TS config.

**Server** (`server/src/`):
- `index.ts` is the single entry point — it wires session middleware, mounts every router under `/api/*` or `/auth/*`, serves the built client as a SPA fallback, and starts the pg-boss worker + seed jobs on boot. When adding a route, register it here.
- Session middleware (`connect-pg-simple`, backed by a `user_sessions` table) is applied *only* to `/auth` and `/api`, deliberately excluded from static file serving so a DB hiccup can't 500 the homepage.
- `middleware/auth.middleware.ts` — `requireAuth` / `optionalAuth` gate routes on `req.session.userId`; almost every campaign-scoped route needs `requireAuth` plus an explicit ownership check (see Security below).
- `lib/worker.ts` — pg-boss background jobs for async AI image/text generation; talks to Anthropic and EvoLink (a multi-model image gateway — see `EVOLINK_MODEL_MAP`) and writes results back via `GenerationJob`/`Asset` rows.
- `lib/crypto.ts` — AES-256-GCM encrypt/decrypt for `ApiCredential.encryptedKey`, keyed by `ENCRYPTION_KEY` (32-byte hex env var). Never store provider API keys unencrypted.
- `lib/pricing.ts` — converts internal "credits" to USD for the per-user soft spending cap (`UserPreference.softCapPerCall`).
- `lib/assertStaticRoutesFirst.ts` — call `assertStaticRoutesFirst`/`assertNoStaticAfterDynamic` at the bottom of any router that mixes static paths (e.g. `/active`, `/search`) with a dynamic `/:id`-style wildcard at the same level. Express resolves routes in declaration order, so a static path declared after the wildcard is silently shadowed; these assertions fail fast at server boot instead of at request time. Follow this pattern for any new router with that shape.
- `server/replit_integrations/object_storage/**` exists but is currently unmounted in `index.ts` — don't assume it's live without checking.

**Data model** (`server/prisma/schema.prisma`): everything is scoped under `Campaign` (owned by a `User`, tied to a `SystemTemplate` which defines the game system's stat-block schema/difficulty model/currency). Most entity models (`NPC`, `Location`, `Item`, `Faction`, `Encounter`, `PlotThread`, `Enemy`, `Party`, `GameSession`, ...) follow the same shape: `campaignId` FK with `onDelete: Cascade`, `tags`/`customFields`/`dmOnlyNotes`, soft delete via `deletedAt`, and a manual `sortOrder`. When adding a new campaign-scoped entity, mirror this shape rather than inventing a new one.

**Client** (`client/src/`):
- Routing is centralized in `App.tsx` (react-router). All authenticated pages sit under one pathless layout route wrapped in `RequireAuth` + `AppShell`, keyed off `GET /auth/me`. Public routes (`/`, `/login`, `/signup`, `/onboarding`, `/friends`, `/safety-submit/:token`) are listed explicitly above that boundary — check this table before adding a new page to know whether it needs auth.
- `lib/api.ts` — shared axios instance (`withCredentials: true` for the session cookie) with a global 401 interceptor that redirects to `/login`, excluding auth probes and already-public pages.
- State: TanStack Query for server data, a small Zustand store (`store/useUIStore.ts`) for local UI state (theme, motion prefs) applied to `document.documentElement` via `data-*` attributes.
- Components are organized by domain under `components/` (`dnd5e`, `dw`, `entity`, `generate`, `map`, `session`, `session-zero`, `layout`, `ui`), mirrored by `pages/` for route-level containers.

## Security-sensitive conventions

See `threat_model.md` for the full threat model; the scan anchors listed there (`index.ts`, `generate.routes.ts`, `auth.routes.ts`, `friends.routes.ts`, `campaigns.routes.ts`, `entities.routes.ts`, `sessions.routes.ts`, `assets.routes.ts`, `crypto.ts`, `.replit`) are the files to check first when reasoning about attack surface.

- Every campaign-scoped route must verify the requesting user owns the `campaignId` (or resource's parent campaign) before reading/mutating — broken access control / IDOR across campaign identifiers is the top-priority threat class here.
- Any data assembled into an AI prompt (`generate.routes.ts`, `lib/worker.ts`) must only include content the requesting user is authorized to see — cross-tenant data leakage through prompt construction is explicitly in scope.
- `SESSION_SECRET` and `ENCRYPTION_KEY` are required in production (`index.ts` throws on boot if `SESSION_SECRET` is missing when `NODE_ENV=production` or `REPLIT_DOMAINS` is set); don't add fallback defaults that would work in production.
- Auth/brute-force-sensitive endpoints (login, friends login) go through `lib/rate-limit.ts`'s in-memory limiter, keyed on `req.ip` (trusted via `trust proxy`, not raw headers).
