import express from 'express'
import cors from 'cors'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { authRouter } from './routes/auth.routes.js'
import { demoRouter } from './routes/demo.routes.js'
import { credentialsRouter } from './routes/credentials.routes.js'
import { campaignsRouter } from './routes/campaigns.routes.js'
import { entitiesRouter } from './routes/entities.routes.js'
import { sessionsRouter } from './routes/sessions.routes.js'
import { generateRouter } from './routes/generate.routes.js'
import { templatesRouter } from './routes/templates.routes.js'
import { preferencesRouter } from './routes/preferences.routes.js'
import { assetsRouter, campaignAssetsRouter } from './routes/assets.routes.js'
import { jobsRouter } from './routes/jobs.routes.js'
import { startWorker, stopWorker } from './lib/worker.js'
import './lib/auth.js'

const app = express()
const PORT = process.env.PORT ?? 3001

const PgSession = connectPgSimple(session)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ?? process.env.ENCRYPTION_KEY ?? 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    },
  }),
)

// Routes
app.use('/auth', authRouter)
app.use('/auth/demo', demoRouter)
app.use('/api/credentials', credentialsRouter)
app.use('/api/campaigns', campaignsRouter)
app.use('/api/campaigns', campaignAssetsRouter)
app.use('/api/entities', entitiesRouter)
app.use('/api/campaigns', sessionsRouter)
app.use('/api/generate', generateRouter)
app.use('/api/system-templates', templatesRouter)
app.use('/api/preferences', preferencesRouter)
app.use('/api/assets', assetsRouter)
app.use('/api/jobs', jobsRouter)

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err.message ?? 'Internal server error' })
})

const server = app.listen(PORT, async () => {
  console.log(`🧙 Keeper's Table server running on port ${PORT}`)
  await startWorker()
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
