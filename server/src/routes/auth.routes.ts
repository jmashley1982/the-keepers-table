import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import '../lib/auth.js'

const scryptAsync = promisify(scrypt)

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const buf = (await scryptAsync(password, salt, 64)) as Buffer
  return `${buf.toString('hex')}.${salt}`
}

async function verifyPassword(stored: string, supplied: string): Promise<boolean> {
  const [hashed, salt] = stored.split('.')
  const hashedBuf = Buffer.from(hashed, 'hex')
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer
  return timingSafeEqual(hashedBuf, suppliedBuf)
}

export const authRouter = Router()

authRouter.post('/signup', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().min(1).max(60),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }
  const { email, password, displayName } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName },
  })
  await prisma.userPreference.create({ data: { userId: user.id } })

  req.session.userId = user.id
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } })
})

authRouter.post('/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }
  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }
  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  req.session.userId = user.id
  res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } })
})

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {})
  res.json({ ok: true })
})

authRouter.get('/me', async (req, res) => {
  const userId = req.session?.userId
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { preference: true, credentials: { select: { provider: true, status: true } } },
  })
  if (!dbUser) {
    req.session.destroy(() => {})
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  res.json({ user: dbUser })
})
