# The Keeper's Table — Full Build Specification

**Purpose of this document:** A complete, implementation-ready spec for an AI coding agent. It defines the product, architecture, data model, API integrations, every user flow, UI structure, and customization system. Build order is at the end (§12). Where a decision was open, this doc makes the call — deviations should be flagged, not silently made.

---

## 1. Product Overview

The Keeper's Table is a web app for tabletop RPG Game Masters (any system — D&D 5e, Pathfinder, Call of Cthulhu, Blades in the Dark, homebrew). It generates and *remembers* campaign assets: NPCs, dialogue, encounters, treasure, locations, battle maps, world maps, and session recaps.

Two external AI services power it, both **bring-your-own-key (BYOK)**:
- **Claude API (Anthropic)** — all text generation and reasoning: NPCs, dialogue, encounters, loot, lore, session summaries, entity extraction.
- **EvoLink API** — all media generation: images (portraits, item art, battle maps, world maps via Seedream / Nano Banana / GPT-Image class models) and optionally short ambient video loops and music stings.

One third-party consumer integration:
- **Spotify** — OAuth connection so DMs can attach tracks/playlists to encounters, locations, and sessions as mood/ambience, with embedded playback.

**Design pillars (apply everywhere):**
1. **Memory-first.** Every generated asset is a database row, not chat output. Claude reads from and writes back to structured campaign state.
2. **DM is the editor-in-chief.** AI proposes; the DM confirms. No silent writes to campaign state.
3. **System-agnostic with system-aware templates.** Core schema is universal; game-system template packs add fields, stat-block formats, and prompt tuning.
4. **Fast at the table.** Live Session Mode is optimized for one-hand, low-latency use during play.
5. **Customizable.** Users can define custom entity fields, custom generators, custom prompt styles, and theme the app itself.

---

## 2. Tech Stack (recommended; substitute equivalents only with justification)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | SPA |
| Styling | Tailwind CSS + CSS variables for theming | Theme system in §10 |
| State | TanStack Query (server state) + Zustand (UI state) | |
| Routing | React Router v6 | Routes in §8 |
| Backend | Node.js (Fastify or Express) + TypeScript | Thin API layer; all AI calls proxied through backend |
| Database | PostgreSQL + Prisma ORM | Schema in §3 |
| Auth | Email/password + OAuth (Google) via Lucia or Auth.js | Sessions, not JWT-in-localStorage |
| File storage | S3-compatible (R2/S3/MinIO) | Generated images, uploaded maps |
| Realtime | Not required v1; SSE for streaming Claude responses | |
| Jobs | BullMQ (Redis) | Async image generation polling, session-wrap processing |
| Deployment | Docker Compose (app + postgres + redis) | Single-box friendly |

**Security requirements:**
- User API keys (Anthropic, EvoLink) are encrypted at rest (AES-256-GCM, server-side key from env), never sent to the browser after entry, never logged.
- All Claude/EvoLink calls go through the backend proxy — the browser never holds provider keys.
- Spotify tokens stored server-side, refresh handled by backend.
- Rate-limit generation endpoints per user (protect users from their own runaway spend; show estimated cost before batch operations).

---

## 3. Data Model (PostgreSQL / Prisma)

All entity tables include: `id (uuid)`, `created_at`, `updated_at`. All campaign-scoped tables include `campaign_id` FK with cascade delete. Soft-delete (`deleted_at`) on all user-facing entities so "delete" is recoverable for 30 days.

### 3.1 Accounts & configuration

```
User
- email, password_hash (nullable if OAuth), display_name, avatar_url
- theme_preference        // "system" | "light" | "dark" | custom theme id
- created_at

ApiCredential
- user_id -> User
- provider                // "anthropic" | "evolink" | "spotify"
- encrypted_key           // for anthropic/evolink
- oauth_access_token, oauth_refresh_token, oauth_expires_at  // for spotify
- status                  // "valid" | "invalid" | "unchecked"
- last_validated_at

UserPreference
- user_id -> User
- default_text_model       // e.g. "claude-sonnet-4-6"
- default_image_model      // EvoLink model id, e.g. "seedream-5"
- image_style_preset        // default art style prompt fragment (see §10.3)
- content_rating            // "family" | "standard" | "grim"  — injected into prompts
- measurement_units         // "imperial" | "metric" (map scales, distances)
```

### 3.2 Game system templates (the customization backbone)

A **SystemTemplate** defines how a game system shapes generation and display. Ship with built-ins (D&D 5e, Pathfinder 2e, Call of Cthulhu 7e, Blades in the Dark, "Generic/Homebrew"); users can clone and edit any of them, or build from scratch.

