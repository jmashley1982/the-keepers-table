import type { Router } from 'express'

/**
 * assertStaticRoutesFirst
 *
 * Express matches routes in declaration order.  When a router has both static
 * keyword paths (e.g. /active, /search) AND a dynamic wildcard at the same
 * level (e.g. /:sessionId), the static paths MUST be registered first or
 * Express will silently capture the keyword as the wildcard param and the
 * static route becomes unreachable.
 *
 * This utility runs once at module-load time and throws immediately (not
 * silently at request time) if the invariant is violated, so the bug cannot
 * survive a server start.
 *
 * @param router      The Express Router to inspect.
 * @param routerName  A human-readable name used in error messages (e.g. 'sessions.routes').
 * @param staticPaths Full route paths that must appear BEFORE the dynamic wildcard
 *                    in the router stack (e.g. ['/:campaignId/sessions/active']).
 * @param dynamicPath The dynamic wildcard path that would shadow the statics if
 *                    registered first (e.g. '/:campaignId/sessions/:sessionId').
 *
 * @example
 * // In sessions.routes.ts:
 * assertStaticRoutesFirst(sessionsRouter, {
 *   routerName: 'sessions.routes',
 *   staticPaths: ['/:campaignId/sessions/active'],
 *   dynamicPath: '/:campaignId/sessions/:sessionId',
 * })
 */
export function assertStaticRoutesFirst(
  router: Router,
  options: {
    routerName: string
    staticPaths: string[]
    dynamicPath: string
  },
): void {
  const { routerName, staticPaths, dynamicPath } = options

  type Layer = { route?: { path: string; methods: Record<string, boolean> } }
  const stack = (router as unknown as { stack: Layer[] }).stack

  const dynamicIndex = stack.findIndex((l) => l.route?.path === dynamicPath)

  if (dynamicIndex === -1) {
    throw new Error(
      `[${routerName}] Route-order guard: dynamic route "${dynamicPath}" was not found on ` +
        `the router stack. Check that the path string passed to assertStaticRoutesFirst matches ` +
        `exactly what was registered with router.get/patch/post/delete.`,
    )
  }

  for (const staticPath of staticPaths) {
    const staticIndex = stack.findIndex((l) => l.route?.path === staticPath)

    if (staticIndex === -1) {
      throw new Error(
        `[${routerName}] Route-order guard: static route "${staticPath}" was not found on ` +
          `the router stack. Either register the route handler or remove it from the ` +
          `staticPaths list passed to assertStaticRoutesFirst.`,
      )
    }

    if (staticIndex > dynamicIndex) {
      throw new Error(
        `[${routerName}] Route-order guard: static route "${staticPath}" ` +
          `(stack index ${staticIndex}) is declared AFTER the dynamic route "${dynamicPath}" ` +
          `(stack index ${dynamicIndex}). ` +
          `Move "${staticPath}" above "${dynamicPath}" so Express does not shadow it.`,
      )
    }
  }
}
