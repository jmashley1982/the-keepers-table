# Deploying Keeper's Table to Cloudflare

Architecture: a thin Worker serves the built SPA from Workers Static Assets and
routes `/api/*` + `/auth/*` to a single Cloudflare Container running the
Express app. Postgres is external (Neon). Images live in the existing R2 bucket
`keepers-table-assets`.

Requires: the Workers **Paid** plan (Containers), Docker running locally,
and `wrangler login`.

## 1. Create the database (once)

Create a Postgres project at https://neon.tech (free tier is fine) and copy the
connection string.

Create the schema from your machine (there are no migration files — the schema
lives entirely in `server/prisma/schema.prisma`):

```sh
DATABASE_URL="postgres://...neon.tech/neondb?sslmode=require" pnpm run db:push
```

`user_sessions` (login sessions) and pg-boss's job tables create themselves on
first boot.

## 2. Set secrets (once)

```sh
# Required
wrangler secret put DATABASE_URL        # the Neon connection string
wrangler secret put SESSION_SECRET      # openssl rand -hex 32
wrangler secret put ENCRYPTION_KEY      # openssl rand -hex 32  (MUST be 64 hex chars)
wrangler secret put R2_ACCOUNT_ID       # Cloudflare account id
wrangler secret put R2_ACCESS_KEY_ID    # from an R2 API token (Object Read & Write)
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET_NAME      # keepers-table-assets

# Optional — owner-paid AI fallbacks for friend accounts + the friends portal
wrangler secret put CLAUDE_API_KEY      # note: CLAUDE_API_KEY, not ANTHROPIC_API_KEY
wrangler secret put EVOLINK_API_KEY
wrangler secret put FRIENDS_PASSWORD
```

Create the R2 API token under **R2 → Manage R2 API Tokens** in the Cloudflare
dashboard. The app talks to R2 over the S3 API (containers can't use bindings).

**Back up `SESSION_SECRET` and `ENCRYPTION_KEY` somewhere safe** (password
manager). Losing `ENCRYPTION_KEY` permanently orphans every API key users have
saved in the app — this is not recoverable, as we now know first-hand.

## 3. Deploy

```sh
pnpm install
pnpm run build        # builds server + client (dist/public → Static Assets)
wrangler deploy       # builds/pushes the container image, deploys Worker + assets
```

Every subsequent deploy is the same `pnpm run build && wrangler deploy`.

## 4. Restore your data (once)

1. Open the deployed URL and **sign up** a fresh account.
2. Give the first boot a couple of minutes — it seeds system templates, art
   presets and the SRD bestiary. The restore depends on system templates
   existing.
3. On the **Campaigns** page, use **Restore full backup** and select your
   `kt-account-export.json`. Campaigns arrive suffixed "(imported)" with all
   NPCs, locations, items, factions, encounters, plot threads, sessions,
   parties, player characters, relationships, world-building entries, safety
   topics, maps/pins, custom generators, style presets and preferences.
   Images are not in the bundle and cannot be recovered — portraits and map
   art will need regenerating.
4. Re-enter your Anthropic / EvoLink / Spotify keys in settings (they were
   encrypted with the old, lost `ENCRYPTION_KEY`).

## Schema changes later

`pnpm run start` no longer runs `prisma db push` (it was `--accept-data-loss`
on every boot — dangerous against live data). After editing
`schema.prisma`, push deliberately:

```sh
DATABASE_URL="postgres://..." pnpm run db:push
```

then redeploy.

## Operational notes

- **Singleton container** (`max_instances: 1`, fixed `"singleton"` id) — on
  purpose. SSE job updates and the login rate limiter live in process memory.
  Don't scale instances without replacing those.
- **Sleep**: the container sleeps after 30 min idle (`sleepAfter` in
  `src/worker.ts`). Queued image jobs pause in Postgres and resume on wake.
- **Logs**: `wrangler tail` for the Worker; container logs are in the
  Cloudflare dashboard under Workers → keepers-table → Containers.
