---
name: Auth approach
description: express-session + connect-pg-simple replaces Lucia; why Lucia was dropped
---

## Rule
Use `express-session` with `connect-pg-simple` for session management. Do NOT use Lucia.

**Why:** `@lucia-auth/adapter-prisma` v1.x (required by Lucia v3) was pulled from the npm registry; only v4.x exists (for Lucia v4 which has a different API). The package-firewall on Replit blocked v1.x with "no matching version found".

## How to apply
- Sessions stored in `user_sessions` table (auto-created by connect-pg-simple)
- Session secret: `process.env.SESSION_SECRET` or falls back to `ENCRYPTION_KEY`
- User ID stored as `req.session.userId`
- Auth middleware reads `req.session.userId` and looks up user in Prisma
- `server/src/lib/auth.ts` only contains the `express-session` module augmentation for TypeScript
- No `Session_Auth` model in Prisma schema (removed; was for Lucia)
