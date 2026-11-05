# Troubleshooting Guide

Common issues and their solutions.

## Installation Issues

### Module Not Found Errors

**Problem:**
```
Error: Cannot find module 'express-mcp-server'
```

**Solutions:**

1. Verify installation:
```bash
npm list express-mcp-server
```

2. Reinstall:
```bash
npm install express-mcp-server
```

3. Check `node_modules`:
```bash
ls node_modules/express-mcp-server
```

### TypeScript Type Errors

**Problem:**
```
Cannot find type definitions for 'express-mcp-server'
```

**Solution:**

The package includes TypeScript definitions. Make sure:

```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

## Generation Issues

### No Routes Found

**Problem:**
```
Error: No routes found in Express application
```

**Causes & Solutions:**

1. **Routes defined after generation**
   ```typescript
   // Wrong: generate before defining routes
   await generateMcpServer(app, options);
   app.get('/users', ...);  // Too late!
   
   // Correct: define routes first
   app.get('/users', ...);
   await generateMcpServer(app, options);
   ```

2. **App not properly exported**
   ```typescript
   // Wrong: local variable
   const app = express();
   
   // Correct: exported for use
   const app = express();
   export default app;
   ```

3. **Router not mounted**
   ```typescript
   const router = express.Router();
   router.get('/users', ...);
   // Router defined but not mounted
   
   app.use('/api', router);  // Must mount it
   ```

### Router Stack Access Errors

**Problem:**
```
TypeError: Cannot read property 'stack' of undefined
```

**Solution:**

Access the router after defining at least one route:

```typescript
const app = express();

// Define at least one route first
app.get('/', (req, res) => res.send('OK'));

// Now generate
await generateMcpServer(app, options);
```

### File Write Permission Errors

**Problem:**
```
Error: EACCES: permission denied, open './mcp-server.ts'
```

**Solutions:**

1. Check directory permissions:
```bash
ls -la ./
```

2. Use a different output path:
```typescript
outputPath: './generated/mcp-server.ts'  // Ensure directory exists
```

3. Create directory first:
```bash
mkdir -p ./generated
```

## Runtime Issues

### Express Server Not Reachable

**Problem:**

Generated MCP server can't reach Express:
```
Error: fetch failed
TypeError: Failed to fetch
```

**Solutions:**

1. **Verify Express is running:**
```bash
curl http://localhost:3000
```

2. **Check base URL matches:**
```typescript
// In generator:
expressBaseUrl: 'http://localhost:3000'

// In Express:
app.listen(3000)  // Must match!
```

3. **Check firewall/network:**
```bash
netstat -an | grep 3000
```

### Port Already in Use (Streamable HTTP)

**Problem:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solutions:**

1. **Find process using the port:**
```bash
lsof -i :3001
```

2. **Kill the process:**
```bash
kill -9 <PID>
```

3. **Use a different port:**
```typescript
mcpPort: 3002  // Try another port
```

### CORS Errors (Streamable HTTP Transport)

**Problem:**
```
Access to fetch blocked by CORS policy
```

**Solution:**

The generated Streamable HTTP server includes CORS headers. If still seeing errors, verify:

1. Check generated server has CORS:
```typescript
// Should be in generated file
res.setHeader('Access-Control-Allow-Origin', '*');
```

2. For custom origins, edit generated file:
```typescript
res.setHeader('Access-Control-Allow-Origin', 'https://yourapp.com');
```

## JSON-RPC Issues

### Parse Error

**Problem:**
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32700,
    "message": "Parse error"
  }
}
```

**Cause:**

Invalid JSON sent to MCP server.

**Solution:**

Validate JSON before sending:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' | jq .
```

### Method Not Found

**Problem:**
```json
{
  "error": {
    "code": -32601,
    "message": "Method not found: invalid_method"
  }
}
```

**Valid methods:**
- `server/discover`
- `tools/list`
- `tools/call`

**Example:**
```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}
```

### Tool Not Found

**Problem:**
```json
{
  "error": {
    "code": -32602,
    "message": "Tool not found: get_invalid_route"
  }
}
```

**Solutions:**

1. **List available tools:**
```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node mcp-server.js
```

2. **Check tool name spelling:**
```json
// Wrong
{"name": "getUsers"}

// Correct
{"name": "get_users"}
```

### Missing Required Parameters

**Problem:**

Tool call fails because required parameter is missing.

**Solution:**

Check tool schema:
```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node mcp-server.js | jq '.result.tools[] | select(.name=="get_users_by_id")'
```

Include all required params:
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_users_by_id",
    "arguments": {
      "id": "123"  // Required!
    }
  }
}
```

