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
  /** Only generate routes whose `METHOD /path` matches one of these patterns. */
  include?: RoutePattern[];
  /** Do not generate routes whose `METHOD /path` matches one of these patterns. */
  exclude?: RoutePattern[];
  /** Only expose safe, read-only HTTP methods (GET, HEAD, and OPTIONS). */
  readOnly?: boolean;
  /** Settings for the loopback-only Streamable HTTP transport. */
  http?: HttpTransportOptions;
}

/** A route pattern is matched against both `/path` and `METHOD /path`. */
export type RoutePattern = string | RegExp;

export interface HttpTransportOptions {
  /** Interface to bind. Defaults to `127.0.0.1`; use a non-loopback host deliberately. */
  host?: string;
  /** Browser origins allowed to call the HTTP transport. No origins are allowed by default. */
  allowedOrigins?: string[];
  /** Reject request bodies larger than this many bytes. Defaults to 1 MiB. */
  maxBodySize?: number;
  /** Optional bearer token required by the HTTP transport. */
  authToken?: string;
}

export interface GenerationResult {
  outputPath: string;
  toolCount: number;
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
    properties: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
}

/**
 * JSON-RPC 2.0 request message
 */
/**
 * Internal representation for code generation
 */
export interface GeneratedTool extends McpTool {
  /** The original Express route this tool represents */
  route: ExpressRoute;
  /** Generated handler function name */
  handlerName: string;
}
