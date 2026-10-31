#!/usr/bin/env node
// ===== MCP Protocol Implementation (JSON-RPC 2.0) =====
class McpServer {
    tools = new Map();
    serverName;
    serverVersion;
    constructor(name, version) {
        this.serverName = name;
        this.serverVersion = version;
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    async handleMessage(message) {
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
                    return this.errorResponse(id, -32601, `Method not found: ${method}`);
            }
        }
        catch (error) {
            return this.errorResponse(id, -32603, `Internal error: ${error.message}`);
        }
    }
    handleInitialize(id) {
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
    handleToolsList(id) {
        const tools = Array.from(this.tools.values());
        return {
            jsonrpc: '2.0',
            id,
            result: {
                tools,
            },
        };
    }
    async handleToolsCall(name, args, id) {
        const tool = this.tools.get(name);
        if (!tool) {
            return this.errorResponse(id, -32602, `Tool not found: ${name}`);
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
        }
        catch (error) {
            return this.errorResponse(id, -32603, `Tool execution failed: ${error.message}`, { stack: error.stack });
        }
    }
    errorResponse(id, code, message, data) {
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
    start(transport = 'stdio', port) {
        if (transport === 'stdio') {
            this.startStdio();
        }
        else {
            this.startSSE(port || 3001);
        }
    }
    startStdio() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });
        rl.on('line', async (line) => {
            try {
                const message = JSON.parse(line);
                const response = await this.handleMessage(message);
                console.log(JSON.stringify(response));
            }
            catch (error) {
                console.error(JSON.stringify({
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32700,
                        message: 'Parse error',
                        data: { error: error.message },
                    },
                }));
            }
        });
        process.stderr.write(`MCP Server '${this.serverName}' started on stdio\n`);
    }
    startSSE(port) {
        const http = require('http');
        const url = require('url');
        const server = http.createServer(async (req, res) => {
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
                res.write('data: {"jsonrpc":"2.0","method":"connected"}\n\n');
                req.on('close', () => {
                    res.end();
                });
            }
            else if (parsedUrl.pathname === '/message' && req.method === 'POST') {
                // Message endpoint
                let body = '';
                req.on('data', (chunk) => {
                    body += chunk.toString();
                });
                req.on('end', async () => {
                    try {
                        const message = JSON.parse(body);
                        const response = await this.handleMessage(message);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(response));
                    }
                    catch (error) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            jsonrpc: '2.0',
                            id: null,
                            error: { code: -32700, message: 'Parse error' },
                        }));
                    }
                });
            }
            else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });
        server.listen(port, () => {
            process.stderr.write(`MCP Server '${this.serverName}' started on http://localhost:${port}\n`);
        });
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
        name: 'get_posts',
        description: 'GET /posts',
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
        name: 'get_posts_by_id',
        description: 'GET /posts/:id',
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
async function callTool(name, args) {
    const baseUrl = 'http://localhost:3000';
    switch (name) {
        case 'get': {
            let url = `${baseUrl}/`;
            if (args.query && Object.keys(args.query).length > 0) {
                const queryString = new URLSearchParams(args.query).toString();
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
            }
            else {
                return await response.text();
            }
        }
        case 'get_users': {
            let url = `${baseUrl}/users`;
            if (args.query && Object.keys(args.query).length > 0) {
                const queryString = new URLSearchParams(args.query).toString();
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
            }
            else {
                return await response.text();
            }
        }
        case 'get_users_by_id': {
            let url = `${baseUrl}/users/${args.id}`;
            if (args.query && Object.keys(args.query).length > 0) {
                const queryString = new URLSearchParams(args.query).toString();
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
            }
            else {
                return await response.text();
            }
        }
        case 'post_users': {
            let url = `${baseUrl}/users`;
            if (args.query && Object.keys(args.query).length > 0) {
                const queryString = new URLSearchParams(args.query).toString();
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
            }
            else {
                return await response.text();
            }
        }
        case 'put_users_by_id': {
            let url = `${baseUrl}/users/${args.id}`;
            if (args.query && Object.keys(args.query).length > 0) {
                const queryString = new URLSearchParams(args.query).toString();
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
            }
            else {
                return await response.text();
            }
        }
        case 'delete_users_by_id': {
            let url = `${baseUrl}/users/${args.id}`;
            if (args.query && Object.keys(args.query).length > 0) {
                const queryString = new URLSearchParams(args.query).toString();
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
            }
            else {
                return await response.text();
            }
        }
        case 'get_posts': {
            let url = `${baseUrl}/posts`;
            if (args.query && Object.keys(args.query).length > 0) {
                const queryString = new URLSearchParams(args.query).toString();
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
            }
            else {
                return await response.text();
            }
        }
        case 'get_posts_by_id': {
            let url = `${baseUrl}/posts/${args.id}`;
            if (args.query && Object.keys(args.query).length > 0) {
                const queryString = new URLSearchParams(args.query).toString();
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
            }
            else {
                return await response.text();
            }
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
// ===== Server Bootstrap =====
const server = new McpServer('express-mcp-server', '1.0.0');
tools.forEach(tool => server.registerTool(tool));
server.start('stdio');
export {};
//# sourceMappingURL=mcp-server.js.map