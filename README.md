# express-mcp-server

Generate a standalone MCP server from selected routes in an Express 4 or 5 application. The generated server calls your existing HTTP API; it does not import your app at runtime.

## Install

```bash
npm install express-mcp-server express
```

Node.js 20 or later is required.

## Quick start

```ts
import express from 'express';
import { generateMcpServer } from 'express-mcp-server';

const app = express();
app.use(express.json());
app.get('/users/:id', (req, res) => res.json({ id: req.params.id }));

const result = await generateMcpServer(app, {
  expressBaseUrl: 'http://127.0.0.1:3000',
  outputPath: './mcp-server.js',
  typescript: false,
  transport: 'stdio',
});

console.log(`Generated ${result.toolCount} tools at ${result.outputPath}`);
```

Run the API and generated server separately:

```bash
node server.js
node mcp-server.js
```

## Options

`include` and `exclude` match either `/path` or `METHOD /path`. Use them to expose a deliberately small API surface. `readOnly: true` keeps only `GET`, `HEAD`, and `OPTIONS` routes. Generated tools include read-only, idempotency, and destructive-operation annotations.

```ts
await generateMcpServer(app, {
  expressBaseUrl: 'http://127.0.0.1:3000',
  outputPath: './mcp-server.js',
  typescript: false,
  include: ['/public', /^GET /],
  exclude: ['/admin'],
  readOnly: true,
});
```

Path parameter values are encoded before requests are made. Query values must be strings, numbers, booleans, or arrays of those primitive values; nested objects are rejected rather than being silently serialized as `[object Object]`.

## HTTP transport security

The default `stdio` transport is best for desktop MCP clients. If you use `streamable-http`, the generated server binds to `127.0.0.1`, rejects browser origins unless explicitly allowed, and limits request bodies to 1 MiB. It does not use wildcard CORS.

Use a non-loopback host only when you intentionally operate a network service, and protect it with an auth token and a narrow origin allow-list:

```ts
http: {
  host: '127.0.0.1',
  allowedOrigins: ['https://mcp.example.com'],
  authToken: process.env.MCP_TOKEN,
  maxBodySize: 262_144,
}
```

The runtime accepts both the 2026-07-28 `server/discover` flow and legacy `initialize` requests. Modern HTTP requests must supply MCP headers that match the JSON-RPC body.

## Development

```bash
npm test
npm run lint
npm run format:check
```

See [the guide](docs/README.md), [the example](examples/simple-api), and [the changelog](CHANGELOG.md).
