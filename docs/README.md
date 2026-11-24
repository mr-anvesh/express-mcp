# Guide

## Route extraction

Register all routes before generation. Automatic extraction supports literal route arrays, named path parameters, static Express 4 router mounts, and Express 5 routers mounted at the root. For a non-root Express 5 router, a parameterized mount, a mounted sub-app, or a regex/wildcard route, supply full concrete method/path templates. The generator rejects paths it cannot reconstruct reliably. It preserves strict trailing slashes and rejects parameter names that collide with generated inputs.

```ts
await generateMcpServer(app, {
  mode: 'import',
  appModule: './app.js',
  outputPath: './mcp-server.js',
  typescript: false,
  routes: [{ method: 'GET', path: '/tenants/:tenant/invoices/:id' }],
});
```

The manifest replaces introspection for that build. Every path must reach the intended handler in the deployed app. Route filters still apply.

Generation inspects the live app. Import mode also loads the exported app at runtime. Put listener startup, schedulers, and other singleton jobs in a separate entry point so they run only in their intended process.

## Generated tools

To run the included example, run `npm ci` and `npm run build` at the repository root, then `cd examples/simple-api`. Run `npm run generate` for an imported app or `npm run generate -- --proxy` for an upstream API. Start the generated MCP process with `node mcp-server.js`. Proxy mode also needs `node server.js` in a separate process.

One tool is emitted per selected route. Required route parameters become required string fields; write methods have a JSON `body`; query values are primitive-only. Use route filters rather than exposing admin or write endpoints by default.

```ts
await generateMcpServer(app, {
  expressBaseUrl: process.env.API_URL ?? 'http://127.0.0.1:3000',
  outputPath: './mcp-server.js',
  typescript: false,
  include: [/^GET \/api\//],
  exclude: ['/api/internal'],
  readOnly: true,
});
```

## Transports and compatibility

`stdio` emits only JSON-RPC replies to standard output; diagnostics go to standard error. Notifications deliberately produce no reply. The generated runtime supports modern `server/discover` calls and the older `initialize` handshake for broad client compatibility.

`streamable-http` is loopback-only unless configured otherwise. It rejects unapproved `Origin` values, has no wildcard CORS behavior, and caps bodies at 1 MiB. Set `allowedOrigins` only for origins you control and use `authTokenEnv` to resolve a bearer token at startup when another local process or a proxy can reach the service.

## Production readiness

The generator embeds the official MCP TypeScript SDK, its Node transport, and the schema and token validators in each output file. Regenerate and redeploy artifacts to pick up dependency fixes. The HTTP adapter uses stateless legacy handling and per-request modern handling, so replicas can sit behind a load balancer. [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

### Authorization

For per-user HTTP deployments, configure an OAuth issuer, its trusted JWKS endpoint, the public resource URI clients use, and scopes for **every selected tool**. An empty scope list permits any verified subject. Configure the issuer to mint signed `at+jwt` access tokens with a subject and a string `client_id` or `azp`. Verification checks the access-token type, signature, issuer, audience, expiry and subject. Protected-resource metadata is available at the RFC 9728 path for the configured resource. Keep token issuance, login, TLS termination and signing key management in your identity provider and ingress. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

```ts
await generateMcpServer(app, {
  mode: 'import',
  appModule: './app.js',
  outputPath: './mcp-server.js',
  typescript: false,
  transport: 'streamable-http',
  routes: [{ method: 'GET', path: '/invoices/:id' }],
  http: {
    host: '0.0.0.0',
    allowedHosts: ['mcp.example.com'],
    oauth: {
      issuer: 'https://identity.example.com',
      jwksUri: 'https://identity.example.com/.well-known/jwks.json',
      resource: 'https://mcp.example.com/mcp',
      toolScopes: { get_invoices_by_id: ['invoices:read'] },
    },
  },
});
```

In import mode, Express handlers receive `req.mcpPrincipal` with `issuer`, `subject`, `clientId` and `scopes`. Use the issuer and subject to check tenant and record access inside the handler. In proxy mode, configure `http.oauth.delegateModule` with a path relative to the generated file. Its trusted default async export receives `{ principal, tool, signal, accessToken }`. It can exchange the incoming access token with the authorization server and returns a short-lived credential for the upstream API. The proxy uses that credential as a bearer token and rejects redirects on delegated calls. Implement the delegate using your identity provider’s service credentials or on-behalf-of flow. Returning the incoming MCP token as the API credential fails the call.

### Tool contracts and limits

Define optional `contracts` keyed by tool name. The SDK advertises both schemas and validates incoming arguments and successful output. Input constraints extend the generated path/body/query contract. Use an object-rooted input schema and JSON Schema 2020-12 keywords.

```ts
contracts: {
  post_invoices: {
    inputSchema: {
      type: 'object',
      required: ['body'],
      properties: {
        body: {
          type: 'object',
          required: ['amount'],
          properties: { amount: { type: 'integer', minimum: 1 } },
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
  },
}
```

| Setting                     |   Default | Applies to                                                                      |
| --------------------------- | --------: | ------------------------------------------------------------------------------- |
| `limits.timeoutMs`          |    30,000 | Execution of one tool, including credential delegation and reading its response |
| `limits.maxConcurrentCalls` |        32 | Simultaneous operations per MCP process                                         |
| `limits.maxResponseBytes`   | 1,048,576 | Bytes read from an Express operation before decoding JSON or text               |
| `limits.maxFrameBytes`      | 1,048,576 | SDK stdio read buffer                                                           |
| `http.maxBodySize`          | 1,048,576 | Incoming HTTP request bytes                                                     |
| `limits.drainTimeoutMs`     |    10,000 | HTTP shutdown grace period                                                      |

Slow or oversized calls return tool errors. Imported handlers receive `req.mcpSignal` for cancellation. Pass it to database or network operations that support aborting. A deadline closes the transport request. An operation that already committed a change keeps that change, and synchronous application code must yield for cancellation to take effect. Binary downloads and event streams require a dedicated tool representation.

### Operating replicas

Use `GET /readyz` for HTTP readiness. Enable `http.metrics: true` for per-process JSON counters at `GET /metrics`, including active operations and calls, execution errors and cumulative elapsed milliseconds per tool. The endpoint uses the configured HTTP authentication. OAuth deployments additionally require the `mcp:metrics` scope. Input validation happens before execution counters start.

On SIGTERM or SIGINT the listener stops accepting connections, lets current requests finish, and aborts outstanding requests at the shutdown deadline. Configure the orchestrator’s termination grace period above that deadline. Put shared sessions, data and idempotency keys in a backing service and size its connection pools across replicas. Exercise those app-specific behaviors under load before setting replica counts.

Import mode supports ordinary JSON and text routes. Its in-memory connections have no remote IP or TLS peer identity. Review middleware that depends on a network socket, proxy identity, or a real hostname before choosing this mode. Redirect responses surface as tool errors in import mode. Proxy mode keeps Node fetch's redirect behavior. For stdio, ordinary application console messages go to stderr in import mode. Code that writes directly to stdout must reserve it for MCP messages.

## Troubleshooting

- **No routes found:** Register routes before generation; make sure an Express router is mounted on the app.
- **Missing mount prefix on a parameterized Express 5 router:** Express does not expose the original mount pattern. Provide an explicit `routes` manifest with full paths.
- **Generated server cannot reach the API:** In proxy mode, start the Express listener separately and confirm `expressBaseUrl` points to it.
- **Need JavaScript output:** Set `typescript: false` and use a `.js` output path. The generated result passes `node --check`.
