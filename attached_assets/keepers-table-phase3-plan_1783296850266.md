# The Keeper's Table — Phase 3 Implementation Plan (Media)
### Replit Edition

**Prerequisite state:** Phases 1, 2, and 2.5 complete — auth, campaigns, entities, Claude text pipeline, Live Session Command Center, session memory, PCs with sheet import. Phase 3 adds all image generation and the maps workspace.

**Scope:** EvoLink image pipeline (async jobs, storage, thumbnails) · NPC portraits · item art · location art · battle map generator · world/region map generator · maps workspace (viewer, grid overlay, pins) · upload path · art style presets · cost estimation + usage page.

---

## 0. Replit-Specific Architecture Adjustments

These override the base spec's infrastructure choices (§2). Functional requirements are unchanged.

### 0.1 Job queue: replace BullMQ + Redis with **pg-boss**
Replit doesn't provide managed Redis, and running Redis inside the Repl is fragile. Use **pg-boss** (Postgres-backed job queue) on the same Replit PostgreSQL database.
- Same semantics you need: delayed jobs, retries with backoff, concurrency limits, scheduled polling.
- One less service to keep alive; jobs survive restarts because they live in Postgres.
- Queue names: `image.generate`, `image.poll`, `image.postprocess`, `usage.rollup`.

### 0.2 File storage: **Replit Object Storage** (App Storage) instead of S3/MinIO
- Use the `@replit/object-storage` client. One bucket, keyed paths:
  `campaigns/{campaignId}/assets/{assetId}/original.png|thumb.webp`, `campaigns/{campaignId}/uploads/{uploadId}/...`
- **Do not serve public URLs.** Serve all images through an authenticated app route `GET /api/assets/:id` that checks campaign membership, then streams the object (or issues a short-lived signed URL if the SDK supports it). This is the Phase 6 spoiler-safety prep from the base spec — do it now, it's nearly free at this stage and painful later.
- Never hot-link EvoLink result URLs (they expire in ~24h). Download to Object Storage immediately on job success.

### 0.3 Deployment: **Reserved VM**, not Autoscale
Phase 3 introduces long-lived background pollers (EvoLink tasks are async) and SSE connections to the browser. Autoscale deployments scale to zero and are request-scoped — background job workers and open SSE streams will be killed. Use a **Reserved VM deployment** running a single Node process that hosts both the HTTP server and the pg-boss workers.
- If you later split traffic, keep workers on the Reserved VM and move the web tier to Autoscale — but don't do that in Phase 3; one process is simpler and sufficient.
- SSE keep-alive: send a comment ping every 25s so Replit's proxy doesn't drop idle streams. If SSE proves flaky through the proxy, fall back to client polling of `GET /api/jobs/:id` every 3–5s — build the client so the transport is swappable (a `useJobStatus(jobId)` hook that abstracts SSE vs. polling).

### 0.4 Secrets & config
- All keys in **Replit Secrets**: `MASTER_ENCRYPTION_KEY` (for user API keys at rest), `DATABASE_URL` (auto-provided), `SESSION_SECRET`. User-provided Anthropic/EvoLink keys stay in the DB encrypted with the master key, exactly per base spec — Replit Secrets holds only app-level secrets.
- EvoLink model price table: a checked-in `config/pricing.json` (editable without redeploy via an admin-only settings screen is v2; file is fine now).

### 0.5 Image processing
- **sharp** for thumbnails and format conversion — works on Replit's Nix environment; if the prebuilt binary fails to load, add `vips` to `replit.nix` dependencies.
- Thumbnail spec: 512px longest edge, WebP q80. Battle/world maps additionally get a 1600px "preview" rendition so the map viewer doesn't pull a 20MB original for casual browsing; the full original is fetched only when the viewer zooms past preview resolution.

### 0.6 Resource discipline (Repl constraints)
- Stream uploads/downloads (no buffering whole files in memory); cap uploads at 25MB.
- pg-boss concurrency: max 2 concurrent `image.generate` jobs and 4 `image.poll` jobs per user; global worker concurrency 8. EvoLink is doing the heavy lifting — the Repl only orchestrates and post-processes.
- Postprocess (sharp) jobs: concurrency 2 globally; thumbnailing is the only CPU-heavy thing this app does.

---

## 1. The EvoLink Pipeline (core deliverable)

