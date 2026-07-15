import { Router, type Request, type Response, type NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import '../lib/auth.js'

export const friendsRouter = Router()

const CLAUDE_QUOTA = 24
const IMAGE_QUOTA = 12
const HAIKU_MODEL = 'claude-haiku-4-5'
const ZIMAGE_MODEL = 'z-image-turbo'

function getOwnerClients(): { anthropic: Anthropic | null; evolinkKey: string | null } {
  const claudeKey = process.env.CLAUDE_API_KEY?.trim()
  const evolinkKey = process.env.EVOLINK_API_KEY?.trim() ?? null

  let anthropic: Anthropic | null = null
  if (claudeKey) {
    anthropic = new Anthropic({ apiKey: claudeKey })
  } else if (evolinkKey) {
    anthropic = new Anthropic({ apiKey: evolinkKey, baseURL: 'https://api.evolink.ai/v1' })
  }

  return { anthropic, evolinkKey }
}

function requireFriend(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.friendUsername) {
    res.status(401).json({ error: 'Not logged in' })
    return
  }
  next()
}

friendsRouter.post('/login', async (req, res) => {
  const schema = z.object({
    username: z.string().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/, 'Username: letters, numbers, - and _ only'),
    password: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }
  const { username, password } = parsed.data

  const correctPassword = process.env.FRIENDS_PASSWORD
  if (!correctPassword) {
    res.status(503).json({ error: 'Portal not configured' })
    return
  }
  if (password !== correctPassword) {
    res.status(401).json({ error: 'Wrong password' })
    return
  }

  const friend = await prisma.friendUser.upsert({
    where: { username },
    update: {},
    create: { username },
  })

  req.session.friendUsername = username
  res.json({ username: friend.username, claudeUsed: friend.claudeUsed, imageUsed: friend.imageUsed })
})

friendsRouter.get('/me', requireFriend, async (req, res) => {
  const username = req.session.friendUsername!
  const friend = await prisma.friendUser.findUnique({ where: { username } })
  if (!friend) {
    delete req.session.friendUsername
    res.status(401).json({ error: 'Not logged in' })
    return
  }
  res.json({ username: friend.username, claudeUsed: friend.claudeUsed, imageUsed: friend.imageUsed })
})

friendsRouter.post('/logout', (req, res) => {
  delete req.session.friendUsername
  res.json({ ok: true })
})

friendsRouter.post('/generate/text', requireFriend, async (req, res) => {
  const schema = z.object({ prompt: z.string().min(1).max(2000) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Prompt is required (max 2000 chars)' })
    return
  }

  const username = req.session.friendUsername!
  const friend = await prisma.friendUser.findUnique({ where: { username } })
  if (!friend) {
    res.status(401).json({ error: 'Not logged in' })
    return
  }
  if (friend.claudeUsed >= CLAUDE_QUOTA) {
    res.status(429).json({ error: `You've used all ${CLAUDE_QUOTA} text generations.` })
    return
  }

  const { anthropic } = await getOwnerClients()
  if (!anthropic) {
    res.status(503).json({ error: 'Text generation is not configured on this server.' })
    return
  }

  const message = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: parsed.data.prompt }],
  })

  const text = message.content
    .filter(c => c.type === 'text')
    .map(c => (c as Anthropic.TextBlock).text)
    .join('')

  const updated = await prisma.friendUser.update({
    where: { username },
    data: { claudeUsed: { increment: 1 } },
  })

  res.json({ text, claudeUsed: updated.claudeUsed, imageUsed: updated.imageUsed })
})

friendsRouter.post('/generate/image', requireFriend, async (req, res) => {
  const schema = z.object({ prompt: z.string().min(1).max(1000) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Prompt is required (max 1000 chars)' })
    return
  }

  const username = req.session.friendUsername!
  const friend = await prisma.friendUser.findUnique({ where: { username } })
  if (!friend) {
    res.status(401).json({ error: 'Not logged in' })
    return
  }
  if (friend.imageUsed >= IMAGE_QUOTA) {
    res.status(429).json({ error: `You've used all ${IMAGE_QUOTA} image generations.` })
    return
  }

  const { evolinkKey } = await getOwnerClients()
  if (!evolinkKey) {
    res.status(503).json({ error: 'Image generation is not configured on this server.' })
    return
  }

  const submitRes = await fetch('https://api.evolink.ai/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${evolinkKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ZIMAGE_MODEL, prompt: parsed.data.prompt.slice(0, 2000), size: '1:1' }),
  })

  if (!submitRes.ok) {
    const errText = await submitRes.text()
    res.status(502).json({ error: `Submission failed (${submitRes.status}): ${errText.slice(0, 200)}` })
    return
  }

  const submitData = await submitRes.json() as { id: string; status: string; results?: string[] }

  if (submitData.status === 'completed' && submitData.results?.[0]) {
    const updated = await prisma.friendUser.update({ where: { username }, data: { imageUsed: { increment: 1 } } })
    res.json({ imageUrl: submitData.results[0], claudeUsed: updated.claudeUsed, imageUsed: updated.imageUsed })
    return
  }

  const taskId = submitData.id
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const pollRes = await fetch(`https://api.evolink.ai/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${evolinkKey}` },
    })
    if (!pollRes.ok) continue
    const pollData = await pollRes.json() as {
      status: string
      results?: string[]
      error?: { message?: string }
    }
    if (pollData.status === 'completed' && pollData.results?.[0]) {
      const updated = await prisma.friendUser.update({ where: { username }, data: { imageUsed: { increment: 1 } } })
      res.json({ imageUrl: pollData.results[0], claudeUsed: updated.claudeUsed, imageUsed: updated.imageUsed })
      return
    }
    if (pollData.status === 'failed' || pollData.status === 'cancelled') {
      res.status(502).json({ error: pollData.error?.message ?? 'Image generation failed' })
      return
    }
  }

  res.status(504).json({ error: 'Image generation timed out (60s). Please try again.' })
})
