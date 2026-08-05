import express from 'express'
import cors from 'cors'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { authRouter } from './routes/auth.routes.js'
import { demoRouter } from './routes/demo.routes.js'
import { credentialsRouter } from './routes/credentials.routes.js'
import { campaignsRouter } from './routes/campaigns.routes.js'
import { entitiesRouter } from './routes/entities.routes.js'
import { sessionsRouter } from './routes/sessions.routes.js'
import { sessionZeroRouter } from './routes/session-zero.routes.js'
import { generateRouter } from './routes/generate.routes.js'
import { templatesRouter } from './routes/templates.routes.js'
import { preferencesRouter } from './routes/preferences.routes.js'
import { assetsRouter, campaignAssetsRouter } from './routes/assets.routes.js'
import { jobsRouter } from './routes/jobs.routes.js'
import { stylePresetsRouter } from './routes/style-presets.routes.js'
import { mapsRouter } from './routes/maps.routes.js'
import { playerCharactersRouter } from './routes/player-characters.routes.js'
import { enemiesRouter } from './routes/enemies.routes.js'
import { dnd5eRouter } from './routes/dnd5e.routes.js'
import { friendsRouter } from './routes/friends.routes.js'
import { startWorker, stopWorker } from './lib/worker.js'
import { seedBuiltinPresets } from './lib/seed-presets.js'
import { seedSystemTemplates, seedEnemies } from './lib/seed-templates.js'
import './lib/auth.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

// Boot diagnostic: report which env vars arrived, never their values. Missing
// config is the single most common cause of a container that starts but 500s
// on every request, and this turns that into a one-line answer in the logs.
{
  const required = ['DATABASE_URL', 'SESSION_SECRET', 'ENCRYPTION_KEY']
  const optional = ['NODE_ENV', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'CLAUDE_API_KEY', 'EVOLINK_API_KEY', 'FRIENDS_PASSWORD']
  const shown = (names: string[]) =>
    names.map((n) => `${n}=${process.env[n] ? 'set' : 'MISSING'}`).join(' ')
  console.log(`[boot] required: ${shown(required)}`)
  console.log(`[boot] optional: ${shown(optional)}`)
  const missing = required.filter((n) => !process.env[n])
  if (missing.length) {
    console.error(`[boot] ⚠️  Missing required env vars: ${missing.join(', ')} — requests will fail until these are set.`)
  }
}

// Trust the HTTPS reverse proxy (Cloudflare Worker in front of the container)
// so cookies and req.secure work correctly
app.set('trust proxy', 1)

const PgSession = connectPgSimple(session)

// NODE_ENV=production must be set explicitly on the host — it gates both the
// SESSION_SECRET requirement below and the secure cookie flag.
const isProduction = process.env.NODE_ENV === 'production'
const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret) {
  if (isProduction) {
    throw new Error('[session] SESSION_SECRET environment variable must be set in production. Refusing to start.')
  }
  console.warn('[session] WARNING: SESSION_SECRET is not set. Using an insecure dev-only fallback. Set SESSION_SECRET before deploying.')
}

const sessionMiddleware = session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    errorLog: (err) => console.error('[session-store]', err),
  }),
  secret: sessionSecret ?? 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    // secure:true works because trust proxy is set above
    secure: isProduction,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
})

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '2mb' }))

// Session middleware scoped to authenticated routes only.
// Static file serving (GET /) deliberately runs WITHOUT session middleware
// so a transient DB hiccup cannot return 500 on the homepage.
app.use('/auth', sessionMiddleware)
app.use('/api', sessionMiddleware)

// Routes
app.use('/auth', authRouter)
app.use('/auth/demo', demoRouter)
app.use('/api/credentials', credentialsRouter)
app.use('/api/campaigns', campaignsRouter)
app.use('/api/campaigns', campaignAssetsRouter)
app.use('/api/entities', entitiesRouter)
app.use('/api/campaigns', sessionsRouter)
app.use('/api/campaigns', sessionZeroRouter)
app.use('/api/generate', generateRouter)
app.use('/api/system-templates', templatesRouter)
app.use('/api/preferences', preferencesRouter)
app.use('/api/assets', assetsRouter)
app.use('/api/jobs', jobsRouter)
app.use('/api/style-presets', stylePresetsRouter)
app.use('/api/campaigns/:campaignId/maps', mapsRouter)
app.use('/api/campaigns', playerCharactersRouter)
app.use('/api/campaigns', enemiesRouter)
app.use('/api/dnd5e', dnd5eRouter)
app.use('/api/friends', friendsRouter)

// Health (no session required)
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// Deployment self-check. Reports which env vars are present (names only, never
// values) and whether the database is actually reachable, so a misconfigured
// deploy can be diagnosed from a browser instead of from log archaeology.
app.get('/api/health/config', async (_req, res) => {
  const names = ['DATABASE_URL', 'SESSION_SECRET', 'ENCRYPTION_KEY', 'NODE_ENV', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'CLAUDE_API_KEY', 'EVOLINK_API_KEY', 'FRIENDS_PASSWORD']
  const env = Object.fromEntries(names.map((n) => [n, process.env[n] ? 'set' : 'MISSING']))

  let database: string
  try {
    const { prisma } = await import('./lib/prisma.js')
    await prisma.$queryRaw`SELECT 1`
    database = 'connected'
  } catch (err) {
    // Strip any embedded credentials before echoing a driver error back.
    const raw = err instanceof Error ? err.message : String(err)
    database = raw.replace(/\/\/[^@\s]*@/g, '//***@').slice(0, 300)
  }

  res.json({ env, database, nodeVersion: process.version })
})

// Serve built client (production build output)
const __dirname = dirname(fileURLToPath(import.meta.url))
const clientDist = join(__dirname, '../../dist/public')
if (existsSync(clientDist)) {
  console.log(`📁 Serving static files from ${clientDist}`)
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
} else {
  console.warn(`⚠️  No static build found at ${clientDist} — serving API only`)
}

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message, err.stack)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

// Keep the process alive when background work misbehaves. The job worker and
// the seed jobs below run after the port is open; without these handlers a
// rejection in any of them takes down the whole server — and in a container
// that reads as "started but never listened".
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
})

// Bind explicitly to 0.0.0.0 so the container host's port check can see us.
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🧙 Keeper's Table server running on port ${PORT}`)

  // Each of these is best-effort: a failure degrades functionality but must
  // never prevent the server from serving requests.
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      console.log(`[boot] ${name} ok`)
    } catch (err) {
      console.error(`[boot] ${name} FAILED —`, err instanceof Error ? err.message : err)
    }
  }

  await step('worker', startWorker)
  await step('seed:presets', seedBuiltinPresets)
  await step('seed:templates', seedSystemTemplates)
  await step('seed:enemies', seedEnemies)
  console.log('[boot] startup complete')
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — shutting down gracefully')
  await stopWorker()
  server.close(() => process.exit(0))
})

process.on('SIGINT', async () => {
  await stopWorker()
  server.close(() => process.exit(0))
})