```
SystemTemplate
- id
- owner_user_id            // null for built-in templates
- name                     // "D&D 5e"
- description
- is_builtin (bool)
- stat_block_schema (jsonb)   // ordered field defs: [{key, label, type: "number"|"text"|"dice"|"list", default}]
                              // e.g. 5e: STR/DEX/CON/INT/WIS/CHA, AC, HP, CR, speed, senses...
- difficulty_model (jsonb)    // how encounters scale: {type: "cr_budget"|"threat_tags"|"custom", params}
- currency_and_rarity (jsonb) // loot vocabulary: currencies, rarity tiers, level-band guidance
- prompt_addendum (text)      // injected into every Claude call for campaigns using this template:
                              // tone, mechanics vocabulary, what a stat block must include
- custom_entity_fields (jsonb) // extra fields added to NPC/Item/Location/Encounter for this system
                               // [{entity: "npc", key: "sanity", label: "Sanity", type: "number"}]
```

`Campaign.system_template_id` points at one of these. Changing template mid-campaign is allowed; existing entities keep their data, new generations use the new schema.

### 3.3 Campaign core

```
Campaign
- name, system_template_id -> SystemTemplate
- owner_user_id -> User
- setting_notes (text)       // world premise, tone, homebrew rules — always in Claude context
- banner_image_url
- theme_id                    // optional per-campaign UI theme (see §10.1)
- archived (bool)

Party
- campaign_id
- name                        // supports multiple parties per campaign
- current_location_id -> Location (nullable)
- active_conditions (text)

PlayerCharacter               // first-class entity, NOT embedded jsonb — PCs are the most-edited object in play
- campaign_id, party_id -> Party
- player_name                 // the human at the table
- name                        // the character
- portrait_url
- sheet (jsonb)               // full character sheet, shaped by SystemTemplate.pc_sheet_schema (see below)
- quick_stats (jsonb)         // denormalized hot fields for Live Session display: {hp_current, hp_max, ac, passive_perception, conditions[]} — keys defined per SystemTemplate
- inventory_item_ids: [Item]  // links to Item entities owned by this PC
- dm_only_notes (text)
- status                      // "active" | "retired" | "dead"
- source_upload_id -> SheetUpload (nullable — provenance if imported)

SheetUpload                   // raw uploaded character sheet + extraction record
- campaign_id, player_character_id (nullable until confirmed)
- file_url                    // original upload: pdf, png, jpg, webp (accept multi-page pdf)
- file_type
- extraction_status           // "pending" | "extracted" | "confirmed" | "failed"
- extracted_data (jsonb)      // Claude's structured read of the sheet, pre-confirmation
- extraction_confidence (jsonb) // per-field confidence flags for the review UI
```

**SystemTemplate addition:** add `pc_sheet_schema (jsonb)` — ordered section/field definitions for a full character sheet (abilities, skills, combat block, features, spells, inventory, background), analogous to `stat_block_schema` but richer. Built-in templates ship complete sheets (5e sheet, PF2e sheet, CoC sheet, generic). This schema drives three things: the editable in-app sheet UI, the extraction target for sheet uploads, and the Claude generation schema.

```

Session
- campaign_id
- party_id -> Party
- session_number (int, unique per campaign+party)
- title (nullable)
- date_played (nullable)
- status                      // "planned" | "in_progress" | "complete"
- dm_raw_notes (text)         // live scratchpad
- generated_summary (text)
- key_events (jsonb: string[])
- hooks_for_next (jsonb: string[])
- recap_read (bool)           // controls "Previously on..." card visibility
- spotify_session_playlist (jsonb, nullable)  // {uri, name, image_url}

SessionEntityTouch            // auto-log of what was used in a session
- session_id, entity_type, entity_id, touched_at
```

### 3.4 Entities

All four core entities share: `name`, `description`, `image_url`, `tags (string[])`, `custom_fields (jsonb)` (populated per SystemTemplate.custom_entity_fields plus any ad-hoc user fields), `pinned (bool)`, `dm_only_notes (text)`.

