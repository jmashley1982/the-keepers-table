# Keeper's Table API server — runs as a Cloudflare Container.
# The client SPA is NOT built or served here; the Worker serves it from
# Workers Static Assets. index.ts detects the missing dist/public and serves
# API-only, which is exactly what we want inside the container.
FROM --platform=linux/amd64 node:20-bookworm-slim AS build

WORKDIR /app

# Prisma's query engine links against libssl. Without openssl installed, Prisma
# misdetects the platform at generate time and emits an engine for the wrong
# OpenSSL version, which then fails at runtime with
# "libssl.so.1.1: cannot open shared object file".
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Install with dev deps (tsc, types) for the server build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/prisma ./server/prisma
RUN pnpm install --frozen-lockfile

# Compile the server (tsconfig.json builds only server/src -> server/dist)
COPY tsconfig.json ./
COPY server/src ./server/src
RUN pnpm exec prisma generate --schema=server/prisma/schema.prisma \
  && pnpm exec tsc -p tsconfig.json

# Prune to production deps (keeps the generated Prisma client in node_modules)
RUN pnpm prune --prod


FROM --platform=linux/amd64 node:20-bookworm-slim

# Same libssl requirement applies to the runtime image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/package.json ./package.json
COPY server/prisma/schema.prisma ./server/prisma/schema.prisma
# pricing.ts reads config/pricing.json from process.cwd() at runtime
COPY config ./config

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
