# Deploying Keeper's Table to Cloudflare

Architecture: a thin Worker serves the built SPA from Workers Static Assets and
routes `/api/*` + `/auth/*` to a single Cloudflare Container running the
Express app. Postgres is external (Neon). Images live in the existing R2 bucket
`keepers-table-assets`.

Requires the Workers **Paid** plan (Containers).

**Deploys are automatic.** Every push to `main` runs
`.github/workflows/deploy.yml`, which builds the client and the container image
on GitHub's Linux runners and deploys to Cloudflare. You can also trigger it by
hand from the repo's **Actions** tab → *Deploy to Cloudflare* → **Run
workflow**. Nothing needs to be installed locally — no Node, no Docker, no
wrangler.

The only prerequisite is a repository secret named `CLOUDFLARE_API_TOKEN`
(GitHub → repo **Settings** → **Secrets and variables** → **Actions**), created
from the *Edit Cloudflare Workers* API token template.

Everything below is one-time setup or the local-development path.

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

Easiest in the dashboard: **Workers & Pages → keepers-table → Settings →
Variables and Secrets → + Add**, with Type = **Secret**.

Boot-critical — the container will not start without these:

| Secret | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string (see note below) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` — must be exactly 64 hex chars |

Needed only for images (uploads and AI art). The app boots fine without them:

| Secret | Value |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | from an R2 API token, Object Read & Write |
| `R2_SECRET_ACCESS_KEY` | same token |
| `R2_BUCKET_NAME` | `keepers-table-assets` |

Optional — owner-paid AI fallbacks for friend accounts, and the friends portal:
`CLAUDE_API_KEY` (note: *not* `ANTHROPIC_API_KEY`), `EVOLINK_API_KEY`,
`FRIENDS_PASSWORD`.

Create the R2 API token under **R2 → Manage R2 API Tokens**. The app talks to
R2 over the S3 API, because containers can't use R2 bindings.

**Use Neon's direct connection string, not the pooled one** — the one *without*
`-pooler` in the hostname. pg-boss needs a real session connection and does not
work through PgBouncer's transaction pooling.

**Back up `SESSION_SECRET` and `ENCRYPTION_KEY` somewhere safe** (password
manager). Losing `ENCRYPTION_KEY` permanently orphans every API key users have
saved in the app — this is not recoverable, as we now know first-hand.

## 3. Deploy

Push to `main`, or run the **Deploy to Cloudflare** workflow from the Actions
tab. That's it.

After a deploy lands, Cloudflare takes **several minutes** to provision the
container. During that window the site loads but API calls error — this is
normal, not a failure. `GET /api/health` returning `{"ok":true}` means it's
ready.

<details>
<summary>Deploying from a laptop instead (not recommended)</summary>

Needs Node 22+ (wrangler's minimum), Docker running, and `wrangler login`:

```sh
pnpm install
pnpm run build
pnpm exec wrangler deploy
```

The container image must be `linux/amd64`; the Dockerfile pins this so Apple
Silicon machines don't silently produce an unusable arm64 image.
</details>

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
