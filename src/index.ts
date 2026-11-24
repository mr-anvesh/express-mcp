import type { Application } from 'express';
import type { GenerateOptions, GenerationResult } from './types.js';
import { extractRoutes } from './extractor.js';
import { generateMcpServerFile } from './generator.js';

/**
 * Generate an MCP server file from an Express application
 *
 * @param app - Express application instance
 * @param options - Generation options
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { generateMcpServer } from 'express-mcp-server';
 *
 * const app = express();
 * app.get('/users', (req, res) => res.json([{ id: 1, name: 'Alice' }]));
 * app.get('/users/:id', (req, res) => res.json({ id: req.params.id }));
 *
 * await generateMcpServer(app, {
 *   expressBaseUrl: 'http://localhost:3000',
 *   outputPath: './mcp-server.ts',
 *   typescript: true,
 *   transport: 'stdio'
 * });
 * ```
 */
export async function generateMcpServer(
  app: Application,
  options: GenerateOptions,
): Promise<GenerationResult> {
  // Extract routes from Express app
  const routes = extractRoutes(app);

  if (routes.length === 0) {
    throw new Error(
      'No routes found in Express application. Make sure you have defined at least one route.',
    );
  }

  const generatedRoutes = filterRoutes(routes, options);
  if (generatedRoutes.length === 0) {
    throw new Error('No routes matched the configured include, exclude, and readOnly options.');
  }

  await generateMcpServerFile(generatedRoutes, options);
  return { outputPath: options.outputPath, toolCount: generatedRoutes.length };
}

function filterRoutes(routes: import('./types.js').ExpressRoute[], options: GenerateOptions) {
  const isReadOnly = (method: string) => ['GET', 'HEAD', 'OPTIONS'].includes(method);
  const matches = (
    route: import('./types.js').ExpressRoute,
    patterns: GenerateOptions['include'],
  ) => {
    if (!patterns || patterns.length === 0) return false;
    const values = [route.path, `${route.method} ${route.path}`];
    return patterns.some((pattern) =>
      values.some((value) => {
        if (typeof pattern === 'string') return value.includes(pattern);
        pattern.lastIndex = 0;
        return pattern.test(value);
      }),
    );
  };

  return routes.filter(
    (route) =>
      (!options.readOnly || isReadOnly(route.method)) &&
      (!options.include || matches(route, options.include)) &&
      !matches(route, options.exclude),
  );
}

// Re-export types for convenience
export type {
  GenerateOptions,
  GenerationResult,
  HttpTransportOptions,
  RoutePattern,
  ExpressRoute,
  McpTool,
} from './types.js';

export { extractRoutes } from './extractor.js';
