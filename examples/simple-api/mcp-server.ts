#!/usr/bin/env node


// ===== MCP Protocol Implementation (2026-07-28, JSON-RPC 2.0) =====

const MCP_PROTOCOL_VERSION = '2026-07-28';
const CACHE_TTL_MS = 60_000;

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface McpRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any>;
  id?: number | string;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: Record<string, any>;
  error?: {
    code: number;
    message: string;
    data?: Record<string, any>;
  };
}

class McpServer {
  private tools = new Map<string, McpTool>();
  private serverName: string;
  private serverVersion: string;

  constructor(name: string, version: string) {
    this.serverName = name;
    this.serverVersion = version;
  }

  registerTool(tool: McpTool): void {
    this.tools.set(tool.name, tool);
  }

  async handleMessage(message: McpRequest): Promise<McpResponse> {
    if (!message || typeof message !== 'object') {
      return this.errorResponse(null, -32600, 'Invalid Request');
    }

    const { method, params, id } = message;
    if (message.jsonrpc !== '2.0' || id === undefined || typeof method !== 'string') {
      return this.errorResponse(id ?? null, -32600, 'Invalid Request');
    }

    const metadataError = this.validateRequestMetadata(params);
    if (metadataError) {
      return this.errorResponse(id, metadataError.code, metadataError.message, metadataError.data);
    }

    try {
      switch (method) {
        case 'server/discover':
          return this.handleDiscover(id);

        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          if (typeof params?.name !== 'string' || params.name.length === 0) {
            return this.errorResponse(id, -32602, 'Missing tool name in params');
          }
          return await this.handleToolsCall(params.name, params.arguments ?? {}, id);

        default:
          return this.errorResponse(id, -32601, `Method not found: ${method}`);
      }
    } catch (error: any) {
      return this.errorResponse(id, -32603, `Internal error: ${error.message}`);
    }
  }

  private validateRequestMetadata(params: Record<string, any> | undefined): {
    code: number;
    message: string;
    data?: Record<string, any>;
  } | undefined {
    const meta = params?._meta;
    if (!meta || typeof meta !== 'object') {
      return { code: -32602, message: 'Missing required request metadata' };
    }

    const requestedVersion = meta['io.modelcontextprotocol/protocolVersion'];
    if (typeof requestedVersion !== 'string') {
      return { code: -32602, message: 'Missing MCP protocol version in request metadata' };
    }
    if (requestedVersion !== MCP_PROTOCOL_VERSION) {
      return {
        code: -32022,
        message: 'Unsupported protocol version',
        data: { requested: requestedVersion, supported: [MCP_PROTOCOL_VERSION] },
      };
    }

    if (!meta['io.modelcontextprotocol/clientCapabilities'] ||
      typeof meta['io.modelcontextprotocol/clientCapabilities'] !== 'object') {
      return { code: -32602, message: 'Missing client capabilities in request metadata' };
    }
  }

  private handleDiscover(id: number | string): McpResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        resultType: 'complete',
        supportedVersions: [MCP_PROTOCOL_VERSION],
        capabilities: { tools: {} },
        instructions: 'This server exposes an Express API as MCP tools.',
        ttlMs: CACHE_TTL_MS,
        cacheScope: 'public',
      },
    };
  }

  private handleToolsList(id: number | string): McpResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        resultType: 'complete',
        tools: Array.from(this.tools.values()),
        ttlMs: CACHE_TTL_MS,
        cacheScope: 'public',
      },
    };
  }

  private async handleToolsCall(
    name: string,
    args: Record<string, any>,
    id: number | string
  ): Promise<McpResponse> {
    if (!this.tools.has(name)) {
      return this.errorResponse(id, -32602, `Tool not found: ${name}`);
    }

    try {
      const result = await callTool(name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resultType: 'complete',
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
          ...(result !== undefined && { structuredContent: result }),
        },
      };
    } catch (error: any) {
      // Tool failures are results so MCP clients can give the model a chance to recover.
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resultType: 'complete',
          isError: true,
          content: [{ type: 'text', text: `Tool execution failed: ${error.message}` }],
        },
      };
    }
  }

  private errorResponse(
    id: number | string | null,
    code: number,
    message: string,
    data?: Record<string, any>
  ): McpResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data && { data }),
      },
    };
  }

  async start(transport: 'stdio' | 'streamable-http' = 'stdio', port?: number): Promise<void> {
    if (transport === 'stdio') {
      await this.startStdio();
    } else {
      await this.startStreamableHttp(port || 3001);
    }
  }

  private async startStdio(): Promise<void> {
    const { createInterface } = await import('readline');
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

    rl.on('line', async (line: string) => {
      try {
        const response = await this.handleMessage(JSON.parse(line));
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (error: any) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error', data: { error: error.message } },
        }) + '\n');
      }
    });

    process.stderr.write(`MCP Server '${this.serverName}' started on stdio (${MCP_PROTOCOL_VERSION})\n`);
  }

  private async startStreamableHttp(port: number): Promise<void> {
    const { createServer } = await import('http');

    const server = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== 'POST' || req.url !== '/mcp') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', async () => {
        let message: McpRequest;
        try {
          message = JSON.parse(body);
        } catch {
          this.writeHttpResponse(res, this.errorResponse(null, -32700, 'Parse error'), 400);
          return;
        }

        if (!message || typeof message !== 'object') {
          this.writeHttpResponse(res, this.errorResponse(null, -32600, 'Invalid Request'), 400);
          return;
        }

        const headerError = this.validateHttpHeaders(req.headers, message);
        if (headerError) {
          this.writeHttpResponse(res, headerError, 400);
          return;
        }

        const response = await this.handleMessage(message);
        this.writeHttpResponse(res, response, response.error?.code === -32022 ? 400 : 200);
      });
    });

    server.listen(port, () => {
      process.stderr.write(`MCP Server '${this.serverName}' started on http://localhost:${port}/mcp (${MCP_PROTOCOL_VERSION})\n`);
    });
  }

  private validateHttpHeaders(headers: Record<string, string | string[] | undefined>, message: McpRequest): McpResponse | undefined {
    const getHeader = (name: string): string | undefined => {
      const value = headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };
    const id = message.id ?? null;
    const metaVersion = message.params?._meta?.['io.modelcontextprotocol/protocolVersion'];

    if (typeof metaVersion !== 'string' ||
      getHeader('mcp-protocol-version') !== metaVersion ||
      getHeader('mcp-method') !== message.method) {
      return this.errorResponse(id, -32020, 'MCP request headers do not match the request body');
    }
    if (message.method === 'tools/call' && getHeader('mcp-name') !== message.params?.name) {
      return this.errorResponse(id, -32020, 'Mcp-Name header does not match the tool name');
    }
  }

  private writeHttpResponse(res: any, response: McpResponse, status: number): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  }
}


