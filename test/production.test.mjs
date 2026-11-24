import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { generateMcpServer } from '../dist/index.js';
import app from './fixtures/production-app.mjs';

const imported = {
  mode: 'import',
  appModule: new URL('./fixtures/production-app.mjs', import.meta.url).href,
};
const meta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function start(t, options) {
  const dir = await mkdtemp(join(tmpdir(), 'express-mcp-prod-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outputPath = join(dir, 'server.mjs');
  await generateMcpServer(app, {
    outputPath,
    typescript: false,
    transport: 'streamable-http',
    mcpPort: 0,
    ...options,
  });
  return launch(t, outputPath);
}

async function launch(t, outputPath) {
  const child = spawn(process.execPath, [outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => {
    if (child.exitCode === null) child.kill();
  });
  const [log] = await once(child.stderr, 'data');
  const url = log.toString().match(/http:\/\/127\.0\.0\.1:\d+\/mcp/)?.[0];
  assert.ok(url, log.toString().slice(-500));
  return { url, child, outputPath };
}

async function rpc(url, method, params = {}, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-method': method,
      'mcp-protocol-version': '2026-07-28',
      ...(params.name && { 'mcp-name': params.name }),
      ...(token && { authorization: 'Bearer ' + token }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: meta } }),
  });
  return { status: response.status, body: await response.json() };
}

test(
  'verifies OAuth audience, filters tools, and preserves each caller identity in both modes',
  { timeout: 15000 },
  async (t) => {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' };
    const issuerServer = createServer((_req, res) =>
      res.end(JSON.stringify({ keys: [jwk] })),
    ).listen(0, '127.0.0.1');
    await once(issuerServer, 'listening');
    t.after(() => issuerServer.close());
    const issuer = 'http://127.0.0.1:' + issuerServer.address().port;
    const resource = 'https://mcp.example.test/mcp';
    const sign = (sub, scope, aud = resource) =>
      new SignJWT({ scope, client_id: 'test-client' })
        .setProtectedHeader({ alg: 'ES256', kid: 'test', typ: 'at+jwt' })
        .setSubject(sub)
        .setIssuer(issuer)
        .setAudience(aud)
        .setExpirationTime('5m')
        .sign(privateKey);
    const upstream = app.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    t.after(() => upstream.close());
    for (const proxy of [false, true]) {
      const oauth = {
        issuer,
        resource,
        jwksUri: issuer + '/keys',
        toolScopes: { get_identity: ['read'], get_empty: ['admin'] },
        ...(proxy && { delegateModule: new URL('./fixtures/delegate.mjs', import.meta.url).href }),
      };
      const { url } = await start(t, {
        ...(proxy ? { expressBaseUrl: 'http://127.0.0.1:' + upstream.address().port } : imported),
        include: ['/identity', '/empty'],
        http: { oauth },
      });
      const metadata = await fetch(new URL('/.well-known/oauth-protected-resource/mcp', url)).then(
        (r) => r.json(),
      );
      assert.equal(metadata.resource, resource);
      assert.deepEqual(metadata.authorization_servers, [issuer]);
      const noCred = await fetch(url, { method: 'POST' });
      assert.equal(noCred.status, 401);
      assert.match(noCred.headers.get('www-authenticate'), /resource_metadata=/);
      const bad = await rpc(
        url,
        'tools/list',
        {},
        await sign('someone', 'read', 'https://other.test'),
      );
      assert.equal(bad.status, 401);
      const hidden = await rpc(url, 'tools/list', {}, await sign('viewer', 'unrelated'));
      assert.deepEqual(hidden.body.result.tools, []);
      if (proxy) {
        const misconfigured = await rpc(
          url,
          'tools/call',
          { name: 'get_identity' },
          await sign('misconfigured-delegate', 'read'),
        );
        assert.equal(misconfigured.body.result.isError, true);
        assert.match(misconfigured.body.result.content[0].text, /separate API credential/);
      }
      await Promise.all(
        ['alice', 'bob'].map(async (subject) => {
          const token = await sign(subject, 'read');
          const list = await rpc(url, 'tools/list', {}, token);
          assert.deepEqual(
            list.body.result.tools.map((t) => t.name),
            ['get_identity'],
          );
          const denied = await rpc(url, 'tools/call', { name: 'get_empty' }, token);
          assert.ok(denied.body.error);
          const call = await rpc(url, 'tools/call', { name: 'get_identity' }, token);
          assert.equal(call.body.result.isError, undefined);
          assert.deepEqual(
            call.body.result.structuredContent,
            proxy
              ? { credential: 'Bearer api-for-' + subject }
              : { subject, issuer, scopes: ['read'], clientId: 'test-client' },
          );
        }),
      );
    }
  },
);

