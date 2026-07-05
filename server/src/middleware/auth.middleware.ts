import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma.js'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    req.session.destroy(() => {})
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  res.locals.user = user
  next()
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (user) {
      res.locals.user = user
    }
  }
  next()
}
