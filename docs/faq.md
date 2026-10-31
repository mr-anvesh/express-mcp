# Frequently Asked Questions

Common questions about express-mcp-server.

## General Questions

### What is MCP?

**MCP (Model Context Protocol)** is a protocol that allows AI assistants like Claude to interact with external tools and services. It's like an API but specifically designed for AI agents.

Think of it as "REST for AI" - instead of humans using your API through a UI, AI models call tools programmatically via MCP.

### Why use express-mcp-server?

**Quick AI integration**: Convert your existing Express API to MCP without rewriting anything.

**No learning curve**: If you know Express, you already understand this library.

**Customizable**: Generated files can be edited to fine-tune tool behavior.

**Self-hosted**: You control the MCP server, no third-party dependencies.

### Does this modify my Express application?

**No!** Your Express app remains completely unchanged. The MCP server is a separate process that makes HTTP requests to your Express API.

```
Your Express App (unchanged)
      ↑
      │ HTTP requests
      │
Generated MCP Server (new)
      ↑
      │ JSON-RPC
      │
AI Client
```

### Can I use this with Express 4 and 5?

**Yes!** The library supports both Express 4 (`app._router`) and Express 5 (`app.router`).

## Route Extraction

### Which routes are extracted?

All routes defined via:
- `app.get()`, `app.post()`, `app.put()`, `app.delete()`, `app.patch()`
- Routers mounted with `app.use(path, router)`
- Nested routers (recursively)

### What about middleware?

**Middleware is not extracted** as it's not a route. Only actual routes (with HTTP methods) become tools.

```typescript
// ❌ Not extracted (middleware)
app.use(express.json());
app.use('/uploads', express.static('public'));

// ✅ Extracted (routes)
app.get('/users', ...);
app.post('/users', ...);
```

### What about route parameters with regex?

**Basic parameter extraction only.** The library extracts standard `:param` parameters:

```typescript
// ✅ Supported
app.get('/users/:id', ...)

// ⚠️ Extracted as 'id', regex ignored
app.get('/users/:id(\\d+)', ...)

// ❌ Not supported (custom regex)
app.get(/^\/users\/(\d+)$/, ...)
```

For complex patterns, customize the generated file manually.

### Do wildcards work?

**Wildcards are extracted as-is:**

```typescript
app.get('/files/*', ...)
// Becomes: get_files_*
```

You may want to rename this manually in the generated file.

## Code Generation

### Do I need to regenerate after every change?

**Only after route changes.** If you:

- Add/remove/modify routes → **Regenerate**
- Change route handler logic → **No regeneration needed**
- Update middleware → **No regeneration needed**

The MCP server makes HTTP requests to your Express app, so most code changes don't require regeneration.

### Can I edit the generated file?

**Yes!** That's a key feature. You can:

- Rename tools
- Improve descriptions
- Add detailed JSON schemas
- Modify request/response handling
- Add authentication
- Transform data

Just be aware that regenerating will overwrite your changes.

### How do I preserve customizations?

**Option 1: Version control**
```bash
git add mcp-server.ts
git commit -m "Custom tool descriptions"
```

Before regenerating, commit your changes. After regenerating, you can merge manually.

**Option 2: Don't regenerate**

After initial generation, maintain the file manually.

**Option 3: Wrapper approach**

Keep generated file separate, import and wrap it:
```typescript
import { tools } from './generated-mcp.js';

// Add your customizations
const customTools = tools.map(tool => ({
  ...tool,
  description: myCustomDescriptions[tool.name] || tool.description
}));
```

### Can I generate multiple MCP servers?

**Yes!** Generate different servers for different purposes:

```typescript
// Public API
await generateMcpServer(publicApp, {
  expressBaseUrl: 'https://api.example.com',
  outputPath: './mcp-public.ts'
});

// Internal API
await generateMcpServer(internalApp, {
  expressBaseUrl: 'http://internal.local',
  outputPath: './mcp-internal.ts'
});
```

## Usage

### How do I run the generated server?

**stdio transport (default):**
```bash
# TypeScript
npx tsx mcp-server.ts

# JavaScript (after compilation)
node mcp-server.js
```

**SSE transport:**
```bash
node mcp-server.js
# Server starts on http://localhost:3001
```

### Can I use this in production?

**Yes**, but consider:

1. **Security**: Add authentication to your MCP server
2. **Rate limiting**: Protect your Express API from abuse
3. **Monitoring**: Log tool calls and track usage
4. **Error handling**: Improve error messages in generated file
5. **HTTPS**: Use HTTPS for `expressBaseUrl` in production

### Do I need both servers running?

**Yes!** You need:

1. **Express server**: Serves your HTTP API
2. **MCP server**: Translates MCP protocol to HTTP requests

```bash
# Terminal 1: Express
node server.js

# Terminal 2: MCP
node mcp-server.js
```

Or use a process manager like PM2:
```bash
pm2 start server.js
pm2 start mcp-server.js
```

### What clients can connect?

**stdio transport:**
- Claude Desktop
- Command-line MCP clients
- Any tool that can pipe JSON-RPC over stdin/stdout

**SSE transport:**
- Web applications
- Browser extensions
- HTTP-based MCP clients
- Custom integrations

## Technical Questions

### What's in the generated file?

1. **MCP Protocol Implementation**: JSON-RPC 2.0 handler
2. **Tool Definitions**: Array of MCP tools
3. **Tool Handlers**: Functions that make HTTP requests
4. **Server Bootstrap**: Initialization code

