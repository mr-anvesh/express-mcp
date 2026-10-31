# Basic Concepts

Understanding the core concepts behind express-mcp-server.

## What is MCP?

**MCP (Model Context Protocol)** is a protocol that allows AI assistants like Claude to interact with external tools and services. It defines a standard way for:

- **Listing available tools** - What capabilities are available
- **Calling tools** - How to execute those capabilities
- **Returning results** - How tools send data back

Think of MCP as "REST API for AI assistants" - instead of humans clicking buttons, AI models call tools programmatically.

## What is Express MCP Server?

Express MCP Server is a **code generator** that:

1. Analyzes your Express.js application
2. Extracts all HTTP routes
3. Converts each route into an MCP tool
4. Generates a standalone MCP server file

The generated server acts as a **bridge** between the MCP protocol and your Express API.

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  AI Client  │  MCP    │ Generated    │  HTTP   │   Express    │
│  (Claude)   │────────▶│ MCP Server   │────────▶│   API        │
└─────────────┘         └──────────────┘         └──────────────┘
    JSON-RPC               JSON-RPC to             REST API
    over stdio             HTTP requests           responses
```

## Key Components

### 1. Express Application

Your existing Express.js app with routes:

```typescript
const app = express();

app.get('/users', (req, res) => {
  res.json([{ id: 1, name: 'Alice' }]);
});

app.post('/users', (req, res) => {
  res.json({ id: 2, ...req.body });
});
```

### 2. Route Extraction

The library walks through Express's internal router to find all routes:

```typescript
import { extractRoutes } from 'express-mcp-server';

const routes = extractRoutes(app);
// [
//   { method: 'GET', path: '/users', params: [] },
//   { method: 'POST', path: '/users', params: [] }
// ]
```

### 3. Tool Generation

Each Express route becomes an MCP tool:

| Express Route | MCP Tool |
|---------------|----------|
| `GET /users` | `get_users` |
| `GET /users/:id` | `get_users_by_id` |
| `POST /users` | `post_users` |

Each tool has:
- **Name**: Snake_case identifier (e.g., `get_users_by_id`)
- **Description**: Human-readable (e.g., "GET /users/:id")
- **Input Schema**: JSON Schema for parameters

### 4. Generated MCP Server

A standalone file that:
- Implements the MCP protocol (JSON-RPC 2.0)
- Registers each tool
- Handles tool calls by making HTTP requests to your Express server
- Returns responses in MCP format

## How It Works

### Step-by-Step Flow

1. **You call** `generateMcpServer(app, options)`

2. **Library extracts routes** from Express router stack:
   ```typescript
   app._router.stack // or app.router.stack in Express 5
   ```

3. **Library generates tools** from routes:
   ```typescript
   {
     name: 'get_users_by_id',
     description: 'GET /users/:id',
     inputSchema: {
       type: 'object',
       properties: {
         id: { type: 'string', description: 'Path parameter: id' }
       },
       required: ['id']
     }
   }
   ```

4. **Library writes file** containing:
   - MCP protocol implementation
   - Tool definitions
   - Tool handlers (HTTP request code)
   - Server bootstrap

5. **You run** the generated server:
   ```bash
   node mcp-server.ts
   ```

6. **AI client connects** via stdio or SSE

7. **Client calls tool**:
   ```json
   {
     "jsonrpc": "2.0",
     "method": "tools/call",
     "params": {
       "name": "get_users_by_id",
       "arguments": { "id": "123" }
     },
     "id": 1
   }
   ```

8. **MCP server makes HTTP request**:
   ```javascript
   fetch('http://localhost:3000/users/123')
   ```

9. **Express app responds** with JSON data

10. **MCP server returns** result to client:
    ```json
    {
      "jsonrpc": "2.0",
      "id": 1,
      "result": {
        "content": [{
          "type": "text",
          "text": "{\"id\":\"123\",\"name\":\"Alice\"}"
        }]
      }
    }
    ```

## Mental Model

### Think of it as...

**A translator** between two languages:
- **Language 1**: MCP (JSON-RPC messages like "call tool X with args Y")
- **Language 2**: HTTP (REST requests like "GET /endpoint?param=value")

**An adapter** between two interfaces:
- **Interface 1**: Tool-based (AI thinks in terms of "tools to call")
- **Interface 2**: Endpoint-based (Express works with routes/controllers)

**A wrapper** around your API:
- Your Express API remains unchanged
- The MCP server sits in front as a protocol adapter
- AI clients interact through the MCP layer

### It's NOT...

**A modification to your Express app** - Your app stays the same  
**Runtime middleware** - It's a separate process  
**A replacement for Express** - It complements Express  
**An API gateway** - It's specifically for MCP protocol

## Architecture Patterns

### Pattern 1: Side-by-Side Processes

```
┌──────────────────┐
│  Express Server  │  (Port 3000)
│  Your API        │
└──────────────────┘
         ↑
         │ HTTP requests
         │
