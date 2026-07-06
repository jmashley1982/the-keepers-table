import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export const stylePresetsRouter = Router()
stylePresetsRouter.use(requireAuth)

stylePresetsRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const presets = await prisma.artStylePreset.findMany({
    where: { OR: [{ isBuiltin: true }, { ownerUserId: userId }] },
    orderBy: [{ isBuiltin: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, promptFragment: true, isBuiltin: true, previewAssetId: true, createdAt: true },
  })
  res.json({ presets })
})

stylePresetsRouter.post('/', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    name: z.string().min(1).max(60),
    promptFragment: z.string().min(1).max(500),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
    return
  }
  const preset = await prisma.artStylePreset.create({
    data: { ownerUserId: userId, name: parsed.data.name, promptFragment: parsed.data.promptFragment, isBuiltin: false },
  })
  res.json({ preset })
})

stylePresetsRouter.delete('/:id', async (req, res) => {
  const userId = res.locals.user.id
  const { id } = req.params
  const preset = await prisma.artStylePreset.findFirst({
    where: { id, ownerUserId: userId, isBuiltin: false },
  })
  if (!preset) {
    res.status(404).json({ error: 'Preset not found or cannot be deleted' })
    return
  }
  await prisma.artStylePreset.delete({ where: { id } })
  res.json({ ok: true })
})
