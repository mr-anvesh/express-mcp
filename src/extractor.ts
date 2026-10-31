import type { Application } from 'express';
import type { ExpressRoute } from './types.js';

/**
 * Extract all routes from an Express application
 * Supports both Express 4 (_router) and Express 5 (router)
 */
export function extractRoutes(app: Application): ExpressRoute[] {
  const routes: ExpressRoute[] = [];

  // Get the router - support both Express 4 and 5
  const router = (app as any)._router || (app as any).router;

  if (!router) {
    throw new Error('No router found on Express app. Make sure you have defined at least one route.');
  }

  // Recursively walk the router stack
  walkStack(router.stack, '', routes);

  return routes;
}

/**
 * Recursively walk through router layers to extract routes
 */
function walkStack(stack: any[], basePath: string, routes: ExpressRoute[]): void {
  if (!stack) return;

  for (const layer of stack) {
    if (layer.route) {
      // This is an actual route
      const path = normalizePath(basePath + layer.route.path);
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
      const params = extractPathParams(path);

      methods.forEach(method => {
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
function extractMountPath(layer: any): string {
  // First check if layer has a direct path property
  if (layer.path && layer.path !== '/') {
    return layer.path;
  }

  // If no path property, try to extract from regexp
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

/**
 * Extract path parameters from a route path
 * Example: /users/:id/:action => ['id', 'action']
 */
function extractPathParams(path: string): string[] {
  const matches = path.match(/:([a-zA-Z0-9_]+)/g);
  if (!matches) return [];

  return matches.map(match => match.slice(1)); // Remove ':' prefix
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
