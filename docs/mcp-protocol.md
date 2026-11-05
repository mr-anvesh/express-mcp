# MCP Protocol Reference

Generated servers implement the stateless [MCP `2026-07-28` specification](https://modelcontextprotocol.io/specification/2026-07-28). This revision removes the `initialize` / `initialized` handshake and session-based SSE transport.

## Request envelope

Every request is JSON-RPC 2.0 and has an ID. Its `params._meta` must include the protocol version and the capabilities that apply to that individual request.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": {
        "name": "example-client",
        "version": "1.0.0"
      }
    }
  }
}
```

The server supports only `2026-07-28`. A different requested version receives JSON-RPC error `-32022` with `requested` and `supported` values.

## Methods

### `server/discover`

Clients use `server/discover` instead of `initialize` to learn which protocol revisions and capabilities the server supports.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": { "tools": {} },
    "ttlMs": 60000,
    "cacheScope": "public"
  }
}
```

### `tools/list`

Lists Express routes exposed as tools. Results include the required `resultType` discriminator and cache hints.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "complete",
    "tools": [{
      "name": "get_users_by_id",
      "description": "GET /users/:id",
      "inputSchema": {
        "type": "object",
        "properties": { "id": { "type": "string" } },
        "required": ["id"]
      }
    }],
    "ttlMs": 60000,
    "cacheScope": "public"
  }
}
```

### `tools/call`

Calls a generated tool. A successful result always includes `resultType: "complete"`, `content`, and, when the Express API returns JSON, `structuredContent`.

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_users_by_id",
    "arguments": { "id": "123" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

If an Express call fails, the server returns a completed tool result with `isError: true`; this lets an MCP client show the failure to the model. Invalid tool names and malformed protocol requests remain JSON-RPC errors.

## Transports

### stdio

The stdio transport is newline-delimited JSON-RPC. Protocol responses, including parse errors, are written to stdout; diagnostics are written to stderr.

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' | node mcp-server.js
```

### Streamable HTTP

Set `transport: 'streamable-http'` and provide `mcpPort`. The server accepts `POST /mcp`; it has no MCP session state. Each request must include these headers, which are validated against the JSON-RPC body:

- `MCP-Protocol-Version: 2026-07-28`
- `Mcp-Method`: the JSON-RPC method
- `Mcp-Name`: the tool name for `tools/call`

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/list' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
```

A missing or mismatched required routing header returns `-32020` and HTTP 400.

## Error codes

| Code | Meaning |
|---|---|
| `-32700` | Parse error |
| `-32600` | Invalid JSON-RPC request |
| `-32601` | Method not found |
| `-32602` | Invalid parameters or missing MCP request metadata |
| `-32020` | HTTP routing header/body mismatch |
| `-32022` | Unsupported MCP protocol version |

## See also

- [MCP specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [Tool Schema Reference](./tool-schema.md)
