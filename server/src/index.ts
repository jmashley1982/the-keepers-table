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
const PORT = process.env.PORT ?? 3001

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

const server = app.listen(PORT, async () => {
  console.log(`🧙 Keeper's Table server running on port ${PORT}`)
  await startWorker()
  await seedBuiltinPresets()
  await seedSystemTemplates()
  await seedEnemies()
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
