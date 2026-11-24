/**
 * Runtime embedded into every generated server. It intentionally uses only
 * JavaScript syntax so `typescript: false` produces a runnable .js file.
 */
export function createMcpProtocolTemplate(typescript = true): string {
  const types = typescript
    ? `// @ts-nocheck
interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
}

`
    : '';

  return (
    types +
    String.raw`
const MCP_PROTOCOL_VERSION = '2026-07-28';
const CACHE_TTL_MS = 60_000;

class McpServer {
  constructor(name, version, callTool) {
    this.tools = new Map();
    this.serverName = name;
    this.serverVersion = version;
    this.callTool = callTool;
  }

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  errorResponse(id, code, message, data) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
  }

  validateRequestMetadata(params) {
    const meta = params?._meta;
    if (!meta || typeof meta !== 'object') return { code: -32602, message: 'Missing required request metadata' };
    const requestedVersion = meta['io.modelcontextprotocol/protocolVersion'];
    if (typeof requestedVersion !== 'string') return { code: -32602, message: 'Missing MCP protocol version in request metadata' };
    if (requestedVersion !== MCP_PROTOCOL_VERSION) {
      return { code: -32022, message: 'Unsupported protocol version', data: { requested: requestedVersion, supported: [MCP_PROTOCOL_VERSION] } };
    }
    if (!meta['io.modelcontextprotocol/clientCapabilities'] || typeof meta['io.modelcontextprotocol/clientCapabilities'] !== 'object') {
      return { code: -32602, message: 'Missing client capabilities in request metadata' };
    }
  }

  async handleMessage(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return this.errorResponse(null, -32600, 'Invalid Request');
    }
    const notification = !Object.prototype.hasOwnProperty.call(message, 'id');
    const reply = response => notification ? undefined : response;
    const { method, params, id } = message;
    if (message.jsonrpc !== '2.0' || typeof method !== 'string') {
      return reply(this.errorResponse(id, -32600, 'Invalid Request'));
    }

    // MCP clients predating server/discover begin with initialize and do not
    // send 2026-07-28 request metadata. Keep that path interoperable.
    if (method === 'initialize') {
      return reply({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: this.serverName, version: this.serverVersion },
        },
      });
    }

    const legacyRequest = !params?._meta && (method === 'tools/list' || method === 'tools/call');
    if (!legacyRequest) {
      const metadataError = this.validateRequestMetadata(params);
      if (metadataError) return reply(this.errorResponse(id, metadataError.code, metadataError.message, metadataError.data));
    }

    try {
      switch (method) {
        case 'server/discover':
          return reply({ jsonrpc: '2.0', id, result: {
            resultType: 'complete', supportedVersions: [MCP_PROTOCOL_VERSION], capabilities: { tools: {} },
            instructions: 'This server exposes selected Express API routes as MCP tools.', ttlMs: CACHE_TTL_MS, cacheScope: 'public',
          }});
        case 'tools/list':
          return reply({ jsonrpc: '2.0', id, result: {
            resultType: 'complete', tools: Array.from(this.tools.values()), ttlMs: CACHE_TTL_MS, cacheScope: 'public',
          }});
        case 'tools/call': {
          if (typeof params?.name !== 'string' || params.name.length === 0) {
            return reply(this.errorResponse(id, -32602, 'Missing tool name in params'));
          }
          if (!this.tools.has(params.name)) return reply(this.errorResponse(id, -32602, 'Tool not found: ' + params.name));
          try {
            const result = await this.callTool(params.name, params.arguments ?? {});
            return reply({ jsonrpc: '2.0', id, result: {
              resultType: 'complete',
              content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
              ...(result === undefined ? {} : { structuredContent: result }),
            }});
          } catch (error) {
            return reply({ jsonrpc: '2.0', id, result: {
              resultType: 'complete', isError: true,
              content: [{ type: 'text', text: 'Tool execution failed: ' + (error instanceof Error ? error.message : String(error)) }],
            }});
          }
        }
        default:
          return reply(this.errorResponse(id, -32601, 'Method not found: ' + method));
      }
    } catch (error) {
      return reply(this.errorResponse(id, -32603, 'Internal error: ' + (error instanceof Error ? error.message : String(error))));
    }
  }

  async start(transport = 'stdio', port = 3001, httpOptions = {}) {
    if (transport === 'streamable-http') return this.startStreamableHttp(port, httpOptions);
    return this.startStdio();
  }

  async startStdio() {
    const { createInterface } = await import('node:readline');
    const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    input.on('line', async line => {
      try {
        const response = await this.handleMessage(JSON.parse(line));
        if (response !== undefined) process.stdout.write(JSON.stringify(response) + '\n');
      } catch (error) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', id: null,
          error: { code: -32700, message: 'Parse error', data: { error: error instanceof Error ? error.message : String(error) } },
        }) + '\n');
      }
    });
    process.stderr.write('MCP Server ' + this.serverName + ' started on stdio (' + MCP_PROTOCOL_VERSION + ')\n');
  }

  async startStreamableHttp(port, options) {
    const { createServer } = await import('node:http');
    const host = options.host ?? '127.0.0.1';
    const allowedOrigins = Array.isArray(options.allowedOrigins) ? options.allowedOrigins : [];
    const maxBodySize = Number.isSafeInteger(options.maxBodySize) && options.maxBodySize > 0 ? options.maxBodySize : 1_048_576;
    const authToken = options.authToken;
    const server = createServer(async (req, res) => {
      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
      const originAllowed = origin !== undefined && allowedOrigins.includes(origin);
      if (origin && !originAllowed) { res.writeHead(403); res.end('Origin not allowed'); return; }
      if (originAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name');
      }
      if (req.method === 'OPTIONS') { res.writeHead(originAllowed ? 204 : 403); res.end(); return; }
      if (req.method !== 'POST' || req.url !== '/mcp') { res.writeHead(404); res.end('Not Found'); return; }
      if (typeof authToken === 'string' && req.headers.authorization !== 'Bearer ' + authToken) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }); res.end('Unauthorized'); return;
      }
      let body;
      try { body = await this.readHttpBody(req, maxBodySize); }
      catch (error) {
        const status = error?.message === 'Payload too large' ? 413 : 400;
        this.writeHttpResponse(res, this.errorResponse(null, -32700, error instanceof Error ? error.message : 'Invalid request'), status);
        return;
      }
      let message;
      try { message = JSON.parse(body); }
      catch { this.writeHttpResponse(res, this.errorResponse(null, -32700, 'Parse error'), 400); return; }
      const headerError = this.validateHttpHeaders(req.headers, message);
      if (headerError) { this.writeHttpResponse(res, headerError, 400); return; }
      const response = await this.handleMessage(message);
      if (response === undefined) { res.writeHead(202); res.end(); return; }
      this.writeHttpResponse(res, response, response.error?.code === -32022 ? 400 : 200);
    });
    server.listen(port, host, () => process.stderr.write('MCP Server ' + this.serverName + ' started on http://' + host + ':' + port + '/mcp (' + MCP_PROTOCOL_VERSION + ')\n'));
  }

  readHttpBody(req, maxBodySize) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', chunk => {
        size += chunk.length;
        if (size > maxBodySize) { reject(new Error('Payload too large')); req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  validateHttpHeaders(headers, message) {
    // Legacy initialize/tools requests are permitted for stdio compatibility;
    // modern HTTP requests must bind headers to their JSON-RPC body.
    if (!message?.params?._meta && ['initialize', 'tools/list', 'tools/call'].includes(message?.method)) return undefined;
    const getHeader = name => { const value = headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; };
    const metaVersion = message?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
    if (typeof metaVersion !== 'string' || getHeader('mcp-protocol-version') !== metaVersion || getHeader('mcp-method') !== message?.method) {
      return this.errorResponse(message?.id, -32020, 'MCP request headers do not match the request body');
    }
    if (message.method === 'tools/call' && getHeader('mcp-name') !== message.params?.name) {
      return this.errorResponse(message.id, -32020, 'Mcp-Name header does not match the tool name');
    }
  }

  writeHttpResponse(res, response, status) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(response));
  }
}
`
  );
}
