/**
 * Represents an extracted Express route
 */
export interface RouteDefinition {
  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;
  /** Route path (e.g., /users/:id) */
  path: string;
}

export interface ExpressRoute extends RouteDefinition {
  /** Path parameters extracted from the route */
  params: string[];
}

/**
 * Configuration options for generating MCP server
 */
export type GenerateOptions = ServerOptions &
  (
    | {
        /** Forward calls to an existing API. This is the default. */
        mode?: 'proxy';
        expressBaseUrl: string;
        appModule?: never;
        appExport?: never;
      }
    | {
        /** Load the configured Express app once per MCP process. */
        mode: 'import';
        /** Node module specifier. Relative paths resolve from the generated file. */
        appModule: string;
        /** Name of the exported Express application. Defaults to "default". */
        appExport?: string;
        expressBaseUrl?: never;
      }
  );

interface ServerOptions {
  /** Full route manifest, used instead of inspecting opaque Express router layers. */
  routes?: readonly RouteDefinition[];
  /** JSON Schema contracts keyed by generated tool name. */
  contracts?: Record<
    string,
    { inputSchema?: Record<string, unknown>; outputSchema?: Record<string, unknown> }
  >;
  limits?: {
    timeoutMs?: number;
    maxConcurrentCalls?: number;
    maxResponseBytes?: number;
    maxFrameBytes?: number;
    drainTimeoutMs?: number;
  };
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
  /** Settings for the Streamable HTTP listener. */
  http?: HttpTransportOptions;
}

/** A route pattern is matched against both `/path` and `METHOD /path`. */
export type RoutePattern = string | RegExp;

export interface HttpTransportOptions {
  /** Verified JWT access tokens and required OAuth scopes for each generated tool. */
  oauth?: {
    resource: string;
    issuer: string;
    jwksUri: string;
    toolScopes: Record<string, string[]>;
    /** Proxy mode: module whose default export obtains an API-audience token. */
    delegateModule?: string;
  };
  /** Hostnames accepted at this listener, excluding the port. */
  allowedHosts?: string[];
  /** Serve aggregate per-tool counters at GET /metrics under the same authentication. */
  metrics?: boolean;
  /** Interface to bind. Defaults to `127.0.0.1`; use a non-loopback host deliberately. */
  host?: string;
  /** Browser origins allowed to call the HTTP transport. No origins are allowed by default. */
  allowedOrigins?: string[];
  /** Reject request bodies larger than this many bytes. Defaults to 1 MiB. */
  maxBodySize?: number;
  /** Legacy literal bearer token, embedded in the generated file. */
  authToken?: string;
  /** Read the HTTP bearer token from this environment variable at server startup. */
  authTokenEnv?: string;
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
    allOf?: Record<string, unknown>[];
  };
  outputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
}

/**
 * Internal representation for code generation
 */
export interface GeneratedTool extends McpTool {
  /** The original Express route this tool represents */
  route: ExpressRoute;
}

/** Verified OAuth identity available to imported handlers and proxy credential delegates. */
export interface McpPrincipal {
  issuer: string;
  subject: string;
  clientId: string;
  scopes: readonly string[];
}

/** Extra fields on an Express request dispatched inside an MCP replica. */
export interface ImportedRequestContext {
  mcpPrincipal?: McpPrincipal;
  mcpSignal: AbortSignal;
}

export type CredentialDelegate = (context: {
  principal: McpPrincipal;
  tool: string;
  signal: AbortSignal;
  /** For token exchange with the trusted issuer. */
  accessToken: string;
}) => Promise<string>;
