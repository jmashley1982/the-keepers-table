#!/bin/bash
set -e

pnpm install --frozen-lockfile=false

node_modules/.bin/prisma db push --schema=server/prisma/schema.prisma --accept-data-loss
node_modules/.bin/prisma generate --schema=server/prisma/schema.prisma

# create the connect-pg-simple session table if it doesn't exist yet
node -e "
const { Pool } = require('./node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/index.js');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\`
  CREATE TABLE IF NOT EXISTS user_sessions (
    sid VARCHAR NOT NULL COLLATE \"default\",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
  ) WITH (OIDS=FALSE);
  CREATE INDEX IF NOT EXISTS IDX_session_expire ON user_sessions (expire);
\`).then(() => { console.log('user_sessions ready'); pool.end(); }).catch(e => { console.error('session table error:', e.message); pool.end(); process.exit(1); });
"
