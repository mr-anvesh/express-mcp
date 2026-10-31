import type { ExpressRoute, GenerateOptions, McpTool, GeneratedTool } from './types.js';
import { mcpProtocolTemplate } from './templates/mcp-protocol.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Generate MCP server file from Express routes
 */
export async function generateMcpServerFile(
  routes: ExpressRoute[],
  options: GenerateOptions
): Promise<void> {
  const generatedTools = routes.map(route => generateTool(route));

  const fileContent = generateFileContent(generatedTools, options);

  await fs.writeFile(options.outputPath, fileContent, 'utf-8');
}

/**
 * Convert an Express route to an MCP tool definition
 */
function generateTool(route: ExpressRoute): GeneratedTool {
  const name = generateToolName(route.method, route.path);
  const description = generateToolDescription(route);
  const inputSchema = generateToolSchema(route);
  const handlerName = `handle_${name}`;

  return {
    name,
    description,
    inputSchema,
    route,
    handlerName,
  };
}

/**
 * Generate a tool name from HTTP method and path
 * Example: GET /users/:id => get_users_by_id
 */
function generateToolName(method: string, path: string): string {
  const parts = path.split('/').filter(Boolean);

  const normalizedParts = parts.map(part => {
    if (part.startsWith(':')) {
      return 'by_' + part.slice(1);
    }
    return part.replace(/[^a-zA-Z0-9]/g, '_');
  });

  const segments = [method.toLowerCase(), ...normalizedParts];
  return segments.join('_').replace(/__+/g, '_');
}

/**
 * Generate human-readable description for a tool
 */
function generateToolDescription(route: ExpressRoute): string {
  return `${route.method} ${route.path}`;
}

/**
 * Generate JSON Schema for tool input parameters
 */
function generateToolSchema(route: ExpressRoute): {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
} {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  // Path parameters
  route.params.forEach(param => {
    properties[param] = {
      type: 'string',
      description: `Path parameter: ${param}`,
    };
    required.push(param);
  });

  // Request body (for POST, PUT, PATCH)
  if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
    properties.body = {
      type: 'object',
      description: 'Request body',
    };
  }

  // Query parameters (optional)
  properties.query = {
    type: 'object',
    description: 'Query string parameters (optional)',
    additionalProperties: true,
  };

  return {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };
}

/**
 * Generate the complete MCP server file content
 */
function generateFileContent(tools: GeneratedTool[], options: GenerateOptions): string {
  const { expressBaseUrl, transport = 'stdio', mcpPort, typescript = true } = options;

  const shebang = '#!/usr/bin/env node';

  // Generate tool definitions
  const toolDefinitions = tools
    .map(
      tool => `  {
    name: '${tool.name}',
    description: '${tool.description}',
    inputSchema: ${JSON.stringify(tool.inputSchema, null, 6).replace(/\n/g, '\n    ')},
  }`
    )
    .join(',\n');

  // Generate tool handlers
  const toolHandlers = tools
    .map(tool => {
      const { route, name } = tool;
      const hasBody = ['POST', 'PUT', 'PATCH'].includes(route.method);

      let urlConstruction = '';
      if (route.params.length > 0) {
        const pathWithParams = route.path.replace(/:([a-zA-Z0-9_]+)/g, '${args.$1}');
        urlConstruction = `let url = \`\${baseUrl}${pathWithParams}\`;`;
      } else {
        urlConstruction = `let url = \`\${baseUrl}${route.path}\`;`;
      }

      const queryParamCode = `
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }`;

      const fetchOptions: string[] = [`method: '${route.method}'`];

      if (hasBody) {
        fetchOptions.push(`headers: { 'Content-Type': 'application/json' }`);
        fetchOptions.push(`body: JSON.stringify(args.body || {})`);
      }

      const fetchCall = `fetch(url, {
        ${fetchOptions.join(',\n        ')}
      })`;

      return `    case '${name}': {
      ${urlConstruction}${queryParamCode}
      const response = await ${fetchCall};

      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }`;
    })
    .join('\n\n');

  const parts = [
    shebang,
    '',
    mcpProtocolTemplate,
    '',
    '// ===== Tool Definitions =====',
    '',
    'const tools = [',
    toolDefinitions,
    '];',
    '',
    '// ===== Tool Handlers =====',
    '',
    'async function callTool(name: string, args: any): Promise<any> {',
    `  const baseUrl = '${expressBaseUrl}';`,
    '',
    '  switch (name) {',
    toolHandlers,
    '',
    '    default:',
    '      throw new Error(`Unknown tool: ${name}`);',
    '  }',
    '}',
    '',
    '// ===== Server Bootstrap =====',
    '',
    "(async () => {",
    "  const server = new McpServer('express-mcp-server', '1.0.0');",
    '  ',
    '  tools.forEach(tool => server.registerTool(tool));',
    '  ',
    `  await server.start('${transport}'${mcpPort ? `, ${mcpPort}` : ''});`,
    "})();",
  ];

  return parts.join('\n');
}
