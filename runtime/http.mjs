import { createServer } from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { createMcpHandler, validateHostHeader } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createOAuth } from './authorization.mjs';

function hash(value) {
  return createHash('sha256').update(value).digest();
}

export async function serveHttp(config, factory, state) {
  const { http, limits } = config;
  const oauth = http.oauth && createOAuth(http.oauth, http.metrics);
  const secret = http.authTokenEnv ? process.env[http.authTokenEnv] : http.authToken;
  if (http.authTokenEnv && !secret)
    throw new Error('Missing HTTP bearer token in ' + http.authTokenEnv);
  const tokenDigest = secret && hash('Bearer ' + secret);
  const maxRequestBodySize = http.maxBodySize ?? 1_048_576;
  const handler = createMcpHandler(factory, { maxRequestBodySize });
  const handle = toNodeHandler(handler, { maxRequestBodySize });
  const host = http.host ?? '127.0.0.1';
  const hosts =
    http.allowedHosts ??
    (['localhost', '127.0.0.1', '::1'].includes(host)
      ? ['localhost', '127.0.0.1', '[::1]']
      : [host]);
  const listener = createServer(async (req, res) => {
    try {
      if (!validateHostHeader(req.headers.host, hosts).ok) {
        res.writeHead(403).end();
        return;
      }
      const origin = req.headers.origin;
      if (origin !== undefined && !http.allowedOrigins?.includes(origin)) {
        res.writeHead(403).end();
        return;
      }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
        );
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(origin ? 204 : 403).end();
        return;
      }
      if (req.method === 'GET' && req.url === '/readyz') {
        res.writeHead(state.draining ? 503 : 200).end();
        return;
      }
      if (oauth && req.method === 'GET' && req.url === oauth.path) {
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(oauth.metadata));
        return;
      }
      const metrics = http.metrics && req.method === 'GET' && req.url === '/metrics';
      if (req.url !== '/mcp' && !metrics) {
        res.writeHead(404).end();
        return;
      }
      if (state.draining) {
        res.writeHead(503).end();
        return;
      }
      if (tokenDigest && !timingSafeEqual(tokenDigest, hash(req.headers.authorization ?? ''))) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
        return;
      }
      if (oauth && !(await oauth.authenticate(req, res))) return;
      if (metrics) {
        if (oauth && !req.auth.scopes.includes('mcp:metrics')) {
          res.writeHead(403).end();
          return;
        }
        res
          .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          .end(JSON.stringify({ active: state.active, tools: Object.fromEntries(state.counters) }));
        return;
      }
      if (oauth) res.setHeader('Cache-Control', 'private, no-store');
      await handle(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  async function drain() {
    if (state.draining) return;
    state.draining = true;
    const cutoff = setTimeout(() => {
      state.shutdown.abort(new Error('Server shutting down'));
      listener.closeAllConnections();
    }, limits.drainTimeoutMs);
    cutoff.unref();
    try {
      await new Promise((resolve) => listener.close(resolve));
      await handler.close();
    } finally {
      clearTimeout(cutoff);
    }
  }
  for (const event of ['SIGTERM', 'SIGINT'])
    process.once(event, () => {
      void drain().then(() => process.exit(0));
    });
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(config.port, host, resolve);
  });
  process.stderr.write(
    'MCP Server listening on http://' +
      (host.includes(':') ? '[' + host + ']' : host) +
      ':' +
      listener.address().port +
      '/mcp\n',
  );
}
