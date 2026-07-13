#!/bin/bash
set -e

pnpm install --frozen-lockfile=false

node_modules/.bin/prisma db push --schema=server/prisma/schema.prisma --accept-data-loss
node_modules/.bin/prisma generate --schema=server/prisma/schema.prisma
