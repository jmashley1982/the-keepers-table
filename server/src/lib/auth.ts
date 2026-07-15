import 'express-session'

declare module 'express-session' {
  interface SessionData {
    userId: string
    isDemo?: boolean
    friendUsername?: string
  }
}
