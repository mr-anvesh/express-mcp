# express-mcp-server

[![npm version](https://badge.fury.io/js/express-mcp-server.svg)](https://www.npmjs.com/package/express-mcp-server)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

A TypeScript library that automatically generates MCP (Model Context Protocol) servers from Express.js applications. It extracts all routes from your Express app and creates a standalone MCP server file where each endpoint becomes an MCP tool.

## Features

- 🔄 **Automatic Route Extraction**: Walks through your Express router stack to find all registered routes
- 🎯 **Smart Tool Generation**: Converts HTTP endpoints to MCP tools with proper schemas
- 📝 **Customizable Output**: Generates standalone TypeScript/JavaScript files you can edit
- 🔌 **Multiple Transports**: Supports both stdio and SSE (Server-Sent Events) transports
- 🪆 **Nested Router Support**: Handles sub-routers mounted with `app.use()`
- 📦 **Zero Runtime Dependencies**: Generated files are self-contained with embedded MCP protocol implementation

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Using in Your Projects](#using-in-your-projects)
- [API Reference](#api-reference)
- [How It Works](#how-it-works)
- [Integration Patterns](#integration-patterns)
- [Real-World Examples](#real-world-examples)
- [Best Practices](#best-practices)
- [Tips & Tricks](#tips--tricks)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Examples](#examples)
- [Requirements](#requirements)

## Installation

```bash
npm install express-mcp-server
```

Or add it to your `package.json`:

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "express-mcp-server": "^1.0.1"
  }
}
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

### 3. Run both servers

```bash
# Terminal 1: Start your Express server
node server.js

# Terminal 2: Run the MCP server
node mcp-server.js
```

The MCP server will connect to your Express server and expose all endpoints as tools that can be called via the Model Context Protocol.

## Using in Your Projects

### Integration Workflow

**Step 1: Create a generation script**

Create `scripts/generate-mcp.ts` in your project:

```typescript
import { generateMcpServer } from 'express-mcp-server';
import app from '../src/app.js';

async function main() {
  await generateMcpServer(app, {
    expressBaseUrl: process.env.API_URL || 'http://localhost:3000',
    outputPath: './mcp-server.ts',
    typescript: true,
    transport: 'stdio'
  });
  
  console.log('✅ MCP server generated!');
}

main();
```

**Step 2: Add to package.json**

```json
{
  "scripts": {
    "generate:mcp": "tsx scripts/generate-mcp.ts",
    "dev:all": "concurrently \"npm run dev\" \"npm run mcp\"",
    "mcp": "node mcp-server.js"
  }
}
```

**Step 3: Generate and run**

```bash
# Generate MCP server
npm run generate:mcp

# Run both servers together
npm run dev:all
```

### Common Use Cases

#### 1. Existing REST API

```typescript
// Your existing app.ts
const app = express();

app.get('/api/orders', getOrders);
app.post('/api/orders', createOrder);
app.get('/api/customers/:id', getCustomer);

export default app;
```

Generate MCP server:

```typescript
import { generateMcpServer } from 'express-mcp-server';

await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts'
});
```

**Result**: 3 MCP tools (`get_api_orders`, `post_api_orders`, `get_api_customers_by_id`)

#### 2. Environment-Specific Configuration

```typescript
const config = {
  development: {
    expressBaseUrl: 'http://localhost:3000',
    outputPath: './dev/mcp-server.ts',
    transport: 'stdio'
  },
  production: {
    expressBaseUrl: 'https://api.myapp.com',
    outputPath: './dist/mcp-server.js',
    typescript: false,
    transport: 'sse',
    mcpPort: 3001
  }
};

const env = process.env.NODE_ENV || 'development';
await generateMcpServer(app, config[env]);
```

#### 3. With Authentication

After generation, edit `mcp-server.ts` to add authentication:

```typescript
async function callTool(name: string, args: any): Promise<any> {
  const baseUrl = 'http://localhost:3000';
  
  const headers = {
    'Authorization': `Bearer ${process.env.API_TOKEN}`,
    'Content-Type': 'application/json'
  };
  
  switch (name) {
    case 'get_users': {
      const response = await fetch(`${baseUrl}/users`, { headers });
      return await response.json();
    }
    // ... rest of handlers
  }
}
```

### Development Workflow

**Initial setup:**
```bash
npm install express-mcp-server
npm run generate:mcp
npm run dev:all
```

**When you add/modify routes:**
```bash
# 1. Update your Express routes
# 2. Regenerate MCP server
npm run generate:mcp
# 3. Restart MCP server (or use nodemon)
```

## API Reference

### `generateMcpServer(app, options)`

Generates an MCP server file from an Express application.

#### Parameters

- `app: Application` - Express application instance
- `options: GenerateOptions`:
  - `expressBaseUrl: string` - Base URL of your Express server (required)
  - `outputPath: string` - Where to write the generated MCP server file (required)
  - `typescript?: boolean` - Generate TypeScript (`.ts`) or JavaScript (`.js`). Default: `true`
  - `transport?: 'stdio' | 'sse'` - Transport type. Default: `'stdio'`
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

## Integration Patterns

### Pattern 1: Monorepo

```
my-monorepo/
├── packages/
│   ├── api/                 # Express API
│   │   ├── src/
│   │   └── package.json
│   └── mcp/                 # Generated MCP server
│       ├── mcp-server.ts
│       └── package.json
└── scripts/
    └── generate-mcp.ts      # Shared generator
```

### Pattern 2: Same Repo, Different Entry Points

```
my-project/
├── src/
│   ├── app.ts              # Express app
│   ├── server.ts           # Express entry point
│   └── routes/
├── mcp-server.ts           # Generated MCP server
├── package.json
└── scripts/
    └── generate-mcp.ts
```

### Pattern 3: Microservices

```typescript
// Each service generates its own MCP server
await generateMcpServer(userService, {
  expressBaseUrl: 'http://users-service:3000',
  outputPath: './mcp-users-server.ts'
});

await generateMcpServer(orderService, {
  expressBaseUrl: 'http://orders-service:3001',
  outputPath: './mcp-orders-server.ts'
});
```

## Real-World Examples

### E-commerce API

```typescript
// src/app.ts
const app = express();

// Products
app.get('/api/products', listProducts);
app.get('/api/products/:id', getProduct);
app.post('/api/products', createProduct);

// Orders
app.get('/api/orders', listOrders);
app.post('/api/orders', createOrder);

// Cart
app.get('/api/cart', getCart);
app.post('/api/cart/items', addToCart);

export default app;
```

Generate:
```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-ecommerce-server.ts'
});
```

**Result**: 9 MCP tools for managing products, orders, and cart via AI!

### Multi-tenant SaaS

```typescript
const tenants = ['acme', 'globex', 'initech'];

for (const tenant of tenants) {
  await generateMcpServer(app, {
    expressBaseUrl: `https://${tenant}.myapp.com`,
    outputPath: `./mcp-${tenant}-server.ts`
  });
}
```

### Internal Admin Tools

```typescript
import adminRouter from '../src/routes/admin.js';

const app = express();
app.use('/admin', adminRouter);

await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-admin-server.ts',
  transport: 'stdio' // For Claude Desktop
});
```

## Best Practices

1. **Version Control**: Commit the generated `mcp-server.ts` to track changes over time
2. **Regenerate After Route Changes**: Add generation to your CI/CD pipeline
3. **Environment Variables**: Use different base URLs for dev/staging/prod
4. **Customize After Generation**: Edit tool descriptions and schemas for better AI understanding
5. **Documentation**: Keep the generated file alongside your API documentation
6. **Testing**: Test the generated MCP server with real AI clients before deploying
7. **Security**: Add authentication/authorization to the generated server for production use

## Tips & Tricks

### For Claude Desktop Integration

Use stdio transport:
```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  transport: 'stdio'
});
```

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["/path/to/mcp-server.js"]
    }
  }
}
```