### 1.1 Flow, end to end
```
UI "Generate Art" click
  → POST /api/generate/image {kind, entity_ref | prompt_overrides, model?, style_preset?}
  → [cost check] estimate from pricing.json → if > user's per-call soft cap, require confirm flag
  → create GenerationJob (status queued) + pg-boss enqueue image.generate
  → return {job_id} immediately (UI shows toast + tray placeholder; fire-and-forget per §8.3)

worker image.generate:
  1. Art Director call (Claude, cheap/fast model): entity fields + style preset + kind rules
     → final image prompt (+ negative prompt if model supports). Store on job.input.
     (Skipped if the user supplied a manual prompt in advanced mode.)
  2. Submit to EvoLink (user's key, chosen model). Sync models → result inline, jump to step 4.
     Async models → store provider task_id, enqueue image.poll (delay 5s).

worker image.poll:
  3. Query EvoLink task status. pending → re-enqueue self with backoff (5s→10s→20s, cap 30s,
     give up at 10 min → job failed, retryable). succeeded → step 4. failed → mark job failed
     with provider error, surface Retry in UI.

worker image.postprocess:
  4. Download result → Object Storage original. sharp → thumb.webp (+ preview.webp for maps).
  5. Create/attach MapAsset or set entity.portrait_url/image_url (store asset ids, not raw URLs).
  6. Claude alt-text micro-call (one sentence, cheap model) → stored on asset.
  7. Record units/cost on GenerationJob. Notify client (SSE event or poll pickup).
```

### 1.2 Kind-specific prompt rules (Art Director system rules)
| Kind | Aspect | Enforced prompt elements |
|---|---|---|
| `portrait_npc` / `portrait_pc` | 1:1 | bust/half-figure framing, style preset, campaign tone, `content_rating` |
| `item_art` | 1:1 | single object, plain/neutral background, style preset |
| `location_art` | 4:3 | establishing shot, no readable text |
| `map_battle` | 1:1 or 4:3 | **top-down orthographic**, no grid (grid is a client overlay), no labels/text, consistent lighting, terrain from encounter/location context |
| `map_region` / `map_world` | 16:9 (user-selectable) | fantasy cartography style, label-free by default, parchment or user style preset |

Advanced mode (collapsible on every art button): shows the Art Director's prompt before submit, editable; model picker; aspect override.

### 1.3 Failure & retry rules
- Provider failures are retryable from the failed card (re-enqueues with same prompt; new Art Director call only if the user edits inputs).
- Every failure stores the raw provider error on the job (visible in an expandable "details" on the error card) — critical for debugging BYOK issues (invalid key, out of credits, model deprecations).
- If EvoLink returns a content-policy rejection, show it verbatim and do not auto-retry.

---

## 2. Data & API Additions

### 2.1 Schema (migrations this phase)
- `MapAsset` table per base spec §3.4, plus `preview_url`, `alt_text`, `width`, `height`.
- `MapPin` (new): `map_asset_id`, `x`, `y` (0–1 normalized), `location_id -> Location (nullable)`, `label`, `icon`, `revealed (bool, default false — Phase 6 prep)`.
- `Asset` (generic, new): `id, campaign_id, kind, storage_key_original, storage_key_thumb, storage_key_preview?, alt_text, width, height, source (generated|uploaded), generation_job_id?`. Portraits/item art reference `Asset.id` (replace the bare `*_url` columns with `*_asset_id`; migration backfills nothing since no images exist before this phase).
- `GenerationJob`: add `provider_task_id`, `cost_estimate`, `cost_actual`.
- `ArtStylePreset`: `owner_user_id (null = built-in)`, `name`, `prompt_fragment`, `preview_asset_id?`. Seed the six built-ins from base spec §10.3.

### 2.2 Routes (new/changed)
```
POST /api/generate/image                      → {job_id}
GET  /api/jobs/:id                            → status/result (poll fallback)
GET  /api/jobs/stream                         → SSE (job events for this user)
GET  /api/assets/:id?size=thumb|preview|full  → auth-checked stream from Object Storage
POST /api/campaigns/:id/assets/upload         → multipart; same postprocess worker path (thumbs, alt text)
CRUD /api/campaigns/:id/maps                  → MapAsset metadata (title, kind, grid json, linked_location)
CRUD /api/maps/:id/pins
GET/PUT /api/style-presets
GET  /api/usage?range=&campaign=              → aggregates from GenerationJob
```

---

## 3. UI Work Items

### 3.1 "Generate Art" everywhere (reuses one component)
`<GenerateArtButton kind entityRef />` on NPC, PC, Item, Location cards and detail pages. States: idle → queued (subtle spinner chip, card stays editable) → done (image fades in) → failed (error chip, Retry, details). Style preset chip row (active presets removable, per base §7.3). Regenerating keeps the previous image until the new one succeeds, then offers "keep old / use new."