┌──────────────────┐
│  MCP Server      │  (stdio or Port 3001)
│  Generated       │
└──────────────────┘
         ↑
         │ JSON-RPC
         │
┌──────────────────┐
│  AI Client       │
│  (Claude, etc.)  │
└──────────────────┘
```

Both servers run simultaneously:
- Express serves your normal HTTP API
- MCP server translates protocol for AI clients

### Pattern 2: Single Process

```typescript
// server.ts
import express from 'express';
import { generateMcpServer } from 'express-mcp-server';

const app = express();

// Define routes
app.get('/users', ...);

// Start Express
app.listen(3000);

// Generate MCP server
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts'
});

// Then run generated server separately
// $ node mcp-server.ts
```

## Code Generation vs Runtime

### Why Code Generation?

**Advantages:**
**Customizable** - You can edit the generated file  
**No dependencies** - Generated file is self-contained  
**Transparent** - You see exactly what code runs  
**Debuggable** - Step through generated code  
**Flexible** - Modify tool names, schemas, behavior

**Trade-offs:**
**Regenerate needed** - Changes to routes require regeneration  
**Two files** - Source app + generated server

### Alternative: Runtime Approach (Not Implemented)

A hypothetical runtime approach would look like:

```typescript
import { createMcpServer } from 'express-mcp-server';

const mcpServer = createMcpServer(app, {
  port: 3001
});

mcpServer.start();
```

This would be **less flexible** but more **automatic**. We chose code generation for maximum control.

## File Organization

### Recommended Structure

```
my-project/
├── src/
│   ├── app.ts              # Your Express app (exported)
│   ├── server.ts           # Starts Express server
│   └── routes/
│       ├── users.ts
│       └── posts.ts
├── scripts/
│   └── generate-mcp.ts     # Runs code generation
├── generated/
│   └── mcp-server.ts       # Generated MCP server
└── package.json
```

### Workflow

1. **Develop**: Work on your Express app normally
2. **Generate**: Run `generate-mcp.ts` when routes change
3. **Deploy**: Run both Express server and MCP server
4. **Customize**: Edit generated file if needed

## Common Questions

**Q: Do I need to regenerate after every route change?**  
A: Yes, run the generator again to pick up new routes.

**Q: Can I edit the generated file?**  
A: Yes! That's a key feature. Customize tool names, schemas, descriptions, etc.

**Q: What if I break the generated file?**  
A: Just regenerate it. The generator creates a fresh file each time.

**Q: Does this replace my Express API?**  
A: No, it sits alongside it. Your API works normally, and the MCP server calls it.

**Q: Can multiple MCP servers call the same Express app?**  
A: Yes, you can generate multiple MCP servers with different configurations.

## Next Steps

Now that you understand the concepts:

- [Quick Start Guide](./quick-start.md) - Build your first MCP server
- [API Reference](./api-reference.md) - Detailed API documentation
- [Tool Schema](./tool-schema.md) - How routes become tools
- [Generated Files](./generated-files.md) - Understanding the output