```
NPC
- role, appearance, personality, motivations, secrets (dm-only), voice_notes
- stat_block (jsonb)           // shaped by SystemTemplate.stat_block_schema
- status                       // "alive" | "dead" | "missing" | "unknown"
- disposition_to_party         // "hostile" | "wary" | "neutral" | "friendly" | "complicated"
- location_id -> Location (nullable)
- faction_id -> Faction (nullable)
- first_session_id, last_seen_session_id -> Session
- portrait_url

Location
- type                         // "region" | "settlement" | "site" | "room" — user-extensible via template
- parent_location_id -> Location (nullable; enables region > city > tavern nesting)
- map_asset_id -> MapAsset (nullable)
- ambience (jsonb, nullable)   // {spotify: {uri, name}, evolink_video_url, notes}

Item
- category, rarity, mechanical_effect
- current_owner_type           // "npc" | "party" | "location" | "faction" | "unclaimed"
- current_owner_id
- origin_session_id -> Session

Faction
- goals, disposition_to_party
- headquarters_location_id -> Location (nullable)

Encounter
- session_id -> Session (nullable until assigned)
- type                         // "combat" | "social" | "exploration" | "puzzle" | custom
- difficulty (text)            // interpreted per SystemTemplate.difficulty_model
- setup (text)                 // read-aloud / situation
- tactics (text)               // how opposition behaves
- twist (text)
- scaling_notes (text)
- participants (jsonb)         // [{entity_type, entity_id, count, role}]
- location_id -> Location (nullable)
- map_asset_id -> MapAsset (nullable)
- soundtrack (jsonb, nullable) // [{spotify_uri, name, image_url, cue: "ambient"|"combat"|"reveal"|custom}]
- outcome (text, nullable)     // filled after play

PlotThread
- title, description
- status                       // "active" | "resolved" | "dormant"
- related_entities (jsonb)     // [{entity_type, entity_id}]
- last_touched_session_id -> Session

Relationship
- entity_a_type, entity_a_id, entity_b_type, entity_b_id
- relationship_type (text)     // "rival", "sibling", "owes debt", "hunting" — free text
- notes
- bidirectional (bool)

MapAsset
- campaign_id
- kind                         // "battle" | "region" | "world" | "other"
- title
- image_url (full res), thumbnail_url
- source                       // "generated" | "uploaded"
- generation_prompt (text, nullable)
- grid (jsonb, nullable)       // {enabled, size_px, offset_x, offset_y, color, opacity}
- linked_location_id -> Location (nullable)
```

### 3.5 Generation infrastructure

```
GenerationJob                 // every AI call is a job row → audit trail + cost tracking + retries
- user_id, campaign_id (nullable)
- provider                    // "anthropic" | "evolink"
- kind                        // "npc" | "encounter" | "dialogue" | "session_wrap" | "image_portrait" | "image_map" | ...
- status                      // "queued" | "running" | "succeeded" | "failed"
- input (jsonb)               // prompt params (never raw API keys)
- output_ref (jsonb)          // created entity ids / asset urls
- tokens_or_units (jsonb)     // usage numbers for cost display
- error (text, nullable)

CustomGenerator               // user-defined generators (see §7.4)
- owner_user_id
- campaign_id (nullable = available in all user's campaigns)
- name, icon, description
- output_entity_type          // "npc" | "item" | "location" | "encounter" | "freeform"
- prompt_template (text)      // with {{placeholders}}
- input_fields (jsonb)        // [{key, label, type: "text"|"select"|"number", options?}]
- generates_image (bool), image_prompt_template (text, nullable)
```

---

## 4. AI Integration Layer

### 4.1 Claude (text)

All calls go through backend endpoint `POST /api/generate/text` which:
1. Loads the user's Anthropic key (decrypt server-side).
2. Assembles the prompt from three layers:
   - **System layer:** app-level instructions + `SystemTemplate.prompt_addendum` + `UserPreference.content_rating` + output JSON schema for the requested kind.
   - **Context layer:** campaign `setting_notes`, party snapshot, and a *relevance-selected* slice of campaign entities (see 4.3).
   - **Request layer:** the DM's actual prompt / generator inputs.
3. Requests **structured JSON output** matching the entity schema (use tool-use/structured output; never parse freeform prose into fields).
4. Streams progress via SSE where the UI shows text as it forms (dialogue, summaries); non-streamed for pure JSON entity generation.
5. Writes a `GenerationJob` row with token usage.

**Model selection:** default from `UserPreference.default_text_model`; per-call override in advanced options. Use a cheaper/faster model automatically for lightweight calls (intent classification, tag extraction) and the user's default for creative generation.

### 4.2 EvoLink (images / media)

Backend endpoint `POST /api/generate/image`:
1. Claude first writes the image prompt (a dedicated "art director" call that converts entity fields + user style preset into a strong image prompt). Show this prompt to the user in advanced mode; editable before submit.
2. Submit to EvoLink with the user's chosen model. EvoLink image/video jobs may be async (task ID + polling): implement a BullMQ poller; push completion to the client via SSE.
3. On completion, download the asset to app storage (EvoLink links can expire — never hot-link), generate a thumbnail, attach to the entity.

Image kinds and default specs:
| Kind | Aspect | Notes |
|---|---|---|
| NPC portrait | 1:1 | style preset applied |
| Item art | 1:1 | plain background bias in prompt |
| Battle map | 1:1 or 4:3 | top-down keyword enforced; highest available resolution; grid overlay is rendered client-side, not baked in |
| Region/world map | 16:9 or user choice | "fantasy cartography" style bias, label-free by default (labels overlaid in-app later, v2) |
| Ambience video (optional) | 16:9, 4–8s loop | Veo-class model; attached to Location.ambience |

**Cost guardrails:** before any image/video call, show estimated cost (maintain a small server-side price table per model, editable via env/config). Batch operations require explicit confirm with total estimate.

### 4.3 Context selection (how Claude "remembers")

