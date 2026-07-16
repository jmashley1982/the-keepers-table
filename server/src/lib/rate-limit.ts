import { Request, Response, NextFunction } from 'express'

interface WindowEntry {
  count: number
  resetAt: number
}

const store = new Map<string, WindowEntry>()

function getClientIp(req: Request): string {
  // req.ip is resolved by Express using the trust-proxy setting (set to 1 in
  // index.ts), so it reflects the real client IP from the last trusted proxy's
  // x-forwarded-for entry — not a raw, attacker-supplied header value.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown'
}

function pruneExpired() {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key)
  }
}

let pruneTimer: ReturnType<typeof setInterval> | null = null
function ensurePruneTimer() {
  if (!pruneTimer) {
    pruneTimer = setInterval(pruneExpired, 60_000)
    pruneTimer.unref?.()
  }
}

export function createRateLimiter(options: {
  windowMs: number
  max: number
  message?: string
}) {
  const { windowMs, max, message = 'Too many attempts. Please try again later.' } = options
  ensurePruneTimer()

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const ip = getClientIp(req)
    const key = `${req.path}:${ip}`
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count += 1
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfterSec))
      res.status(429).json({ error: message })
      return
    }

    next()
  }
}
