# Guide

## Route extraction

Call `generateMcpServer` after registering all application and nested-router routes. Express 4 mounts are extracted directly. Express 5 only exposes opaque matcher functions, so the extractor recovers common static API mounts (`/api`, `/api/v1`, and `/v1`) from those matchers; parameterized and arbitrary static mount paths cannot be reconstructed reliably. Expose those routes explicitly or avoid generating tools for them.

Generation imports the live app, so make the app module side-effect free: export the configured Express application and start listeners only from a separate `server.ts` entry point.

## Generated tools

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

`streamable-http` is loopback-only unless configured otherwise. It rejects unapproved `Origin` values, has no wildcard CORS behavior, and caps bodies at 1 MiB. Set `allowedOrigins` only for origins you control and set `authToken` when another local process or a proxy can reach the service.

## Troubleshooting

- **No routes found:** Register routes before generation; make sure an Express router is mounted on the app.
- **Missing mount prefix on a parameterized Express 5 router:** Express does not expose the original mount pattern. Prefer static mounts for generated APIs or filter those routes out.
- **Generated server cannot reach the API:** Start the Express listener separately and confirm `expressBaseUrl` points to it.
- **Need JavaScript output:** Set `typescript: false` and use a `.js` output path. The generated result passes `node --check`.
