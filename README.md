# express-mcp-server

Generate a standalone MCP server from selected routes in an Express 4 or 5 application. Choose where operations run. In proxy mode the generated server calls an existing HTTP API. In import mode each MCP process loads the Express app and executes its routes and middleware in memory.

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

In proxy mode, run the API and generated server separately.

```bash
node server.js
node mcp-server.js
```

## Run independently with an imported app

Export the configured Express application from a module. The module that calls `app.listen()` can remain the separate entry point for your existing API. For example, with a default export in `app.js`, run this generator alongside it.

```js
import app from './app.js';
import { generateMcpServer } from 'express-mcp-server';

await generateMcpServer(app, {
  mode: 'import',
  appModule: './app.js',
  outputPath: './mcp-server.js',
  typescript: false,
  transport: 'streamable-http',
});
```

Start each replica with `node mcp-server.js`. Only the MCP endpoint listens, by default at `http://127.0.0.1:3001/mcp`. The runtime imports the app once and passes requests through Node's HTTP parser over in-memory streams. The same mode works with `transport: 'stdio'`.

Ship the generated file, the app module, its runtime dependencies and configuration together. A relative `appModule` resolves from the **generated file**. Point it at compiled JavaScript when deploying TypeScript apps on Node 20. For a named export such as `export const app = express()`, set `appExport: 'app'`. Build the tool list from the same app revision you deploy.

Both modes use the same route filters and tool names. Existing configurations that supply `expressBaseUrl` select proxy mode automatically. See the [deployment and compatibility review](docs/README.md#production-readiness) for caller identity, route contracts, transport limits and shutdown.

For Express 5 routers mounted below a prefix, set `routes` to the full method/path templates, for example `[{ method: 'GET', path: '/api/users/:id' }]`. Generation stops when it encounters an opaque mount without a manifest.

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
  authTokenEnv: 'MCP_TOKEN',
  maxBodySize: 262_144,
}
```

Set `MCP_TOKEN` in the generated server’s runtime environment. Startup fails if the configured variable is empty or missing. The older `authToken` option embeds its literal value in the generated file.

For shared deployments, `http.oauth` adds audience-checked JWTs, per-tool scopes and protected-resource metadata. A wildcard bind requires `http.allowedHosts`. Each HTTP replica serves `/readyz`, supports optional metrics and drains on termination. [Deployment configuration](docs/README.md#production-readiness)

The bundled official SDK accepts both the 2026-07-28 `server/discover` flow and legacy `initialize` requests. Modern HTTP requests must supply MCP headers that match the JSON-RPC body.

## Development

```bash
npm test
npm run lint
npm run format:check
```

See [the guide](docs/README.md), [the example](examples/simple-api), and [the changelog](CHANGELOG.md).
