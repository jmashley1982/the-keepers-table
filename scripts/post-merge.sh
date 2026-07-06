#!/bin/bash
set -e

pnpm install --frozen-lockfile=false

node_modules/.bin/prisma db push --schema=server/prisma/schema.prisma --accept-data-loss --skip-generate
