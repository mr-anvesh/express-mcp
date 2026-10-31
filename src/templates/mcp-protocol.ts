/**
 * This file contains the MCP protocol template that will be embedded
 * in the generated MCP server file.
 *
 * It implements JSON-RPC 2.0 with MCP-specific methods:
 * - initialize
 * - tools/list
 * - tools/call
 */

export const mcpProtocolTemplate = `
// ===== MCP Protocol Implementation (JSON-RPC 2.0) =====

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface McpRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: number | string;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
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
    const { method, params, id } = message;

    if (id === undefined) {
      throw new Error('Request ID is required');
    }

    try {
      switch (method) {
        case 'initialize':
          return this.handleInitialize(id);

        case 'tools/list':
          return this.handleToolsList(id);

        case 'tools/call':
          if (!params?.name) {
            return this.errorResponse(id, -32602, 'Missing tool name in params');
          }
          return await this.handleToolsCall(params.name, params.arguments || {}, id);

        default:
          return this.errorResponse(id, -32601, \`Method not found: \${method}\`);
      }
    } catch (error: any) {
      return this.errorResponse(id, -32603, \`Internal error: \${error.message}\`);
    }
  }

  private handleInitialize(id: number | string): McpResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: this.serverName,
          version: this.serverVersion,
        },
      },
    };
  }

  private handleToolsList(id: number | string): McpResponse {
    const tools = Array.from(this.tools.values());
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools,
      },
    };
  }

  private async handleToolsCall(
    name: string,
    args: any,
    id: number | string
  ): Promise<McpResponse> {
    const tool = this.tools.get(name);

    if (!tool) {
      return this.errorResponse(id, -32602, \`Tool not found: \${name}\`);
    }

    try {
      const result = await callTool(name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    } catch (error: any) {
      return this.errorResponse(
        id,
        -32603,
        \`Tool execution failed: \${error.message}\`,
        { stack: error.stack }
      );
    }
  }

  private errorResponse(
    id: number | string,
    code: number,
    message: string,
    data?: any
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

  start(transport: 'stdio' | 'sse' = 'stdio', port?: number): void {
    if (transport === 'stdio') {
      this.startStdio();
    } else {
      this.startSSE(port || 3001);
    }
  }

  private startStdio(): void {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line: string) => {
      try {
        const message = JSON.parse(line);
        const response = await this.handleMessage(message);
        console.log(JSON.stringify(response));
      } catch (error: any) {
        console.error(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
              data: { error: error.message },
            },
          })
        );
      }
    });

    process.stderr.write(\`MCP Server '\${this.serverName}' started on stdio\\n\`);
  }

  private startSSE(port: number): void {
    const http = require('http');
    const url = require('url');

    const server = http.createServer(async (req: any, res: any) => {
      const parsedUrl = url.parse(req.url, true);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (parsedUrl.pathname === '/sse' && req.method === 'GET') {
        // SSE endpoint
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        res.write('data: {"jsonrpc":"2.0","method":"connected"}\\n\\n');

        req.on('close', () => {
          res.end();
        });
      } else if (parsedUrl.pathname === '/message' && req.method === 'POST') {
        // Message endpoint
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const message = JSON.parse(body);
            const response = await this.handleMessage(message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } catch (error: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error' },
              })
            );
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(port, () => {
      process.stderr.write(\`MCP Server '\${this.serverName}' started on http://localhost:\${port}\\n\`);
    });
  }
}
`;