test(
  'enforces contracts, execution budgets, metrics and graceful drain',
  { timeout: 15000 },
  async (t) => {
    const contract = {
      type: 'object',
      properties: {
        body: { type: 'object', required: ['value'], properties: { value: { type: 'integer' } } },
      },
      required: ['body'],
    };
    const { url, child } = await start(t, {
      ...imported,
      http: { metrics: true },
      limits: { timeoutMs: 180, maxResponseBytes: 512, maxConcurrentCalls: 1 },
      contracts: {
        post_echo: {
          inputSchema: contract,
          outputSchema: {
            type: 'object',
            required: ['value'],
            properties: { value: { type: 'integer', minimum: 0 } },
          },
        },
      },
    });
    const call = async (name, args) =>
      (await rpc(url, 'tools/call', { name, arguments: args })).body.result;
    assert.equal((await fetch(new URL('/readyz', url))).status, 200);
    assert.equal((await call('post_echo', { body: { value: 'x' } })).isError, true);
    assert.equal((await call('post_echo', { body: { value: -1 } })).isError, true);
    assert.deepEqual((await call('post_echo', { body: { value: 42 } })).structuredContent, {
      value: 42,
    });
    const slow = call('get_wait', {});
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await fetch(new URL('/metrics', url)).then((r) => r.json())).active) break;
      await delay(2);
    }
    assert.match((await call('get_empty', {})).content[0].text, /concurrency/);
    assert.match((await slow).content[0].text, /deadline/);
    assert.match((await call('get_large', {})).content[0].text, /maxResponseBytes/);
    assert.equal((await call('get_empty', {})).content[0].text, '');
    const metrics = await fetch(new URL('/metrics', url)).then((r) => r.json());
    assert.equal(metrics.active, 0);
    assert.equal(metrics.tools.get_wait.errors, 1);
    const finishing = call('get_wait', {});
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await fetch(new URL('/metrics', url)).then((r) => r.json())).active) break;
      await delay(2);
    }
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    assert.match((await finishing).content[0].text, /deadline/);
    assert.equal((await exited)[0], 0);
  },
);

for (const transport of ['streamable-http', 'stdio']) {
  for (const mode of ['import', 'proxy']) {
    test(
      `${transport} cancels an in-flight ${mode} operation and serves another call`,
      { timeout: 10000 },
      async (t) => {
        let execution = imported;
        if (mode === 'proxy') {
          const upstream = app.listen(0, '127.0.0.1');
          await once(upstream, 'listening');
          t.after(() => {
            upstream.closeAllConnections();
            upstream.close();
          });
          execution = { mode, expressBaseUrl: 'http://127.0.0.1:' + upstream.address().port };
        }
        const options = {
          ...execution,
          transport,
          limits: { timeoutMs: 8000, maxConcurrentCalls: 2 },
        };
        const client = new Client(
          { name: 'cancellation-test', version: '1' },
          { versionNegotiation: { mode: { pin: '2026-07-28' } } },
        );
        t.after(() => client.close());
        if (transport === 'stdio') {
          const dir = await mkdtemp(join(tmpdir(), 'express-mcp-stdio-'));
          t.after(() => rm(dir, { recursive: true, force: true }));
          const outputPath = join(dir, 'server.cjs');
          await generateMcpServer(app, { ...options, outputPath, typescript: false });
          await client.connect(
            new StdioClientTransport({
              command: process.execPath,
              args: [outputPath],
              stderr: 'pipe',
            }),
          );
        } else {
          const { url } = await start(t, options);
          await client.connect(new StreamableHTTPClientTransport(new URL(url)));
        }
        const id = mode + '-' + transport;
        const signal = new AbortController();
        const waiting = client.callTool(
          { name: 'get_jobs_by_id_wait', arguments: { id } },
          { signal: signal.signal },
        );
        const cancelled = assert.rejects(waiting);
        const status = async () => {
          const result = await client.callTool({
            name: 'get_jobs_by_id_status',
            arguments: { id },
          });
          assert.ok(!result.isError, JSON.stringify(result.content));
          return result.structuredContent.state;
        };
        async function expectState(expected) {
          let current;
          for (let i = 0; i < 100; i++) {
            current = await status();
            if (current === expected) return;
            await delay(10);
          }
          assert.equal(current, expected);
        }
        await expectState('running');
        signal.abort();
        await cancelled;
        await expectState(mode === 'import' ? 'signal received' : 'connection closed');
        assert.equal((await client.callTool({ name: 'get_empty' })).content[0].text, '');
      },
    );
  }
}

test(
  'an imported artifact serves one MCP client across two replicas without affinity',
  { timeout: 10000 },
  async (t) => {
    const first = await start(t, imported);
    const second = await launch(t, first.outputPath);
    const replicas = [first, second];
    const dispatched = [];
    const balancer = createServer((req, res) => {
      const index = dispatched.length % replicas.length;
      dispatched.push(index);
      const upstream = request(
        replicas[index].url,
        { method: req.method, headers: req.headers },
        (reply) => {
          res.writeHead(reply.statusCode, reply.headers);
          reply.pipe(res);
        },
      );
      upstream.on('error', () => res.writeHead(502).end());
      req.pipe(upstream);
    }).listen(0, '127.0.0.1');
    await once(balancer, 'listening');
    t.after(() => {
      balancer.closeAllConnections();
      balancer.close();
    });
    for (const mode of ['legacy', { pin: '2026-07-28' }]) {
      const client = new Client(
        { name: 'replica-test', version: '1' },
        { versionNegotiation: { mode } },
      );
      try {
        await client.connect(
          new StreamableHTTPClientTransport(
            new URL('http://127.0.0.1:' + balancer.address().port + '/mcp'),
          ),
        );
        const { tools } = await client.listTools();
        assert.ok(tools.some((tool) => tool.name === 'post_echo'));
        const offset = dispatched.length;
        for (const n of [1, 2]) {
          const result = await client.callTool({ name: 'post_echo', arguments: { body: { n } } });
          assert.deepEqual(result.structuredContent, { n });
        }
        assert.deepEqual(new Set(dispatched.slice(offset)), new Set([0, 1]));
      } finally {
        await client.close();
      }
    }
  },
);