// ===== Tool Definitions =====

const tools = [
  {
    name: 'get',
    description: 'GET /',
    inputSchema: {
          "type": "object",
          "properties": {
                "query": {
                      "type": "object",
                      "description": "Query string parameters (optional)",
                      "additionalProperties": true
                }
          }
    },
  },
  {
    name: 'get_users',
    description: 'GET /users',
    inputSchema: {
          "type": "object",
          "properties": {
                "query": {
                      "type": "object",
                      "description": "Query string parameters (optional)",
                      "additionalProperties": true
                }
          }
    },
  },
  {
    name: 'get_users_by_id',
    description: 'GET /users/:id',
    inputSchema: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Path parameter: id"
                },
                "query": {
                      "type": "object",
                      "description": "Query string parameters (optional)",
                      "additionalProperties": true
                }
          },
          "required": [
                "id"
          ]
    },
  },
  {
    name: 'post_users',
    description: 'POST /users',
    inputSchema: {
          "type": "object",
          "properties": {
                "body": {
                      "type": "object",
                      "description": "Request body"
                },
                "query": {
                      "type": "object",
                      "description": "Query string parameters (optional)",
                      "additionalProperties": true
                }
          }
    },
  },
  {
    name: 'put_users_by_id',
    description: 'PUT /users/:id',
    inputSchema: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Path parameter: id"
                },
                "body": {
                      "type": "object",
                      "description": "Request body"
                },
                "query": {
                      "type": "object",
                      "description": "Query string parameters (optional)",
                      "additionalProperties": true
                }
          },
          "required": [
                "id"
          ]
    },
  },
  {
    name: 'delete_users_by_id',
    description: 'DELETE /users/:id',
    inputSchema: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Path parameter: id"
                },
                "query": {
                      "type": "object",
                      "description": "Query string parameters (optional)",
                      "additionalProperties": true
                }
          },
          "required": [
                "id"
          ]
    },
  },
  {
    name: 'get_api_posts',
    description: 'GET /api/posts',
    inputSchema: {
          "type": "object",
          "properties": {
                "query": {
                      "type": "object",
                      "description": "Query string parameters (optional)",
                      "additionalProperties": true
                }
          }
    },
  },
  {
    name: 'get_api_posts_by_id',
    description: 'GET /api/posts/:id',
    inputSchema: {
          "type": "object",
          "properties": {
                "id": {
                      "type": "string",
                      "description": "Path parameter: id"
                },
                "query": {
                      "type": "object",
                      "description": "Query string parameters (optional)",
                      "additionalProperties": true
                }
          },
          "required": [
                "id"
          ]
    },
  }
];

// ===== Tool Handlers =====

async function callTool(name: string, args: any): Promise<any> {
  const baseUrl = 'http://localhost:3000';

  switch (name) {
    case 'get': {
      let url = `${baseUrl}/`;
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      const response = await fetch(url, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }

    case 'get_users': {
      let url = `${baseUrl}/users`;
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      const response = await fetch(url, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }

    case 'get_users_by_id': {
      let url = `${baseUrl}/users/${args.id}`;
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      const response = await fetch(url, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }

    case 'post_users': {
      let url = `${baseUrl}/users`;
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args.body || {})
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }

    case 'put_users_by_id': {
      let url = `${baseUrl}/users/${args.id}`;
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args.body || {})
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }

    case 'delete_users_by_id': {
      let url = `${baseUrl}/users/${args.id}`;
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }

    case 'get_api_posts': {
      let url = `${baseUrl}/api/posts`;
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      const response = await fetch(url, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }

    case 'get_api_posts_by_id': {
      let url = `${baseUrl}/api/posts/${args.id}`;
      if (args.query && Object.keys(args.query).length > 0) {
        const queryString = new URLSearchParams(args.query as any).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      const response = await fetch(url, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ===== Server Bootstrap =====

(async () => {
  const server = new McpServer('express-mcp-server', '1.0.0');
  
  tools.forEach(tool => server.registerTool(tool));
  
  await server.start('stdio');
})();