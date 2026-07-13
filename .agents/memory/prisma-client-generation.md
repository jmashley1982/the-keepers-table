---
name: Prisma client generation after schema changes
description: The generated Prisma client must be regenerated whenever schema.prisma changes, or runtime calls like prisma.playerCharacter.findMany will crash with "Cannot read properties of undefined".
---

The post-merge script previously used `--skip-generate` on `prisma db push`, meaning DB schema synced but the TypeScript client was never rebuilt. This caused `prisma.<newModel>` to be `undefined` at runtime despite the table existing in the DB.

**Why:** `prisma db push` syncs the database tables but doesn't regenerate the TypeScript client in `node_modules`. The client codegen is a separate step (`prisma generate`).

**How to apply:** `scripts/post-merge.sh` now runs both steps explicitly:
```
node_modules/.bin/prisma db push --schema=server/prisma/schema.prisma --accept-data-loss
node_modules/.bin/prisma generate --schema=server/prisma/schema.prisma
```

After any manual schema change (e.g. `db push` from shell), also run `npx prisma generate` from `/server` before restarting the server. The symptom is `TypeError: Cannot read properties of undefined (reading 'findMany')` on the new model accessor.
