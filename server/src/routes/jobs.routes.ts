import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { registerSseClient } from '../lib/worker.js'
import { prisma } from '../lib/prisma.js'

export const jobsRouter = Router()
jobsRouter.use(requireAuth)

// ── GET /api/jobs/stream — SSE stream for job updates ─────────────────────────

jobsRouter.get('/stream', (req, res) => {
  const userId = res.locals.user.id

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  res.write(': connected\n\n')

  const ping = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': ping\n\n')
    } else {
      clearInterval(ping)
    }
  }, 25_000)

  const unregister = registerSseClient(userId, res)

  req.on('close', () => {
    clearInterval(ping)
    unregister()
  })
})

// ── GET /api/jobs/:jobId — poll job status ────────────────────────────────────

jobsRouter.get('/:jobId', async (req, res) => {
  const userId = res.locals.user.id
  const { jobId } = req.params

  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    select: { id: true, userId: true, status: true, error: true, outputRef: true, input: true, kind: true, createdAt: true, updatedAt: true },
  })

  if (!job || job.userId !== userId) {
    res.status(404).json({ error: 'Job not found' })
    return
  }

  const outputRef = job.outputRef as Record<string, unknown>
  const input = job.input as Record<string, unknown>
  res.json({
    jobId: job.id,
    status: job.status,
    error: job.error,
    rawError: outputRef?.rawError ?? null,
    assetId: outputRef?.assetId ?? null,
    craftedPrompt: input?.craftedPrompt ?? null,
    kind: job.kind,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  })
})
