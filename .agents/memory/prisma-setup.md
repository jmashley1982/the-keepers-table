---
name: Prisma setup
description: Non-default schema path; must use root-level binary; pnpm build approval needed
---

## Rule
Always specify `--schema=server/prisma/schema.prisma` for Prisma CLI commands. Run from root.

**Why:** Schema is not in the default `./prisma/schema.prisma` location; it's in `server/prisma/`.

## How to apply
- Generate: `node_modules/.bin/prisma generate --schema=server/prisma/schema.prisma`
- Push: `node_modules/.bin/prisma db push --schema=server/prisma/schema.prisma`
- Seed: `node_modules/.bin/tsx server/src/seed.ts`
- `package.json` scripts use the same flags under `db:generate`, `db:push`, `db:seed`
- pnpm requires `"pnpm": { "onlyBuiltDependencies": ["@prisma/client","@prisma/engines","esbuild","prisma"] }` in package.json to allow Prisma's postinstall scripts
- PrismaClient import in server code: `import { PrismaClient } from '@prisma/client'` (resolves fine from root node_modules)
