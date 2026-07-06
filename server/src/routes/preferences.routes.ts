import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export const preferencesRouter = Router()
preferencesRouter.use(requireAuth)

preferencesRouter.patch('/', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    defaultTextModel: z.string().optional(),
    defaultImageModel: z.string().optional(),
    imageStylePreset: z.string().optional(),
    contentRating: z.enum(['family', 'standard', 'grim']).optional(),
    measurementUnits: z.enum(['imperial', 'metric']).optional(),
    themePreference: z.string().optional(),
    imageModelByCategory: z.record(z.string()).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }
  const pref = await prisma.userPreference.upsert({
    where: { userId },
    update: parsed.data,
    create: { userId, ...parsed.data },
  })
  res.json({ preference: pref })
})

preferencesRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const pref = await prisma.userPreference.findUnique({ where: { userId } })
  res.json({ preference: pref })
})
