# Keeper’s Table Threat Model

## System summary
Keeper’s Table is a public web application with a React/Vite frontend and an Express backend backed by PostgreSQL through Prisma. Users authenticate with cookie-backed sessions. The application stores campaign data for tabletop game masters, including session notes, NPC details, and encrypted third-party AI API credentials. The backend can send user campaign content to external AI providers (Anthropic and EvoLink) to generate text or images.

## Deployment and scope assumptions
- Production deployments are public unless explicitly marked private or password-protected.
- Production traffic is protected in transit by platform-managed TLS.
- `NODE_ENV` is `production` in deployed environments.
- This threat model focuses on production-reachable code paths. Dev-only tooling, mockups, and unmounted sample integration routes are out of scope unless they are actually mounted by `server/src/index.ts`.

## Assets that matter
- User accounts and active session cookies.
- Private campaign content: session notes, NPC secrets, plot threads, locations, factions, and uploaded assets.
- Stored third-party API credentials in `ApiCredential` rows.
- Owner-paid AI quotas and provider API keys used for friend/demo flows.
- Object storage assets tied to campaigns.

## Trust boundaries
1. **Internet to Express app**: all public HTTP endpoints, especially `/auth/**`, `/api/friends/login`, `/api/generate/**`, and campaign-scoped CRUD routes.
2. **Authenticated user to multi-tenant data**: any route that accepts campaign, session, NPC, or entity identifiers must verify ownership before reading or mutating data.
3. **Backend to external AI providers**: prompts and context sent to Anthropic/EvoLink must only contain data the requesting user is authorized to disclose.
4. **Runtime configuration to security controls**: environment/config secrets used for encryption, session signing, or quota-backed provider access are security-critical.
5. **Backend to object storage/database**: storage keys and record ownership must remain scoped to the owning campaign/user.

## Production attack surfaces
- Public signup/login endpoints and any shared-password entry points.
- Authenticated campaign CRUD APIs under `/api/campaigns/**`, `/api/entities/**`, `/api/sessions/**`, `/api/maps/**`, `/api/assets/**`, and `/api/generate/**`.
- Session-backed SSE/job endpoints.
- Runtime configuration in `.replit` and environment variables used by `server/src/index.ts` and `server/src/lib/crypto.ts`.

## Main threat classes to prioritize
- Broken access control / IDOR across campaign-scoped identifiers.
- Cross-tenant data disclosure through AI prompt construction.
- Authentication abuse: brute force, credential stuffing, and shared-secret abuse.
- Secret management flaws that enable session forgery or decryption of stored credentials.
- Storage/data exposure only where production-mounted and internet reachable.

## Scan anchors
- `server/src/index.ts`
- `server/src/routes/generate.routes.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/routes/friends.routes.ts`
- `server/src/routes/campaigns.routes.ts`
- `server/src/routes/entities.routes.ts`
- `server/src/routes/sessions.routes.ts`
- `server/src/routes/assets.routes.ts`
- `server/src/lib/crypto.ts`
- `.replit`

## Current scoping notes
- `server/replit_integrations/object_storage/**` currently appears unmounted and should be ignored unless production wiring changes.
- Deterministic scan hits in transitive `uuid` are not currently considered exploitable because the app does not directly call the affected buffer-writing APIs.
- High-entropy record IDs reduce blind-ID guessing but do not eliminate IDOR risk when identifiers can be learned elsewhere.
