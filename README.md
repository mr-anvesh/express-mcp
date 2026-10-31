# express-mcp-server

A TypeScript library that automatically generates MCP (Model Context Protocol) servers from Express.js applications. It extracts all routes from your Express app and creates a standalone MCP server file where each endpoint becomes an MCP tool.

## Features

- 🔄 **Automatic Route Extraction**: Walks through your Express router stack to find all registered routes
- 🎯 **Smart Tool Generation**: Converts HTTP endpoints to MCP tools with proper schemas
- 📝 **Customizable Output**: Generates standalone TypeScript/JavaScript files you can edit
- 🔌 **Multiple Transports**: Supports both stdio and SSE (Server-Sent Events) transports
- 🪆 **Nested Router Support**: Handles sub-routers mounted with `app.use()`
- 📦 **Zero Runtime Dependencies**: Generated files are self-contained with embedded MCP protocol implementation

## Installation

```bash
npm install express-mcp-server
```

## Quick Start

### 1. Create your Express app

```typescript
import express from 'express';

const app = express();

app.use(express.json());

app.get('/users', (req, res) => {
  res.json([{ id: 1, name: 'Alice' }]);
});

app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'Alice' });
});

app.post('/users', (req, res) => {
  res.status(201).json({ id: 2, ...req.body });
});

export default app;
```

### 2. Generate the MCP server

```typescript
import { generateMcpServer } from 'express-mcp-server';
import app from './app.js';

await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  typescript: true,
  transport: 'stdio'
});
```

### 3. Use the generated MCP server

First, start your Express server:

```bash
node app.js
```

Then run the generated MCP server:

```bash
node mcp-server.ts
```

The MCP server will connect to your Express server and expose all endpoints as tools that can be called via the Model Context Protocol.

## API Reference

### `generateMcpServer(app, options)`

Generates an MCP server file from an Express application.

#### Parameters

- `app: Application` - Express application instance
- `options: GenerateOptions` - Configuration options:
  - `expressBaseUrl: string` - Base URL of your Express server (e.g., `'http://localhost:3000'`)
  - `outputPath: string` - Where to write the generated MCP server file
  - `typescript?: boolean` - Generate TypeScript (`.ts`) or JavaScript (`.js`). Default: `true`
  - `transport?: 'stdio' | 'sse'` - Transport type for MCP server. Default: `'stdio'`
  - `mcpPort?: number` - Port for MCP server when using SSE transport

#### Example

```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  typescript: true,
  transport: 'stdio'
});
```

### `extractRoutes(app)`

Extracts all routes from an Express application (useful for debugging).

```typescript
import { extractRoutes } from 'express-mcp-server';

const routes = extractRoutes(app);
console.log(routes);
// [
//   { method: 'GET', path: '/users', params: [] },
//   { method: 'GET', path: '/users/:id', params: ['id'] },
//   { method: 'POST', path: '/users', params: [] }
// ]
```

## How It Works

### Route Extraction

The library walks through your Express router stack recursively to extract:
- HTTP methods (GET, POST, PUT, DELETE, etc.)
- Route paths (including nested routers)
- Path parameters (`:id`, `:slug`, etc.)

### Tool Generation

Each Express route becomes an MCP tool:

| Express Route | MCP Tool Name | Parameters |
|--------------|---------------|------------|
| `GET /users` | `get_users` | `query` (optional) |
| `GET /users/:id` | `get_users_by_id` | `id` (required), `query` (optional) |
| `POST /users` | `post_users` | `body` (object), `query` (optional) |
| `GET /api/posts/:id` | `get_api_posts_by_id` | `id` (required), `query` (optional) |

### Generated File Structure

The generated MCP server file contains:

1. **MCP Protocol Implementation**: JSON-RPC 2.0 server with MCP-specific methods
2. **Tool Definitions**: Each Express endpoint as an MCP tool with JSON Schema
3. **Tool Handlers**: Functions that make HTTP requests to your Express server
4. **Server Bootstrap**: Initialization code to start the MCP server

## Examples

See the [examples/simple-api](examples/simple-api) directory for a complete working example.

## Generated MCP Server Usage

The generated MCP server can be used with any MCP client (like Claude Desktop). It supports:

### JSON-RPC Methods

- `initialize` - Handshake and capability negotiation
- `tools/list` - List all available tools
- `tools/call` - Execute a tool (make HTTP request to Express endpoint)

### Example JSON-RPC Messages

**Initialize:**
```json
{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}
```

**List tools:**
```json
{"jsonrpc":"2.0","method":"tools/list","id":2}
```

**Call a tool:**
```json
{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"get_users_by_id",
    "arguments":{"id":"123"}
  },
  "id":3
}
```

## Customization

The generated MCP server file is fully editable. You can:

- Modify tool names and descriptions
- Adjust input schemas (add validation, change types)
- Add custom error handling
- Modify the HTTP request logic
- Add authentication headers
- Transform request/response data

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (for TypeScript projects)
- Express.js >= 4.0

## License

ISC

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Author

d0minator (Anvesh)

## Repository

https://github.com/mr-anvesh/express-mcp
