import type { Application } from 'express';

/**
 * Represents an extracted Express route
 */
export interface ExpressRoute {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;
  /** Route path (e.g., /users/:id) */
  path: string;
  /** Path parameters extracted from the route */
  params: string[];
}

/**
 * Configuration options for generating MCP server
 */
export interface GenerateOptions {
  /** Base URL of the Express server (e.g., http://localhost:3000) */
  expressBaseUrl: string;
  /** Port for MCP server (when using Streamable HTTP transport) */
  mcpPort?: number;
  /** Path where the generated MCP server file will be written */
  outputPath: string;
  /** Generate TypeScript (.ts) or JavaScript (.js) */
  typescript?: boolean;
  /** Transport type for MCP server */
  transport?: 'stdio' | 'streamable-http';
}

/**
 * MCP tool definition
 */
export interface McpTool {
  /** Tool name (snake_case identifier) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * JSON-RPC 2.0 request message
 */
export interface McpRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: number | string;
}

/**
 * JSON-RPC 2.0 response message
 */
export interface McpResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Tool call result content
 */
export interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Internal representation for code generation
 */
export interface GeneratedTool extends McpTool {
  /** The original Express route this tool represents */
  route: ExpressRoute;
  /** Generated handler function name */
  handlerName: string;
}
