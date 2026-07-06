import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export const templatesRouter = Router()
templatesRouter.use(requireAuth)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toJson = (v: unknown): any => JSON.parse(JSON.stringify(v ?? null))

templatesRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const templates = await prisma.systemTemplate.findMany({
    where: { OR: [{ isBuiltin: true }, { ownerUserId: userId }] },
    orderBy: [{ isBuiltin: 'desc' }, { name: 'asc' }],
  })
  res.json({ templates })
})

templatesRouter.post('/', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    promptAddendum: z.string().optional(),
    statBlockSchema: z.array(z.unknown()).optional(),
    difficultyModel: z.record(z.unknown()).optional(),
    currencyAndRarity: z.record(z.unknown()).optional(),
    customEntityFields: z.array(z.unknown()).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
  const { statBlockSchema, difficultyModel, currencyAndRarity, customEntityFields, ...rest } = parsed.data
  const template = await prisma.systemTemplate.create({
    data: {
      ...rest,
      ownerUserId: userId,
      isBuiltin: false,
      statBlockSchema: toJson(statBlockSchema),
      difficultyModel: toJson(difficultyModel),
      currencyAndRarity: toJson(currencyAndRarity),
      customEntityFields: toJson(customEntityFields),
    },
  })
  res.json({ template })
})

templatesRouter.post('/:id/clone', async (req, res) => {
  const userId = res.locals.user.id
  const source = await prisma.systemTemplate.findUnique({ where: { id: req.params.id } })
  if (!source) { res.status(404).json({ error: 'Not found' }); return }
  const clone = await prisma.systemTemplate.create({
    data: {
      ownerUserId: userId,
      isBuiltin: false,
      name: `${source.name} (copy)`,
      description: source.description,
      promptAddendum: source.promptAddendum,
      statBlockSchema: toJson(source.statBlockSchema),
      difficultyModel: toJson(source.difficultyModel),
      currencyAndRarity: toJson(source.currencyAndRarity),
      customEntityFields: toJson(source.customEntityFields),
    },
  })
  res.json({ template: clone })
})

templatesRouter.patch('/:id', async (req, res) => {
  const userId = res.locals.user.id
  const template = await prisma.systemTemplate.findFirst({
    where: { id: req.params.id, ownerUserId: userId, isBuiltin: false },
  })
  if (!template) { res.status(404).json({ error: 'Not found or not editable' }); return }
  const updated = await prisma.systemTemplate.update({ where: { id: req.params.id }, data: req.body })
  res.json({ template: updated })
})
