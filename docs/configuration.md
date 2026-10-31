# Configuration Guide

Detailed explanation of all configuration options for express-mcp-server.

## Overview

The `generateMcpServer()` function accepts a configuration object with the following structure:

```typescript
interface GenerateOptions {
  expressBaseUrl: string;      // Required
  outputPath: string;          // Required
  typescript?: boolean;        // Optional, default: true
  transport?: 'stdio' | 'sse'; // Optional, default: 'stdio'
  mcpPort?: number;            // Optional, required for SSE
}
```

## Required Options

### expressBaseUrl

**Type**: `string`  
**Required**: ✅ Yes  
**Default**: None

The base URL where your Express server is running. The generated MCP server will make HTTP requests to this URL.

#### Examples

**Local development:**
```typescript
{
  expressBaseUrl: 'http://localhost:3000'
}
```

**Production:**
```typescript
{
  expressBaseUrl: 'https://api.example.com'
}
```

**Custom port:**
```typescript
{
  expressBaseUrl: 'http://localhost:8080'
}
```

**With path prefix:**
```typescript
{
  expressBaseUrl: 'https://api.example.com/v1'
}
```

#### Best Practices

✅ **DO:**
- Use `http://localhost` for local development
- Include the protocol (`http://` or `https://`)
- Use environment variables for different environments

❌ **DON'T:**
- Include a trailing slash: `http://localhost:3000/` ❌
- Forget the protocol: `localhost:3000` ❌
- Include route paths: `http://localhost:3000/api` ❌

#### Environment-Based Configuration

```typescript
const expressBaseUrl = 
  process.env.NODE_ENV === 'production'
    ? 'https://api.example.com'
    : 'http://localhost:3000';

await generateMcpServer(app, {
  expressBaseUrl,
  outputPath: './mcp-server.ts'
});
```

---

### outputPath

**Type**: `string`  
**Required**: ✅ Yes  
**Default**: None

File path where the generated MCP server will be written. Can be absolute or relative.

#### Examples

**Relative path (same directory):**
```typescript
{
  outputPath: './mcp-server.ts'
}
```

**Relative path (subdirectory):**
```typescript
{
  outputPath: './servers/api-mcp.ts'
}
```

**Absolute path:**
```typescript
{
  outputPath: '/Users/user/project/mcp-server.ts'
}
```

**JavaScript output:**
```typescript
{
  outputPath: './mcp-server.js',
  typescript: false
}
```

#### Best Practices

✅ **DO:**
- Use descriptive names: `user-api-mcp.ts`
- Keep generated files separate from source code
- Use `.ts` extension for TypeScript, `.js` for JavaScript

❌ **DON'T:**
- Overwrite source files
- Use special characters in filenames
- Put generated files in `node_modules`

#### Directory Structure Examples

```
project/
├── src/
│   ├── app.ts           # Your Express app
│   └── server.ts        # Express server
├── generated/
│   └── mcp-server.ts    # Generated MCP server
└── generate-mcp.ts      # Generation script
```

```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './generated/mcp-server.ts'
});
```

---

## Optional Options

### typescript

**Type**: `boolean`  
**Required**: ❌ No  
**Default**: `true`

Whether to generate TypeScript or JavaScript code.

#### TypeScript Output (Default)

```typescript
{
  outputPath: './mcp-server.ts',
  typescript: true  // or omit (default)
}
```

Generates:
- `.ts` file with type annotations
- Can be run with `tsx` or compiled with `tsc`
- Better IDE support and type safety

#### JavaScript Output

```typescript
{
  outputPath: './mcp-server.js',
  typescript: false
}
```

Generates:
- `.js` file without type annotations
- Can be run directly with Node.js
- No TypeScript compilation needed

#### When to Use Each

**Use TypeScript when:**
- Your project uses TypeScript
- You want type safety in the generated code
- You'll customize the generated server with TypeScript features

**Use JavaScript when:**
- Your project is pure JavaScript
- You want to avoid TypeScript compilation
- You need to run the server in environments without TypeScript support

#### Example Comparison

**TypeScript output:**
```typescript
async function callTool(name: string, args: any): Promise<any> {
  const baseUrl = 'http://localhost:3000';
  // ...
}
```

**JavaScript output:**
```javascript
async function callTool(name, args) {
  const baseUrl = 'http://localhost:3000';
  // ...
}
```

---

### transport

**Type**: `'stdio' | 'sse'`  
**Required**: ❌ No  
**Default**: `'stdio'`

The transport protocol for the MCP server.

#### stdio Transport (Default)

```typescript
{
  transport: 'stdio'  // or omit (default)
}
```

**Characteristics:**
- Reads JSON-RPC messages from stdin
- Writes responses to stdout
- Ideal for CLI tools and desktop applications
- Used by Claude Desktop and similar clients

**Use cases:**
- Claude Desktop integration
- Command-line MCP clients
- Pipe-based communication

**Running the server:**
```bash
# Read from stdin, write to stdout
echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | node mcp-server.js

# Interactive mode
node mcp-server.js
```

