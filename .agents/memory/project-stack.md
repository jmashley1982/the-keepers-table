---
name: Project stack & structure
description: Flat pnpm root (no workspace), single node_modules, server + client co-located
---

## Rule
All packages live in the root `package.json`. No `pnpm-workspace.yaml`. Single `node_modules/` at root.

**Why:** pnpm workspaces on Replit don't hoist binaries (like `prisma`) into sub-package `.bin/` directories and don't create `node_modules/` in sub-packages without extra config, causing `prisma generate` and `tsx` to not be found.

## How to apply
- `pnpm install` from root only
- Prisma binary: `node_modules/.bin/prisma --schema=server/prisma/schema.prisma`
- `tsx` binary: `node_modules/.bin/tsx`
- Vite config: `vite.config.ts` at root (sets `root: 'client'`)
- Tailwind config: `tailwind.config.js` at root (content points to `client/**`)
- Server TypeScript: `tsconfig.json` at root (includes `server/src/**`)
- Client TypeScript: `client/tsconfig.json` (bundler moduleResolution, noEmit)
- Workflow command: `pnpm run dev` → `concurrently "node_modules/.bin/tsx watch server/src/index.ts" "vite"`
- Server port: 3001; Client/preview port: 5000 (required for Replit webview)
