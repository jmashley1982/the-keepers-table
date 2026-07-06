import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { encrypt, decrypt } from '../lib/crypto.js'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'

export const credentialsRouter = Router()
credentialsRouter.use(requireAuth)

credentialsRouter.put('/:provider', async (req, res) => {
  const { provider } = req.params
  if (!['anthropic', 'evolink'].includes(provider)) {
    res.status(400).json({ error: 'Invalid provider' })
    return
  }
  const schema = z.object({ key: z.string().min(1) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'key is required' })
    return
  }
  const encrypted = encrypt(parsed.data.key)
  const userId = res.locals.user.id
  await prisma.apiCredential.upsert({
    where: { userId_provider: { userId, provider } },
    update: { encryptedKey: encrypted, status: 'unchecked' },
    create: { userId, provider, encryptedKey: encrypted, status: 'unchecked' },
  })
  res.json({ ok: true })
})

credentialsRouter.post('/:provider/validate', async (req, res) => {
  const { provider } = req.params
  const userId = res.locals.user.id
  const cred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId, provider } },
  })
  if (!cred?.encryptedKey) {
    res.status(404).json({ error: 'No key on file' })
    return
  }

  let valid = false
  let errorMsg: string | null = null
  try {
    const key = decrypt(cred.encryptedKey)
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: key })
      await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
      valid = true
    } else if (provider === 'evolink') {
      const evolinkRes = await fetch('https://api.eachlabs.ai/v1/models', {
        headers: { 'X-API-Key': key },
      })
      if (evolinkRes.ok) {
        valid = true
      } else {
        const body = await evolinkRes.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>
        errorMsg = (body.message as string | undefined) ?? `EvoLink returned ${evolinkRes.status}`
      }
    }
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : 'Validation failed'
  }

  await prisma.apiCredential.update({
    where: { userId_provider: { userId, provider } },
    data: { status: valid ? 'valid' : 'invalid', lastValidatedAt: new Date() },
  })

  res.json({ valid, error: errorMsg })
})

credentialsRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const creds = await prisma.apiCredential.findMany({
    where: { userId },
    select: { provider: true, status: true, lastValidatedAt: true },
  })
  res.json({ credentials: creds })
})
