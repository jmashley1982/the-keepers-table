import axios from 'axios'

export const api = axios.create({
  baseURL: '/',
  withCredentials: true,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const url: string = err.config?.url ?? ''
      const isAuthProbe = url.startsWith('/auth/me') || url.startsWith('/api/friends')
      const onPublicPage = ['/', '/login', '/signup', '/onboarding', '/friends'].includes(window.location.pathname)
      if (!isAuthProbe && !onPublicPage) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  },
)

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error ?? err.message
  }
  if (err instanceof Error) return err.message
  return 'Unknown error'
}