See [Generated Files](./generated-files.md) for details.

### Does it have runtime dependencies?

**Generated files: No runtime dependencies!**

They use only Node.js built-ins:
- `readline` (for stdio)
- `http` (for SSE)
- `fetch` (for HTTP requests to Express)

**The library itself**: Depends on `express` (peer dependency) for types only.

### How does it handle authentication?

**By default: None.** The generated server makes unauthenticated HTTP requests.

**To add auth**, edit the generated file:

```typescript
// Add auth header to all requests
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${process.env.API_TOKEN}`
  }
});
```

See [Authentication Guide](./authentication.md) for more.

### What about rate limiting?

**Not built-in.** Options:

1. **Express-level**: Add rate limiting middleware to Express
2. **MCP-level**: Edit generated file to track/limit calls
3. **Infrastructure**: Use API gateway/load balancer

### Can it handle file uploads?

**Not directly.** File uploads require special handling:

1. **Option 1**: Base64 encode files in tool arguments
```typescript
{
  "name": "upload_file",
  "arguments": {
    "body": {
      "filename": "image.png",
      "content": "iVBORw0KGgoAAAANS..." // Base64
    }
  }
}
```

2. **Option 2**: Two-step process (get upload URL, then upload)

3. **Option 3**: Customize generated handler to use multipart form data

### Does it support websockets?

**No.** WebSocket endpoints are not HTTP routes, so they're not extracted.

For real-time features, you'd need to:
1. Expose them as polling endpoints
2. Build a custom MCP server (not generated)

### What about GraphQL?

**Not supported.** GraphQL uses a single endpoint with complex queries, which doesn't map well to the MCP tool model.

For GraphQL:
- **Option 1**: Create specific REST endpoints for common queries
- **Option 2**: Write a custom MCP server manually

## Performance

### Is it fast?

**Speed factors:**

1. **Route extraction**: Fast (milliseconds)
2. **File generation**: Fast (milliseconds)
3. **Runtime**: Two network hops:
   - AI → MCP server (local or fast)
   - MCP server → Express (fast if same machine)

**Typical latency**: MCP server adds <10ms overhead.

### Can it handle high load?

The MCP server itself is lightweight. Bottleneck will likely be your Express API.

**Scaling tips:**

1. **Scale Express**: Use clustering, load balancers
2. **Cache**: Add caching in MCP server or Express
3. **Connection pooling**: Reuse HTTP connections
4. **Multiple MCP servers**: Run multiple instances with a load balancer

### How many routes can it handle?

**Tested with 100+ routes** successfully. The limiting factor is:

1. **Generation time**: Linear with route count (still fast)
2. **File size**: Larger files take longer to compile
3. **Runtime**: No performance impact from route count

## Errors and Debugging

### How do I debug tool calls?

**Add logging to generated file:**

```typescript
async function callTool(name: string, args: any): Promise<any> {
  console.error(`[MCP] Calling tool: ${name}`);
  console.error(`[MCP] Arguments:`, JSON.stringify(args, null, 2));
  
  // ... existing code ...
  
  console.error(`[MCP] Result:`, JSON.stringify(result, null, 2));
  return result;
}
```

Run and check stderr:
```bash
node mcp-server.js 2>debug.log
```

### Why is my tool not found?

**Check:**

1. **Tool exists:**
```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node mcp-server.js | jq '.result.tools[].name'
```

2. **Name is correct:**
Tool names are snake_case: `get_users_by_id` not `getUserById`

3. **Regenerated after adding route:**
Run generator again if you added new routes.

### What does "No routes found" mean?

Your Express app has no routes defined when you call `generateMcpServer()`.

**Fix:**

Define routes before generating:
```typescript
// ❌ Wrong
await generateMcpServer(app, options);
app.get('/users', ...);

// ✅ Correct
app.get('/users', ...);
await generateMcpServer(app, options);
```

## Comparison

### vs Writing MCP server manually?

**Manual**:
- ✅ Full control
- ✅ Optimized for your needs
- ❌ Time-consuming
- ❌ Requires MCP protocol knowledge

**express-mcp-server**:
- ✅ Instant generation
- ✅ No MCP knowledge needed
- ✅ Can still customize after
- ⚠️ Generic schemas (customize after)

### vs Using @modelcontextprotocol/sdk?

**@modelcontextprotocol/sdk**:
- Official MCP SDK
- Requires manual tool definitions
- More flexible for non-HTTP tools

**express-mcp-server**:
- Auto-generates from Express routes
- No manual tool definitions
- Best for HTTP APIs only
- Doesn't require SDK as dependency

### vs API Gateway?

**API Gateway** (like Kong, AWS API Gateway):
- General HTTP proxying
- Not MCP-specific
- More features (auth, rate limiting, caching)
- More complex setup

**express-mcp-server**:
- MCP protocol specific
- Simple, focused tool
- Generate and run in minutes
- Lightweight

## Contributing

### Can I contribute?

**Yes!** See the [GitHub repository](https://github.com/mr-anvesh/express-mcp).

**Ideas:**
- Report bugs
- Suggest features
- Improve documentation
- Submit pull requests

### What features are planned?

Check the [GitHub issues](https://github.com/mr-anvesh/express-mcp/issues) for roadmap and feature requests.

## Still have questions?

- Check [Troubleshooting Guide](./troubleshooting.md)
- Read full [Documentation](./README.md)
- Open an [issue on GitHub](https://github.com/mr-anvesh/express-mcp/issues)
