import type { Application } from 'express';
import type { GenerateOptions } from './types.js';
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
  options: GenerateOptions
): Promise<void> {
  // Extract routes from Express app
  const routes = extractRoutes(app);

  if (routes.length === 0) {
    throw new Error('No routes found in Express application. Make sure you have defined at least one route.');
  }

  // Generate MCP server file
  await generateMcpServerFile(routes, options);

  console.log(`Generated MCP server with ${routes.length} tools at: ${options.outputPath}`);
}

// Re-export types for convenience
export type {
  GenerateOptions,
  ExpressRoute,
  McpTool,
  McpRequest,
  McpResponse,
  ToolContent,
} from './types.js';

export { extractRoutes } from './extractor.js';