### For Web Applications

Use SSE transport with a port:
```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  transport: 'sse',
  mcpPort: 3001
});
```

Connect from browser:
```javascript
fetch('http://localhost:3001/message', {
  method: 'POST',
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1
  })
});
```

### For Testing

Generate test MCP server pointing to test environment:
```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3001', // Test server
  outputPath: './mcp-server-test.ts'
});
```

### For CI/CD

```yaml
# .github/workflows/build.yml
- name: Generate MCP Server
  run: npm run generate:mcp

- name: Commit generated files
  run: |
    git add mcp-server.ts
    git commit -m "Update MCP server" || true
```

## Troubleshooting

### Routes Not Appearing?

Make sure routes are defined **before** calling `generateMcpServer()`:

```typescript
// ✅ Correct
app.get('/users', handler);
await generateMcpServer(app, options);

// ❌ Wrong
await generateMcpServer(app, options);
app.get('/users', handler); // Too late!
```

### MCP Server Can't Reach Express?

Check that:
1. Express server is running: `curl http://localhost:3000`
2. Base URL matches: `expressBaseUrl: 'http://localhost:3000'`
3. Firewall allows connections

### ES Module Errors?

Ensure `package.json` has:
```json
{
  "type": "module"
}
```

For more troubleshooting, see the [Troubleshooting Guide](./docs/troubleshooting.md).

