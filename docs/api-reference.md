# API Reference

Complete reference for all exported functions and types.

## Functions

### generateMcpServer()

Generates an MCP server file from an Express application.

```typescript
function generateMcpServer(
  app: Application,
  options: GenerateOptions
): Promise<void>
```

#### Parameters

**`app: Application`**

The Express application instance to extract routes from.

```typescript
import express from 'express';
const app = express();
```

**`options: GenerateOptions`**

Configuration object with the following properties:

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `expressBaseUrl` | `string` | Yes | - | Base URL where your Express server runs |
| `outputPath` | `string` | Yes | - | Path where the MCP server file will be written |
| `typescript` | `boolean` | No | `true` | Generate TypeScript (`.ts`) or JavaScript (`.js`) |
| `transport` | `'stdio' \| 'sse'` | No | `'stdio'` | Transport protocol for the MCP server |
| `mcpPort` | `number` | No | `undefined` | Port for SSE transport (required if `transport: 'sse'`) |

#### Returns

`Promise<void>` - Resolves when the file has been written successfully.

#### Throws

- `Error` - If no routes are found in the Express application
- `Error` - If the output file cannot be written

#### Examples

**Basic usage:**

```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts'
});
```

**With SSE transport:**

```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  transport: 'sse',
  mcpPort: 3001
});
```

**JavaScript output:**

```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.js',
  typescript: false
});
```

---

### extractRoutes()

Extracts all routes from an Express application without generating a server.

```typescript
function extractRoutes(app: Application): ExpressRoute[]
```

#### Parameters

**`app: Application`**

The Express application instance to extract routes from.

#### Returns

`ExpressRoute[]` - Array of extracted routes.

#### Example

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

---

## Types

### GenerateOptions

Configuration options for generating an MCP server.

```typescript
interface GenerateOptions {
  expressBaseUrl: string;
  outputPath: string;
  typescript?: boolean;
  transport?: 'stdio' | 'sse';
  mcpPort?: number;
}
```

#### Properties

**`expressBaseUrl: string`** (required)

The base URL where your Express server is running. This is used by the generated MCP server to make HTTP requests.

```typescript
// Local development
expressBaseUrl: 'http://localhost:3000'

// Production
expressBaseUrl: 'https://api.example.com'

// Custom port
expressBaseUrl: 'http://localhost:8080'
```

**`outputPath: string`** (required)

File path where the generated MCP server will be written. Can be absolute or relative.

```typescript
// Relative path
outputPath: './mcp-server.ts'

// Absolute path
outputPath: '/Users/user/project/mcp-server.ts'

// Different directory
outputPath: './servers/my-api-mcp.ts'
```

**`typescript?: boolean`** (optional, default: `true`)

Whether to generate TypeScript or JavaScript code.

```typescript
// TypeScript output (default)
typescript: true  // generates .ts file

// JavaScript output
typescript: false  // generates .js file
```

**`transport?: 'stdio' | 'sse'`** (optional, default: `'stdio'`)

The transport protocol for the MCP server.

- `'stdio'`: Standard input/output (for CLI tools, Claude Desktop)
- `'sse'`: Server-Sent Events over HTTP (for web clients)

```typescript
// stdio transport (default)
transport: 'stdio'

// SSE transport
transport: 'sse',
mcpPort: 3001
```

**`mcpPort?: number`** (optional)

Port number for the MCP server when using SSE transport. Required if `transport: 'sse'`.

```typescript
transport: 'sse',
mcpPort: 3001  // MCP server listens on http://localhost:3001
```

---

### ExpressRoute

Represents an extracted Express route.

```typescript
interface ExpressRoute {
  method: string;
  path: string;
  params: string[];
}
```

#### Properties

**`method: string`**

HTTP method in uppercase (GET, POST, PUT, DELETE, PATCH, etc.)

**`path: string`**

Route path including any mount prefixes from nested routers.

**`params: string[]`**

Array of path parameter names extracted from the route.

#### Example

```typescript
{
  method: 'GET',
  path: '/api/users/:id',
  params: ['id']
}
```

---

### McpTool

Represents an MCP tool definition.

```typescript
interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
```

#### Properties

**`name: string`**

Tool name in snake_case format (e.g., `get_users_by_id`)

**`description: string`**

Human-readable description of what the tool does

**`inputSchema: object`**

JSON Schema defining the tool's input parameters

---

### McpRequest

JSON-RPC 2.0 request message.

```typescript
interface McpRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: number | string;
}
```

#### Example

```typescript
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

---

### McpResponse

JSON-RPC 2.0 response message.

```typescript
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
```

#### Success Example

```typescript
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[{\"id\":1,\"name\":\"Alice\"}]"
      }
    ]
  }
}
```

#### Error Example

```typescript
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Tool not found: invalid_tool"
  }
}
```

---

### ToolContent

Content returned by tool execution.

```typescript
interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}
```

---

## Usage Examples

### Complete Workflow

```typescript
import express from 'express';
import { generateMcpServer, extractRoutes } from 'express-mcp-server';

// 1. Create Express app
const app = express();
app.get('/users', (req, res) => res.json([]));

// 2. Debug: Extract routes to see what will be generated
const routes = extractRoutes(app);
console.log('Found routes:', routes);

// 3. Generate MCP server
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  typescript: true,
  transport: 'stdio'
});

console.log('MCP server generated successfully!');
```

### Error Handling

```typescript
try {
  await generateMcpServer(app, {
    expressBaseUrl: 'http://localhost:3000',
    outputPath: './mcp-server.ts'
  });
} catch (error) {
  if (error.message.includes('No routes found')) {
    console.error('Your Express app has no routes defined');
  } else {
    console.error('Failed to generate MCP server:', error);
  }
}
```

---

## See Also

- [Configuration Guide](./configuration.md)
- [Tool Schema Reference](./tool-schema.md)
- [Generated Files Documentation](./generated-files.md)
