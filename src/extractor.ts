import type { Application } from 'express';
import type { ExpressRoute, RouteDefinition } from './types.js';

interface Layer {
  route?: { path: unknown; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: Layer[] };
  regexp?: RegExp & { fast_slash?: boolean };
  slash?: boolean;
}

const supportedMethods = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
const explicitRoutesHint =
  'Supply explicit routes with full method/path templates in the routes option.';

function makeRoute(method: string, path: string): ExpressRoute {
  const upper = method.toUpperCase();
  if (!supportedMethods.has(upper))
    throw new Error(`Unsupported HTTP method ${upper}. ${explicitRoutesHint}`);
  // Only emit paths that the executor can interpolate without changing their meaning.
  const segments = path.split('/');
  if (
    !path.startsWith('/') ||
    path.includes('//') ||
    segments.some(
      (part) =>
        part === '.' || part === '..' || !/^(?:[A-Za-z0-9._~'-]|:[A-Za-z0-9_]+)*$/.test(part),
    )
  ) {
    throw new Error(`Unsupported Express path "${path}". ${explicitRoutesHint}`);
  }
  const params = [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]!);
  for (const name of params) {
    if (
      name === 'query' ||
      (name === 'body' && ['POST', 'PUT', 'PATCH'].includes(upper)) ||
      Object.hasOwn(Object.prototype, name) ||
      params.indexOf(name) !== params.lastIndexOf(name)
    ) {
      throw new Error(`Ambiguous path parameter "${name}" in ${upper} ${path}.`);
    }
  }
  return { method: upper, path, params };
}

function mountPrefix(layer: Layer): string {
  if (layer.slash || layer.regexp?.fast_slash) return '';
  // Express 4 compiles a static mount to an anchored regexp with this exact suffix.
  const source = layer.regexp?.source;
  const suffix = String.raw`\/?(?=\/|$)`;
  if (source?.startsWith('^') && source.endsWith(suffix)) {
    const literal = source.slice(1, -suffix.length);
    if (/^(?:\\\/|\\\.|[A-Za-z0-9_~'-])+$/.test(literal)) {
      return literal.replace(/\\([/.])/g, '$1');
    }
  }
  throw new Error(`Cannot infer Express router mount. ${explicitRoutesHint}`);
}

/** Extract directly representable routes, or use an authoritative route manifest. */
export function extractRoutes(
  app: Application,
  definitions?: readonly RouteDefinition[],
): ExpressRoute[] {
  const routes = new Map<string, ExpressRoute>();
  function add(method: string, path: string) {
    const route = makeRoute(method, path);
    routes.set(route.method + ' ' + path, route);
  }
  if (definitions !== undefined) {
    if (!Array.isArray(definitions)) throw new Error('routes must be an array.');
    for (const entry of definitions) {
      if (typeof entry?.method !== 'string' || typeof entry.path !== 'string') {
        throw new Error('Each explicit route requires a string method and path.');
      }
      add(entry.method, entry.path);
    }
    return [...routes.values()];
  }

  const application = app as unknown as {
    _router?: { stack: Layer[] };
    router?: { stack: Layer[] };
  };
  // Express 4's deprecated router getter throws if no routes were registered.
  const router = application._router ?? getRouter();
  function getRouter() {
    try {
      return application.router;
    } catch {
      return undefined;
    }
  }
  if (!router)
    throw new Error('No router found on Express app. Register routes before generation.');

  function walk(stack: Layer[], prefix: string, ancestors: Set<Layer[]>) {
    if (ancestors.has(stack)) throw new Error(`Recursive router mount. ${explicitRoutesHint}`);
    const parents = new Set(ancestors).add(stack);
    for (const layer of stack) {
      if (layer.route) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        for (const path of paths) {
          if (typeof path !== 'string' || !path.startsWith('/')) {
            throw new Error(
              `Unsupported Express route under "${prefix || '/'}". ${explicitRoutesHint}`,
            );
          }
          for (const [method, enabled] of Object.entries(layer.route.methods)) {
            if (enabled) add(method, prefix + path);
          }
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPrefix(layer), parents);
      } else if (layer.name === 'mounted_app') {
        throw new Error(
          `Cannot infer routes of a mounted Express application. ${explicitRoutesHint}`,
        );
      }
    }
  }
  walk(router.stack, '', new Set());
  return [...routes.values()];
}
