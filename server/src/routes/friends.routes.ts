import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import '../lib/auth.js'

export const friendsRouter = Router()

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

  const email = `friend_${username}@keeper.internal`

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, displayName: username },
  })

  // Ensure UserPreference exists so generate routes get defaults
  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  })

  // Ensure FriendUser quota row exists
  await prisma.friendUser.upsert({
    where: { username },
    update: {},
    create: { username },
  })

  req.session.userId = user.id
  req.session.save((err) => {
    if (err) {
      console.error('[friends/login] session save error', err)
      res.status(500).json({ error: 'Session could not be saved' })
      return
    }
    res.json({ ok: true, username: user.displayName })
  })
})

friendsRouter.get('/me', async (req, res) => {
  const userId = req.session?.userId
  if (!userId) {
    res.status(401).json({ error: 'Not logged in' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } })
  if (!user || !user.email.startsWith('friend_') || !user.email.endsWith('@keeper.internal')) {
    res.status(401).json({ error: 'Not a friend account' })
    return
  }
  res.json({ username: user.displayName, isFriend: true })
})

friendsRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {})
  res.json({ ok: true })
})