## Documentation

- 📖 [Complete Documentation](./docs/README.md) - Full documentation index
- 🚀 [Quick Start Guide](./docs/quick-start.md) - Get up and running in 5 minutes
- 📚 [API Reference](./docs/api-reference.md) - Complete API documentation
- ⚙️ [Configuration Guide](./docs/configuration.md) - All configuration options
- 🔧 [Tool Schema Reference](./docs/tool-schema.md) - How routes become tools
- 🎓 [Basic Concepts](./docs/concepts.md) - Understanding the architecture
- 💡 [FAQ](./docs/faq.md) - Frequently asked questions
- 🔍 [MCP Protocol](./docs/mcp-protocol.md) - Understanding the protocol

## Examples

See the [examples/simple-api](examples/simple-api) directory for a complete working example with:
- Express app with multiple routes
- Nested routers
- Generation script
- Generated MCP server

## Generated MCP Server Usage

The generated MCP server supports standard MCP JSON-RPC methods:

### JSON-RPC Methods

- `initialize` - Handshake and capability negotiation
- `tools/list` - List all available tools
- `tools/call` - Execute a tool (make HTTP request to Express endpoint)

### Example Messages

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

- ✏️ Modify tool names and descriptions
- 🔒 Add authentication headers
- ✅ Adjust input schemas (add validation, change types)
- ⚠️ Add custom error handling
- 🔄 Transform request/response data
- 🎨 Modify the HTTP request logic

## Requirements

- **Node.js** >= 18.0.0
- **TypeScript** >= 5.0.0 (for TypeScript projects)
- **Express.js** >= 4.0.0

## Complete Package.json Example

```json
{
  "name": "my-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx src/server.ts",
    "build": "tsc",
    "generate:mcp": "tsx scripts/generate-mcp.ts",
    "mcp": "node mcp-server.js",
    "dev:all": "concurrently \"npm run dev\" \"npm run mcp\"",
    "postbuild": "npm run generate:mcp"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "express-mcp-server": "^1.0.1",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "concurrently": "^8.2.2"
  }
}
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

ISC - See [LICENSE](./LICENSE) file for details.

## Author

d0minator (Anvesh) - mr.anveshmishra@gmail.com

## Repository

https://github.com/mr-anvesh/express-mcp

---

**Made with ❤️ for the Express and MCP communities**