### 3.2 Battle Map Generator (`/generate/battle-map`)
Inputs: free-text scene description; optional link to an Encounter or Location (prefills terrain context); aspect (1:1 / 4:3); style preset. Output card → full-screen viewer on click. "Attach to encounter/location" action.

### 3.3 World/Region Map Generator (`/generate/world-map`)
Inputs: scope (world/region), description or "generate from campaign setting_notes" toggle (Claude summarizes known geography from saved Locations into the prompt), aspect, style. After generation, prompt the user: "Drop pins for your known locations?" → opens the viewer in pin mode with a sidebar list of unpinned Locations to drag on.

### 3.4 Maps Workspace (`/maps`, `/maps/:id`)
- Gallery: thumbnail grid, filter by kind, upload button (drag-drop).
- Viewer: pan/zoom (pointer + touch; use `panzoom` or hand-rolled transform — no heavy map lib needed), loads preview rendition, swaps to original past 1:1 zoom.
- **Grid overlay editor** (battle maps): toggle; cell size slider; drag-to-offset; color + opacity; square grid v1 (hex is v-next). Rendered as an SVG/canvas layer over the image. "Download PNG" with grid baked (compose server-side with sharp) or clean.
- **Pin layer** (region/world maps): add/drag pins, link to Location (typeahead), click pin → location card popover. Pins store normalized coords so they survive any rendition size.
- Live Session integration: the Command Center's Map tab (§8.3) uses this same viewer component read-mostly; pins clickable, grid togglable.

### 3.5 Usage & cost page (`/settings/usage`)
Table + simple bar chart: units and estimated $ per provider, per campaign, per day range. Data from `GenerationJob` aggregates. Show `cost_estimate` vs `cost_actual` where the provider reports actuals. Per-call soft-cap setting (default $0.50) that triggers the confirm step in §1.1.

### 3.6 Upload path
Anywhere a generated image can exist, "Upload instead" is offered: portraits, item art, location art, maps. Uploads run the same postprocess worker (thumbnail, alt text via Claude vision one-liner, dimensions).

---

## 4. Build Order (tickets, in sequence)

1. **Infra:** pg-boss setup + worker bootstrap in the server process; Object Storage client; `Asset` table + authenticated `GET /api/assets/:id` streaming route; sharp postprocess worker; upload endpoint. *(Everything else depends on this.)*
2. **Pipeline core:** `POST /api/generate/image` → Art Director call → EvoLink submit → poll worker → postprocess → attach. Wire `useJobStatus` hook (SSE with poll fallback). Ship with `portrait_npc` only.
3. **Spread to entities:** `GenerateArtButton` on NPC/PC/Item/Location; regenerate keep/replace flow; style preset chips + `/settings` preset CRUD.
4. **Battle maps:** generator page, viewer with pan/zoom, grid overlay editor, baked-grid download, attach-to-encounter.
5. **World maps:** generator (incl. setting-notes mode), pin layer + Location linking, maps gallery + uploads.
6. **Cost & polish:** pricing.json + estimates + soft-cap confirm, usage page, alt-text calls, failure-state audit (kill every dead-end error), Live Session Map tab integration.

Rough sizing: items 1–2 are the risky half (async + storage + Replit quirks); 3–6 are mostly UI on a working pipeline. If EvoLink's async API misbehaves through the Repl (timeouts, IP issues), all debugging surface is in item 2 — validate it with a $0.10 smoke test before building any UI.

---

## 5. Acceptance Tests (Phase 3 done =)

1. **Portrait loop:** generate an NPC portrait; kill/restart the Repl mid-generation; on restart the poll job resumes from Postgres and the portrait still lands. (Proves pg-boss durability.)
2. **Fire-and-forget:** from Live Session, ⌘K → "battle map, sewer junction" → keep taking notes; toast on completion; map opens in the Map tab without leaving the page.
3. **Grid fidelity:** overlay a grid on a generated battle map, offset it, download with grid baked — downloaded PNG matches on-screen alignment.
4. **Auth on assets:** an asset URL copied from the DM's browser returns 401/403 in a logged-out tab. (Phase 6 spoiler-safety prep verified.)
5. **Cost guardrail:** attempt a generation whose estimate exceeds the soft cap → confirm dialog with $ shown; usage page reflects the call afterward, scoped to the right campaign.
6. **Expiry safety:** confirm no stored URL anywhere points at evolink domains (DB audit query) — all assets served from `/api/assets/:id`.
