import { Container, getContainer } from '@cloudflare/containers'

interface Env {
  KEEPERS_CONTAINER: DurableObjectNamespace<KeepersContainer>
  ASSETS: Fetcher
  DATABASE_URL: string
  SESSION_SECRET: string
  ENCRYPTION_KEY: string
  R2_ACCOUNT_ID: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  R2_BUCKET_NAME: string
  CLAUDE_API_KEY?: string
  EVOLINK_API_KEY?: string
  FRIENDS_PASSWORD?: string
}

export class KeepersContainer extends Container<Env> {
  defaultPort = 3001
  // Sleeping stops pg-boss polling; queued image jobs sit safely in Postgres
  // and resume on next wake. Raise this if delayed generations become annoying.
  sleepAfter = '30m'

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Worker secrets are NOT auto-forwarded into the container — pass them
    // through explicitly as process env vars for the Express app.
    this.envVars = {
      NODE_ENV: 'production',
      PORT: '3001',
      DATABASE_URL: env.DATABASE_URL,
      SESSION_SECRET: env.SESSION_SECRET,
      ENCRYPTION_KEY: env.ENCRYPTION_KEY,
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: env.R2_BUCKET_NAME,
      ...(env.CLAUDE_API_KEY ? { CLAUDE_API_KEY: env.CLAUDE_API_KEY } : {}),
      ...(env.EVOLINK_API_KEY ? { EVOLINK_API_KEY: env.EVOLINK_API_KEY } : {}),
      ...(env.FRIENDS_PASSWORD ? { FRIENDS_PASSWORD: env.FRIENDS_PASSWORD } : {}),
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Static assets are served before the Worker via run_worker_first, so
    // only /api/* and /auth/* land here. The fixed "singleton" id keeps one
    // container instance, which the app's in-memory SSE registry and rate
    // limiter depend on.
    return getContainer(env.KEEPERS_CONTAINER, 'singleton').fetch(request)
  },
}