## HTTP Request Issues

### 404 Not Found

**Problem:**

Tool calls return 404 errors.

**Causes:**

1. **Wrong base URL**
```typescript
// Generator config
expressBaseUrl: 'http://localhost:3000'

// But Express is on different port
app.listen(4000)  // Mismatch!
```

2. **Route path changed**
```typescript
// Originally:
app.get('/users/:id', ...)

// Changed to:
app.get('/api/users/:id', ...)

// Generated server still uses /users/:id
// Regenerate after route changes
```

3. **Nested router not extracting correctly**

Check extracted routes:
```typescript
import { extractRoutes } from 'express-mcp-server';
console.log(extractRoutes(app));
```

### 500 Internal Server Error

**Problem:**

Tool calls trigger Express errors.

**Debugging:**

1. **Check Express logs:**
```typescript
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: err.message });
});
```

2. **Test endpoint directly:**
```bash
curl -v http://localhost:3000/users/123
```

3. **Check request format:**

Generated server sends:
```http
GET /users/123
```

Verify your Express route expects this format.

## TypeScript Compilation Issues

### Cannot Compile Generated File

**Problem:**
```
error TS2304: Cannot find name 'require'
```

**Cause:**

Generated file uses CommonJS `require()` but your TS config expects ES modules.

**Solutions:**

1. **Add Node types:**
```bash
npm install -D @types/node
```

2. **Update tsconfig:**
```json
{
  "compilerOptions": {
    "types": ["node"],
    "moduleResolution": "node"
  }
}
```

3. **Or generate JavaScript:**
```typescript
typescript: false  // Generate .js instead
```

### Import Extensions Error

**Problem:**
```
Error: Unknown file extension ".ts"
```

**Solution:**

Run with `tsx` or compile first:
```bash
# Option 1: Use tsx
npx tsx mcp-server.ts

# Option 2: Compile first
tsc mcp-server.ts
node mcp-server.js
```

## Common Mistakes

### 1. Not Starting Express Server

**Problem:**

MCP server can't reach Express.

**Checklist:**
- [ ] Express server is running
- [ ] Express is on correct port
- [ ] Base URL matches in generator config
- [ ] Can curl Express endpoints

### 2. Forgetting to Regenerate

**Problem:**

New routes don't appear as tools.

**Remember:**

Run generator again after changing routes:
```bash
node generate-mcp.ts
```

### 3. Wrong Transport for Client

**Problem:**

Using a stdio client with a Streamable HTTP server or vice versa.

**Match them:**

| Server Transport | Client Type |
|------------------|-------------|
| stdio | Claude Desktop, CLI clients |
| Streamable HTTP | Web clients, HTTP requests |

### 4. Editing Generated File Then Regenerating

**Problem:**

Lost customizations after regenerating.

**Solution:**

1. **Version control generated file:**
```bash
git add mcp-server.ts
git commit -m "Customized MCP server"
```

2. **Backup before regenerating:**
```bash
cp mcp-server.ts mcp-server.backup.ts
node generate-mcp.ts
# Manually merge customizations
```

3. **Or don't regenerate:**

Manually update the generated file instead.

## Getting Help

### Debug Mode

Enable verbose logging in generated server:

```typescript
// Add to generated file
console.error('Received message:', JSON.stringify(message));
console.error('Calling URL:', url);
console.error('Response:', JSON.stringify(result));
```

### Collect Information

When reporting issues, include:

1. **Version info:**
```bash
npm list express-mcp-server express
node --version
```

2. **Configuration used:**
```typescript
const options = {
  expressBaseUrl: '...',
  outputPath: '...',
  // etc.
};
```

3. **Route extraction output:**
```typescript
const routes = extractRoutes(app);
console.log(JSON.stringify(routes, null, 2));
```

4. **Error messages:**

Complete error stack traces.

### Community Support

- [GitHub Issues](https://github.com/mr-anvesh/express-mcp/issues)
- Check [FAQ](./faq.md) for common questions

## Still Stuck?

If you've tried everything:

1. **Minimal reproduction:**

Create a minimal example that reproduces the issue:
```typescript
import express from 'express';
import { generateMcpServer } from 'express-mcp-server';

const app = express();
app.get('/test', (req, res) => res.json({ ok: true }));

await generateMcpServer(app, {
  expressBaseUrl: 'http://localhost:3000',
  outputPath: './test-mcp.ts'
});
```

2. **Open an issue:**

https://github.com/mr-anvesh/express-mcp/issues

Include:
- Minimal reproduction code
- Error messages
- Environment details
- What you've already tried