#### SSE Transport

```typescript
{
  transport: 'sse',
  mcpPort: 3001
}
```

**Characteristics:**
- HTTP server with Server-Sent Events
- Listens on the specified port
- Supports CORS for web clients
- Two endpoints: `/sse` (SSE) and `/message` (POST)

**Use cases:**
- Web-based MCP clients
- Browser extensions
- HTTP-based integrations

**Running the server:**
```bash
node mcp-server.js
# MCP Server 'express-mcp-server' started on http://localhost:3001
```

**Making requests:**
```bash
# Initialize
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'

# List tools
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

#### Comparison Table

| Feature | stdio | SSE |
|---------|-------|-----|
| Communication | Standard I/O | HTTP |
| Port required | ❌ No | ✅ Yes |
| Web browser support | ❌ No | ✅ Yes |
| Claude Desktop | ✅ Yes | ❌ No |
| CORS support | N/A | ✅ Yes |
| Best for | Desktop apps | Web apps |

---

### mcpPort

**Type**: `number`  
**Required**: ✅ Yes (if `transport: 'sse'`)  
**Default**: None

Port number for the MCP server when using SSE transport.

#### Examples

```typescript
{
  transport: 'sse',
  mcpPort: 3001
}
```

**Custom port:**
```typescript
{
  transport: 'sse',
  mcpPort: 8080
}
```

**Using environment variable:**
```typescript
{
  transport: 'sse',
  mcpPort: parseInt(process.env.MCP_PORT || '3001')
}
```

#### Port Selection Guidelines

✅ **Good choices:**
- `3001` - Common choice (Express on 3000, MCP on 3001)
- `4000+` - Avoid conflicts with common services
- `8080` - Traditional HTTP alternative port

❌ **Avoid:**
- `80` - Requires root privileges
- `443` - Requires root privileges
- `3000` - Often used by Express
- `5000` - Often used by other frameworks

#### Error Handling

```typescript
const mcpPort = 3001;

try {
  await generateMcpServer(app, {
    expressBaseUrl: 'http://localhost:3000',
    outputPath: './mcp-server.ts',
    transport: 'sse',
    mcpPort
  });
} catch (error) {
  console.error(`Failed to generate server on port ${mcpPort}:`, error);
}
```

---

## Complete Configuration Examples

### Minimal Configuration

```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts'
});
```

### Development Configuration

```typescript
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './dev/mcp-server.ts',
  typescript: true,
  transport: 'stdio'
});
```

### Production Configuration

```typescript
await generateMcpServer(app, {
  expressBaseUrl: process.env.API_URL || 'https://api.example.com',
  outputPath: './dist/mcp-server.js',
  typescript: false,
  transport: 'sse',
  mcpPort: parseInt(process.env.MCP_PORT || '3001')
});
```

### Multi-Environment Configuration

```typescript
const config = {
  development: {
    expressBaseUrl: 'http://localhost:3000',
    outputPath: './dev/mcp-server.ts',
    typescript: true,
    transport: 'stdio' as const
  },
  staging: {
    expressBaseUrl: 'https://staging-api.example.com',
    outputPath: './dist/mcp-server.js',
    typescript: false,
    transport: 'sse' as const,
    mcpPort: 3001
  },
  production: {
    expressBaseUrl: 'https://api.example.com',
    outputPath: './dist/mcp-server.js',
    typescript: false,
    transport: 'sse' as const,
    mcpPort: 3001
  }
};

const env = process.env.NODE_ENV || 'development';
await generateMcpServer(app, config[env]);
```

---

## Environment Variables

### Recommended Pattern

```typescript
import * as dotenv from 'dotenv';
dotenv.config();

await generateMcpServer(app, {
  expressBaseUrl: process.env.EXPRESS_BASE_URL!,
  outputPath: process.env.MCP_OUTPUT_PATH || './mcp-server.ts',
  typescript: process.env.MCP_TYPESCRIPT === 'true',
  transport: (process.env.MCP_TRANSPORT as 'stdio' | 'sse') || 'stdio',
  mcpPort: parseInt(process.env.MCP_PORT || '3001')
});
```

### .env File Example

```bash
# .env
EXPRESS_BASE_URL=http://localhost:3000
MCP_OUTPUT_PATH=./generated/mcp-server.ts
MCP_TYPESCRIPT=true
MCP_TRANSPORT=stdio
MCP_PORT=3001
```

---

## Validation

The library performs basic validation:

```typescript
// ❌ Missing required fields
await generateMcpServer(app, {
  // Error: expressBaseUrl is required
  outputPath: './mcp-server.ts'
});

// ❌ Invalid transport
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  transport: 'invalid' // Error: must be 'stdio' or 'sse'
});

// ❌ SSE without port
await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './mcp-server.ts',
  transport: 'sse'
  // Error: mcpPort required for SSE transport
});
```

---

## Next Steps

- Learn about [Generated Files](./generated-files.md)
- Understand [Tool Schemas](./tool-schema.md)
- Explore [Advanced Customization](./customization.md)
