# Quick Start Guide

Get your first MCP server up and running in 5 minutes!

## Step 1: Create an Express App

Create a file `app.ts` with a simple Express application:

```typescript
import express from 'express';

const app = express();

// Middleware
app.use(express.json());

// Routes
app.get('/users', (req, res) => {
  res.json([
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
  ]);
});

app.get('/users/:id', (req, res) => {
  res.json({
    id: req.params.id,
    name: 'Alice',
    email: 'alice@example.com'
  });
});

app.post('/users', (req, res) => {
  res.status(201).json({
    id: 3,
    name: req.body.name,
    email: req.body.email
  });
});

export default app;
```

## Step 2: Generate the MCP Server

Create a `generate-mcp.ts` script:

```typescript
import app from './app.js';
import { generateMcpServer } from 'express-mcp-server';

await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  typescript: true,
  transport: 'stdio'
});

console.log('MCP server generated!');
```

Run the generator:

```bash
npx tsx generate-mcp.ts
```

This creates a `mcp-server.ts` file with your MCP server implementation.

## Step 3: Start Your Express Server

Create a `server.ts` file:

```typescript
import app from './app.js';

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});
```

Start the server:

```bash
npx tsx server.ts
```

## Step 4: Run Your MCP Server

In a separate terminal, run the generated MCP server:

```bash
npx tsx mcp-server.ts
```

Your MCP server is now running and ready to accept JSON-RPC messages!

## Step 5: Test the MCP Server

Send a JSON-RPC message to test (in another terminal):

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' | npx tsx mcp-server.ts
```

You should see a response like:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": {
      "tools": {}
    },
    "ttlMs": 60000,
    "cacheScope": "public"
  }
}
```

List available tools:

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' | npx tsx mcp-server.ts
```

Call a tool:

```bash
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_users","arguments":{}},"id":3}' | npx tsx mcp-server.ts
```

## What Just Happened?

1. **Route Extraction**: The library scanned your Express app and found 3 routes
2. **Tool Generation**: Each route became an MCP tool:
   - `GET /users` → `get_users`
   - `GET /users/:id` → `get_users_by_id`
   - `POST /users` → `post_users`
3. **Server Creation**: A standalone MCP server file was generated
4. **Protocol Handling**: The server speaks JSON-RPC 2.0 with MCP methods

## Generated Tools

Your MCP server now has these tools:

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `get_users` | GET /users | `query` (optional) |
| `get_users_by_id` | GET /users/:id | `id` (required) |
| `post_users` | POST /users | `body` (object) |

## Next Steps

- Learn about [Configuration Options](./configuration.md)
- Understand [Tool Schemas](./tool-schema.md)
- Explore [Nested Routers](./nested-routers.md)
- Read the [API Reference](./api-reference.md)

## Full Example

Here's a complete working example in one file:

```typescript
import express from 'express';
import { generateMcpServer } from 'express-mcp-server';

// 1. Create Express app
const app = express();
app.use(express.json());

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

app.get('/greet/:name', (req, res) => {
  res.json({ message: `Hello, ${req.params.name}!` });
});

// 2. Generate MCP server
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  typescript: true,
  transport: 'stdio'
});

// 3. Start Express server
app.listen(3000, () => {
  console.log('Express server running on port 3000');
  console.log('Run "npx tsx mcp-server.ts" to start MCP server');
});
```

Save as `example.ts` and run:

```bash
npx tsx example.ts
```

That's it! You now have a working MCP server.
