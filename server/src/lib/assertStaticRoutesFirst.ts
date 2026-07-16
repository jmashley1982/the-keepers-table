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

/**
 * assertNoStaticAfterDynamic
 *
 * A self-contained variant of the route-order guard intended for router
 * factories (e.g. the `entityRoutes` factory in entities.routes.ts) where
 * the set of static keyword paths is not known in advance.
 *
 * Rather than requiring an explicit `staticPaths` list, this function scans
 * the router's stack automatically and fails immediately if ANY static
 * (non-parameterised) path appears AFTER the first dynamic wildcard segment.
 *
 * A path is considered "dynamic" when any of its segments starts with `:`.
 * A path is considered "static" when none of its segments starts with `:`.
 * The root path `/` is excluded because it is intentionally registered before
 * the wildcard and does not conflict.
 *
 * Call this at the bottom of a factory function, after all routes have been
 * registered on the sub-router, so violations are detected at server-start
 * rather than silently at request time.
 *
 * @param router     The Express Router to inspect.
 * @param routerName A human-readable name used in error messages.
 *
 * @example
 * // Inside entityRoutes factory, after all router.get/patch/post/delete calls:
 * assertNoStaticAfterDynamic(router, `entityRoutes(${entityName})`);
 * return router;
 */
export function assertNoStaticAfterDynamic(router: Router, routerName: string): void {
  type Layer = { route?: { path: string; methods: Record<string, boolean> } }
  const stack = (router as unknown as { stack: Layer[] }).stack

  const isDynamic = (path: string) =>
    path.split('/').some((segment) => segment.startsWith(':'))

  const isStatic = (path: string) =>
    path !== '/' && !isDynamic(path)

  const firstDynamicIndex = stack.findIndex((l) => l.route && isDynamic(l.route.path))

  if (firstDynamicIndex === -1) {
    return
  }

  const firstDynamicPath = stack[firstDynamicIndex].route!.path

  for (let i = firstDynamicIndex + 1; i < stack.length; i++) {
    const layer = stack[i]
    if (layer.route && isStatic(layer.route.path)) {
      throw new Error(
        `[${routerName}] Route-order guard: static route "${layer.route.path}" ` +
          `(stack index ${i}) is declared AFTER the dynamic route "${firstDynamicPath}" ` +
          `(stack index ${firstDynamicIndex}). ` +
          `Move "${layer.route.path}" above "${firstDynamicPath}" so Express does not shadow it.`,
      )
    }
  }
}