Never dump the whole campaign into context. For each generation:
1. Embed-or-keyword match the user's request against entity names/tags/descriptions (v1: Postgres full-text search is sufficient; v2: pgvector embeddings).
2. Always include: campaign setting_notes, active party snapshot, active PlotThreads (titles + one-liners), current session's notes if in a live session.
3. Include top-N matched entities in condensed form (name + role + 2-line summary + status), N tuned per call kind (~10 for quick gen, ~25 for session wrap).
4. Claude's output may reference existing entities by id; the backend validates ids exist before linking.

### 4.4 Session Wrap pipeline (the flagship Claude job)

Trigger: DM clicks **Wrap Session**. Job steps:
1. Gather: `dm_raw_notes`, all `SessionEntityTouch` rows with current entity values, previous session's `hooks_for_next`, active PlotThreads.
2. Claude returns structured JSON:
```json
{
  "generated_summary": "2–4 paragraph narrative recap, read-aloud friendly",
  "key_events": ["..."],
  "state_updates": [
    {"entity_type":"npc","entity_id":"...","field":"status","new_value":"dead","evidence":"DM note: 'Toren died in the collapse'"},
    {"entity_type":"plot_thread","entity_id":"...","field":"status","new_value":"resolved","evidence":"..."}
  ],
  "new_entities_detected": [
    {"entity_type":"npc","fields":{...},"evidence":"DM mentioned 'the one-eyed ferryman' not in library"}
  ],
  "hooks_for_next": ["..."]
}
```
3. UI shows a **review screen**: summary editable inline; each `state_update` and `new_entity` rendered as a diff row with Accept / Reject / Edit. Top-level "Accept all" button expands to show everything first (answering the earlier open question: per-item control, with a bulk accept for speed). `evidence` string shown per row so the DM can verify Claude isn't hallucinating.
4. On confirm: apply updates transactionally, set session `complete`, `recap_read=false`.

### 4.5 Character Sheet Import pipeline (upload → extract → review → PC)

Turns a photo/scan/PDF of a player's character sheet into a fully editable in-app PC.

1. **Upload.** From the Party panel: "Add PC → Import from sheet." Accepts PDF (multi-page), PNG, JPG, WEBP. Store original in S3, create `SheetUpload` row. Multi-page PDFs: render each page to an image server-side (pdf → png at ~150dpi) so all pages go to Claude as vision input.
2. **Extract.** Claude vision call: input = page images + the campaign's `SystemTemplate.pc_sheet_schema` as the extraction target. Output = structured JSON matching the schema, plus a per-field confidence flag (`high` / `low` / `not_found`). Prompt instructs Claude to transcribe exactly what's written (including handwriting), never to invent values for empty fields, and to flag illegible entries as `low` rather than guessing.
3. **Review screen.** Split view: original sheet image (zoomable, page tabs) on the left, extracted editable form on the right. `low`-confidence and `not_found` fields highlighted amber. DM (or player, in the future portal phase) corrects inline. Nothing is saved to the PC until "Confirm import."
4. **Confirm.** Creates/updates the `PlayerCharacter`, populates `sheet` and derives `quick_stats`, links `source_upload_id`. The original upload stays attached and viewable from the PC page ("View original sheet").
5. **Re-import.** A PC can re-run import later (players level up on paper). The review screen becomes a diff view: current value vs. newly extracted value per field, accept/reject per field — same interaction pattern as Session Wrap review, reuse that component.

The in-app sheet itself is a form rendered from `pc_sheet_schema`: sectioned, keyboard-navigable, every field click-to-edit with instant autosave. `quick_stats` fields (HP, AC, conditions) additionally get +/- steppers and are editable from the Live Session page without opening the full sheet.

---

## 5. Spotify Integration

**Scope:** mood/ambience attachment + embedded playback. Not a full music manager.

### 5.1 Connection
- Settings → Integrations → "Connect Spotify" → standard OAuth (Authorization Code + PKCE handled by backend). Scopes: `user-read-playback-state`, `user-modify-playback-state`, `streaming` (Premium users), `playlist-read-private`.
- Store tokens in `ApiCredential`; backend refreshes automatically.
- App must function fully without Spotify connected — every soundtrack UI element hides or shows a "Connect Spotify" nudge.

### 5.2 Attaching music
Anywhere ambience makes sense — **Encounter**, **Location**, **Session** — an "Add soundtrack" control opens a picker:
- Search Spotify (tracks + playlists + albums) via backend proxy.
- Or paste a Spotify URL/URI.
- For Encounters, each attachment gets a **cue label**: `ambient` | `combat` | `reveal` | custom text ("boss phase 2"). Multiple attachments per encounter.
- Claude assist (optional button): "Suggest a vibe" → Claude describes the mood in search-friendly terms ("ominous low strings, slow tempo, dark fantasy") → runs the Spotify search with that query and shows results. Claude never invents specific track names as facts — it generates *search queries*, and only real search results are shown.

