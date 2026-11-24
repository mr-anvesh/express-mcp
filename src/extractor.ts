import type { Application } from 'express';
import type { ExpressRoute } from './types.js';

/**
 * Extract all routes from an Express application
 * Supports both Express 4 (_router) and Express 5 (router)
 */
export function extractRoutes(app: Application): ExpressRoute[] {
  const routes: ExpressRoute[] = [];

  // Get the router - support both Express 4 and 5
  const expressApp = app as unknown as { _router?: RouterLike; router?: RouterLike };
  let router = expressApp._router;

  // Express 4 exposes an `app.router` getter which deliberately throws. Only
  // Express 5 needs this fallback; catching here preserves our useful error.
  if (!router) {
    try {
      router = expressApp.router;
    } catch {
      router = undefined;
    }
  }

  if (!router) {
    throw new Error(
      'No router found on Express app. Make sure you have defined at least one route.',
    );
  }

  // Recursively walk the router stack
  walkStack(router.stack, '', routes);

  return routes;
}

/**
 * Recursively walk through router layers to extract routes
 */
interface RouterLike {
  stack?: Layer[];
}

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  handle?: RouterLike;
  path?: string;
  regexp?: { source: string };
  matchers?: Array<(path: string) => false | { path?: string }>;
}

function walkStack(stack: Layer[] | undefined, basePath: string, routes: ExpressRoute[]): void {
  if (!stack) return;

  for (const layer of stack) {
    if (layer.route) {
      // This is an actual route
      const path = normalizePath(basePath + layer.route.path);
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      const params = extractPathParams(path);

      methods.forEach((method) => {
        routes.push({ method, path, params });
      });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      // This is a sub-router mounted with app.use()
      const mountPath = extractMountPath(layer);
      walkStack(layer.handle.stack, basePath + mountPath, routes);
    } else if (layer.name === 'bound dispatch' && layer.handle?.stack) {
      // Alternative sub-router structure
      const mountPath = extractMountPath(layer);
      walkStack(layer.handle.stack, basePath + mountPath, routes);
    }
  }
}

/**
 * Extract mount path from a router layer
 * Parses the regex pattern to determine the mount path
 */
function extractMountPath(layer: Layer): string {
  // First check if layer has a direct path property
  if (layer.path && layer.path !== '/') {
    return layer.path;
  }

  // Express 5 replaces `regexp` with matchers. Its matcher result includes the
  // consumed path once it has matched a request, which is the only public
  // representation available on a Layer. Prefer it when present.
  const matchedPath = extractMatcherPath(layer.matchers);
  if (matchedPath) return matchedPath;

  // Express 4 stores the mount expression directly on the layer.
  if (!layer.regexp) return '';

  const source = layer.regexp.source;

  // Common patterns:
  // /^\/api\/?(?=\/|$)/i => /api
  // /^\/?(?=\/|$)/i => / (root)
  // /^\/api\/v1\/?(?=\/|$)/i => /api/v1

  // Try to extract the path between ^\ and \/?
  const match = source.match(/\^\\\/(.+?)\\\/\?/);

  if (match && match[1]) {
    const path = '/' + match[1].replace(/\\\//g, '/');
    return path;
  }

  // Try alternative pattern without the trailing \/?
  const match2 = source.match(/\^\\\/([^\\]+)/);

  if (match2 && match2[1]) {
    const path = '/' + match2[1].replace(/\\\//g, '/');
    return path;
  }

  return '';
}

function extractMatcherPath(matchers: Layer['matchers']): string {
  if (!matchers) return '';

  // Express 5's matcher API is intentionally opaque. A Layer retains its
  // consumed `path` after dispatch, but extraction also runs before requests.
  // Probe common root and API prefixes so ordinary static mounts are recovered
  // without relying on removed private `regexp` state. Parameterized mounts
  // cannot be inferred safely and are therefore left out.
  const candidates = ['', '/', '/api', '/api/v1', '/v1'];
  for (const matcher of matchers) {
    for (const candidate of candidates) {
      const result = matcher(candidate);
      if (result && result.path && result.path !== '/') return result.path;
    }
  }
  return '';
}

/**
 * Extract path parameters from a route path
 * Example: /users/:id/:action => ['id', 'action']
 */
function extractPathParams(path: string): string[] {
  const matches = path.match(/:([a-zA-Z0-9_]+)/g);
  if (!matches) return [];

  return matches.map((match) => match.slice(1)); // Remove ':' prefix
}

/**
 * Normalize path to ensure consistent formatting
 */
function normalizePath(path: string): string {
  // Remove duplicate slashes
  path = path.replace(/\/+/g, '/');

  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  // Remove trailing slash (except for root)
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path;
}