### 5.3 Playback
Two modes, auto-selected by account type:
1. **Spotify Premium:** use the Web Playback SDK — the app becomes a Spotify Connect device; cue buttons in Live Session Mode start the attached track/playlist instantly in-app. Crossfade between cues if feasible; otherwise hard cut.
2. **Free accounts / no SDK:** render the standard Spotify embed iframe for the attached item (30s previews / embed behavior per Spotify's rules) plus an "Open in Spotify" deep link.

### 5.4 Live Session soundboard
In Live Session Mode, a persistent **Soundboard strip** (bottom drawer, alongside the context drawer) shows all cues from the current session's planned encounters + the session playlist. One tap per cue. Currently-playing indicator. Stop/pause button. This is the "combat starts, hit the combat cue" moment the feature exists for.

---

## 6. Core Flows (implementation-level)

### Flow A — Quick Generate (⌘K)
- Global command bar, opens over any screen. Single text input + optional "type" override chips (Auto / NPC / Encounter / Item / Location / Map / Dialogue).
- On submit with Auto: one cheap Claude call classifies intent → may fan out to multiple linked generations (e.g., ambush → Encounter + 2 NPCs, cross-referenced by id before save).
- Results render as **cards in a Scratch Tray** (right side overlay, persists across navigation within the session, cleared on logout/refresh unless saved).
- Nothing touches the database until "Save to Campaign."

### Flow B — Card anatomy (one shared component)
Every entity card, everywhere, has the same header controls:
`Regenerate` · `Edit` (inline fields) · `Lock` (excluded from group regenerate) · `Save/Saved` · `Generate Art` · overflow menu (`Duplicate`, `Add relationship`, `Add soundtrack` where applicable, `Delete`).
Cards show a compact view by default, expand to full field view on click. DM-only fields (secrets, dm_only_notes) render with a distinct "GM screen" visual treatment.

### Flow C — Dedicated generators
Routes under `/campaign/:id/generate/*`: `npc`, `encounter`, `treasure`, `dialogue`, `battle-map`, `world-map`, plus any `CustomGenerator`. Each is a form (system-template-aware fields) → same card output pipeline as Flow A. Encounter generator includes a party selector prefilled with the active party and difficulty options rendered from `SystemTemplate.difficulty_model`.

### Flow D — Dialogue, live
- Entry points: any NPC card's "Talk" button; the Quick Generate bar with Dialogue chip.
- Input: one line describing the party's action. Output: 2–3 response options streamed side-by-side, each labeled with tone, generated from the NPC's stored personality/secrets/voice_notes + recent session notes.
- Buttons per option: "Use" (appends the exchange to Session Notes automatically when in a live session) or just read and dismiss. A running mini-transcript per NPC per session is kept in memory and included in follow-up dialogue calls so conversations stay coherent.

### Flow E — Session Prep
- Dashboard "Prep next session" panel: Claude drafts 2–4 suggestions from unresolved `hooks_for_next` + active PlotThreads (auto-runs at most once per dashboard visit if new hooks exist; cached).
- Accepting a suggestion generates the full asset(s) into a `Session` with status `planned`.
- Prep checklist UI on the planned session: encounters ✓, maps ✓, soundtrack cues ✓, NPCs ✓.

### Flow F — Live Session Mode
- "Start Session" promotes a planned session to `in_progress` (or creates a blank one).
- Layout (see §8.3): notes pane always visible, prep queue, quick generate, soundboard.
- Everything opened/generated auto-logs to `SessionEntityTouch`.
- "Wrap Session" → §4.4 pipeline → review screen → recap ready for next time.

### Flow G — Recap
- Dashboard shows "Previously on {campaign}…" card when latest complete session has `recap_read=false`: narrative summary (with a **Read Aloud** button — browser TTS, nice-to-have), key events bullets, loose threads, party snapshot. "Mark as read" dismisses.
- Full history at `/log`: chronological session list, each expandable, full-text searchable, filter by entity ("show sessions where Toren appears" via SessionEntityTouch).

### Flow H — Library & relationship graph
- `/library` tabs: NPCs / Items / Locations / Factions / Threads / Maps. Grid of cards, filters (status, tag, faction, location), sort, search.
- Entity detail page: full fields, edit, art, appearance history (sessions touched), and a **relationship graph** (force-directed, ~2 hops, click to navigate). v1 can render this as a simple list of relationships; graph visualization is a v1.5 polish item.

### Flow I — Maps workspace
- `/maps`: gallery of MapAssets, filter by kind.
- Battle map detail: full-res viewer (pan/zoom), **grid overlay editor** (toggle, cell size slider, offset drag, color/opacity), download PNG (with or without grid baked), "Send to encounter" linker.
- World/region maps: same viewer; pin dropper that links pins to Locations (pin → click → location card). Keep pins simple in v1 (position + location_id).
- Upload path: DMs can upload their own maps/images anywhere a generated image is expected.

---

## 7. Customization System

### 7.1 System templates (§3.2) — the deep lever
UI at `/settings/systems`: list built-ins + user templates. "Clone & edit" any built-in. Editor has tabs: Stat Block (drag-to-order field builder), Difficulty, Loot & Currency, Custom Fields, Prompt Addendum (with a "test generation" preview button that runs a sample NPC gen so users can see the effect).

### 7.2 Custom fields
Per system template (applies to all campaigns using it) or per campaign (one-off): add fields to any entity type. Types: text, long text, number, select, dice expression, checkbox. Custom fields appear in cards, editors, and are included in Claude's generation schema (Claude fills them when it can infer, leaves null otherwise).

### 7.3 Prompt style presets
`/settings/style`: user-level presets for **writing voice** (e.g., "grim and terse", "whimsical", "purple prose") and **art style** (e.g., "oil painting fantasy", "ink sketch", "pixel art", "photoreal grimdark") — each is a stored prompt fragment. Campaign settings can override user defaults. Every generator shows the active presets as removable chips.

### 7.4 Custom generators
Builder UI at `/settings/generators` (fields per `CustomGenerator` in §3.5). Example user creations: "Tavern Menu generator," "Rumor Table (d20)," "Ship generator for my pirate campaign." Freeform output type renders as a text card that can be saved as a note attached to the campaign. Custom generators appear alongside built-ins in the generate menu and as Quick Generate chips.

### 7.5 Import/export
- Export campaign as JSON (full fidelity) and as Markdown bundle (human-readable, images referenced).
- Import the JSON export (enables backup/transfer).
- Export any single entity card as PNG (rendered card) or Markdown — for sharing in Discord etc.

---

## 8. Information Architecture & Screens

### 8.1 Routes
```
/login, /signup, /onboarding
/campaigns                                  — campaign picker + create
/campaign/:id                               — dashboard
/campaign/:id/session/:sid                  — live session mode
/campaign/:id/log                           — session history
/campaign/:id/library[/:tab][/:entityId]    — library + entity detail
/campaign/:id/maps[/:mapId]                 — maps workspace
/campaign/:id/generate/:kind                — dedicated generators
/campaign/:id/settings                      — campaign settings (system template, themes, parties)
/settings                                   — account, API keys, integrations, style presets,
                                              systems, custom generators, usage & costs
```

### 8.2 App shell (desktop)
Three-panel layout per the prior plan: left nav (campaign sections) / main workspace with pinned Quick Generate bar / right context panel (party status, active threads, recently touched, Scratch Tray toggle). Context panel collapsible. Below 1024px: context panel becomes a slide-over; below 768px: bottom-tab navigation (Dashboard, Session, Library, Maps, More).

### 8.3 Live Session Mode — the Command Center

**Design mandate:** during play, every section of the campaign is reachable and editable from THIS ONE PAGE in a single click. No route changes during a session. Zero modals that block the rest of the screen (use non-blocking panels/popovers). Every text field is click-to-edit with instant autosave. The DM must be able to: jot a note, bump a PC's HP, open an NPC's secrets, fire a soundtrack cue, and submit a generation prompt — each in ≤1 click/keystroke from anywhere on this page.

```
┌──── Header: session #, timer, [Wrap Session] ─────────────────────────────────┐
├───────────┬──────────────────────────────────────────────┬────────────────────┤
│ SECTION   │              MAIN STAGE                      │   PARTY RAIL       │
│ RAIL      │                                              │  (always visible)  │
│ (icons+   │  Tabbed workspace, hot-swappable, state      │                    │
│  labels)  │  preserved per tab (tabs stay mounted):      │  One row per PC:   │
│           │   • Active Card(s) — whatever's in focus     │  name · HP −/＋ ·   │
│ ▸ Notes   │   • Dialogue — per-NPC threads               │  AC · conditions   │
│ ▸ PCs     │   • Prep Queue — planned assets, 1-click     │  chips             │
│ ▸ NPCs    │     deploy to stage                          │  Click row → full  │
│ ▸ Items   │   • Library peek — mini search + card list   │  sheet slides over │
│ ▸ Encntrs │     for ANY entity type, opens in stage      │  MAIN STAGE (not a │
│ ▸ Maps    │     without leaving the page                 │  modal; party rail │
│ ▸ Threads │   • Map viewer — pan/zoom current map        │  stays visible)    │
│ ▸ Log     │                                              │                    │
├───────────┴──────────────────────────────────────────────┴────────────────────┤
│ NOTES BAR (persistent, full width): one-line quick-note input — type, Enter,  │
│ it's timestamped into session notes. [⌃N focuses it from anywhere.]           │
│ Expandable to full notes pane. Autosaves every 2s.                            │
├────────────────────────────────────────────────────────────────────────────────┤
│ SOUNDBOARD STRIP: [🎵 Ambient] [⚔ Combat] [❗Reveal] [⏸]   |  ⌘K Quick Generate │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Section Rail behavior:** each item is a one-click filter that loads that entity type into the Main Stage's Library-peek tab, scoped to this campaign, with the same search/edit/generate affordances as the full Library — the DM never navigates away. A number badge on each rail item shows count of session-touched entities of that type.

**Speed requirements (hard):**
- **Quick-note:** `⌃N` (or tap) → type → Enter → logged with timestamp. Under 2 seconds total. Notes bar never loses focus due to background updates.
- **HP/condition edits:** steppers and chips directly on the Party Rail; single click, optimistic update, no confirmation.
- **Fire-and-forget generation:** `⌘K` → prompt → Enter → toast "Generating…" and the DM keeps working; result lands in the Scratch Tray with a subtle notification. The DM never waits on a spinner screen. All generations are queued jobs; multiple can run concurrently.
- **Any entity open in ≤2 clicks:** rail section (1) → card (2). Recently-touched entities float to the top of every rail section.
- **Everything on this page is keyboard-reachable:** `⌃N` notes, `⌘K` generate, `⌘1–8` rail sections, `Esc` closes slide-overs.

Below 1024px (tablet at the table): Section Rail collapses to icons, Party Rail becomes a horizontally scrolling strip pinned under the header.

### 8.4 Onboarding (first run)
1. Create account → 2. Enter Anthropic key + EvoLink key (validate live with a cheap ping; allow "skip for now" with clearly degraded state) → 3. Optional Spotify connect → 4. Create first campaign: name, pick system template, paste/write setting notes, define party → 5. Land on dashboard with a one-time guided tooltip tour (Quick Generate → Save → Library).

### 8.5 Empty/degraded states (must be designed, not afterthoughts)
- No Anthropic key: all generate buttons disabled with inline "Add your key" link.
- No EvoLink key: text generation works; art buttons show nudge.
- Claude/EvoLink call failure: card-level error state with Retry; job row records error.
- Empty library/dashboard: illustrated empty states with a suggested first action.

---

## 9. API Surface (backend routes summary)

```
Auth:        POST /auth/signup|login|logout, GET /auth/me
Keys:        PUT /api/credentials/:provider, POST /api/credentials/:provider/validate
Campaigns:   CRUD /api/campaigns, /api/campaigns/:id/export|import
Entities:    CRUD /api/campaigns/:id/{npcs|items|locations|factions|encounters|threads|relationships|maps}
PCs:         CRUD /api/campaigns/:id/player-characters
             PATCH /api/player-characters/:id/quick-stats   (hot path: HP/conditions, optimistic)
             POST /api/campaigns/:id/sheet-uploads          (multipart file upload)
             POST /api/sheet-uploads/:id/extract            (runs Claude vision job)
             POST /api/sheet-uploads/:id/confirm            (per-field decisions → writes PC)
Sessions:    CRUD /api/campaigns/:id/sessions
             POST /api/sessions/:id/start|wrap, POST /api/sessions/:id/wrap/confirm (accepts per-item decisions)
             POST /api/sessions/:id/touch (entity touch log)
Generate:    POST /api/generate/text        (kind, params) → SSE stream or JSON
             POST /api/generate/image       (kind, entity ref, prompt overrides) → job id
             GET  /api/jobs/:id             (poll) + SSE /api/jobs/stream
Search:      GET /api/campaigns/:id/search?q=   (cross-entity)
Spotify:     GET /api/spotify/auth|callback, GET /api/spotify/search?q=, playback control endpoints
Templates:   CRUD /api/system-templates, /api/custom-generators
Usage:       GET /api/usage (per-provider token/unit totals from GenerationJob)
```

All entity mutations validate `campaign_id` ownership. Generation endpoints enforce per-user rate limits and per-request size limits.

---

## 10. Theming & Visual Design

### 10.1 Themes
CSS-variable driven. Ship four: **Parchment** (light, warm, default), **Candlelight** (dark, warm), **Slate** (dark, neutral/modern), **High Contrast** (accessibility). Per-user default + optional per-campaign override (a horror campaign can be Candlelight while your heist campaign is Slate). Theme tokens: background layers, surface, ink, accent, danger, "GM-secret" highlight color, card border style, corner radius, font pair.

### 10.2 Design direction
Tabletop-flavored but restrained: subtle paper/linen texture on Parchment, serif display font for entity names (e.g., a Garamond-class face), clean sans for UI. No skeuomorphic overload — the cards should feel like a well-made GM screen insert, not a Renaissance-faire flyer. All imagery user-generated; the app chrome stays quiet so the art pops.

### 10.3 Art style presets (defaults shipped)
"Classic fantasy oil", "Ink & wash sketch", "Dark grimoire", "Bright storybook", "Photoreal cinematic", "Isometric game art" — each a stored prompt fragment (editable, cloneable per §7.3).

### 10.4 Accessibility
Keyboard-complete (⌘K bar, arrow-navigable cards), WCAG AA contrast in all themes, reduced-motion respect, TTS read-aloud on recaps, alt text auto-generated by Claude for every generated image.

---

## 11. Non-functional Requirements

- **Autosave everything** — session notes debounce-save every 2s; entity edits save on blur; no explicit save buttons except the deliberate "Save to Campaign" for scratch cards.
- **Optimistic UI** with rollback on failure for entity edits.
- **Streaming first** — text generations must stream; perceived latency is the #1 UX metric for at-the-table use.
- **Offline grace** — Live Session Mode caches the current session's prepped assets (localStorage/IndexedDB) so a WiFi hiccup mid-game doesn't blank the screen; notes queue and sync on reconnect. Generation obviously requires connectivity.
- **Cost transparency** — `/settings` usage page: per-day, per-campaign, per-provider unit totals from GenerationJob. Estimated $ using the price table.
- **Data ownership** — full export always available; account deletion purges all data and keys.

---

## 12. Build Phases (ship in this order)

**Phase 1 — Foundation (usable core)**
Auth, API key management + validation, Campaign/Party CRUD, SystemTemplate built-ins (read-only), core entity tables, Library (list + detail + edit), Claude text pipeline with structured output, NPC + Encounter + Treasure generators, Quick Generate (Auto classification), Scratch Tray + card component, Parchment/Slate themes.

**Phase 2 — Memory (the differentiator)**
Sessions CRUD, Live Session Mode Command Center (§8.3: section rail, main stage tabs, party rail, notes bar, keyboard shortcuts, fire-and-forget generation queue), Session Wrap pipeline + review/confirm screen, Recap card + Session Log, Prep suggestions, context-selection layer (Postgres FTS), PlotThreads, Relationships.

**Phase 2.5 — Player Characters & Sheet Import**
PlayerCharacter entity + full editable in-app sheet rendered from `pc_sheet_schema` (ship 5e/PF2e/CoC/generic sheet schemas in built-in templates); `quick_stats` hot-edit path wired into the Live Session Party Rail; SheetUpload flow — file upload (PDF/image, multi-page), Claude vision extraction with per-field confidence, split-view review/confirm screen, re-import diff flow (reuses Session Wrap review component); PC context included in generation calls (encounter difficulty now reads real PC levels/stats instead of party jsonb).

**Phase 3 — Media**
EvoLink pipeline (async jobs, storage, thumbnails), portraits + item art, battle map + world map generators, maps workspace (viewer, grid overlay, pins), upload path, art style presets, cost estimates + usage page.

**Phase 4 — Mood & customization**
Spotify OAuth, search/attach picker, cue labels, Web Playback SDK + embed fallback, Live Session soundboard, "suggest a vibe"; SystemTemplate editor (clone/edit), custom fields, custom generators, prompt style presets, per-campaign themes, import/export.

**Phase 5 — Polish**
Relationship graph visualization, TTS read-aloud, ambience video loops, pgvector context retrieval, offline caching, mobile layout refinements, remaining themes, guided onboarding tour.

**Phase 6 — Player Portal (future; architect for it now, build later)**
Players get their own logins, invited per-campaign by the DM, with a player-facing view of the campaign: their own character sheet (editable within DM-set permissions), plus discovered maps, items, NPCs, locations, and session recaps — but ONLY what the DM has revealed.

Core mechanism: **per-entity, per-field visibility.** Every entity gets a `visibility` state (`hidden` | `revealed`) defaulting to `hidden`, and DM-only fields (secrets, dm_only_notes, unrevealed stat blocks, undiscovered map regions) are never serialized to player-role API responses regardless of entity visibility — enforced server-side, not by hiding UI. DM controls: a "Reveal to players" toggle on every card (and on map pins), a bulk "reveal what this session touched" action inside Session Wrap, and a preview-as-player mode. Player recaps use `generated_summary` with a Claude pass that strips content linked to still-hidden entities.

**Architecture prep that must happen in earlier phases so this doesn't require a rewrite:** (1) roles on campaign membership (`CampaignMember: user_id, campaign_id, role: dm|player, player_character_id`) — add the table in Phase 1 even if only `dm` rows exist; (2) all entity serializers built role-aware from day one (a single `serializeForRole(entity, role)` chokepoint); (3) `visibility` column on all player-facing entities from Phase 1, defaulted `hidden`, invisible in the DM UI until Phase 6 ships controls for it; (4) image storage paths signed/authorized per-request, never public URLs, so unrevealed art can't be guessed.

**Acceptance tests:**
- *Phase 2 (memory):* run two mock sessions; in session 3's prep, ask Quick Generate for "someone in [town from session 1] who could help with [thread from session 2]" — the result must reference the correct saved entities by id without the DM restating any context.
- *Phase 2 (command center):* with a session live, perform this sequence without leaving the page and in under 30 seconds: log a quick note, drop a PC to half HP, open an NPC's secrets from the rail, fire a soundtrack cue placeholder, and submit a ⌘K generation prompt that continues in the background.
- *Phase 2.5 (sheet import):* upload a photographed handwritten 5e sheet; extraction must populate the in-app sheet with legible fields correct, illegible fields flagged amber (not guessed), and the confirmed PC's level/AC/HP must then appear in the Live Session Party Rail and influence a generated encounter's difficulty.
