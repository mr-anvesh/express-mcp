import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import appFixture, { routes } from './fixtures/execution-app.mjs';
import express from 'express';
import { generateMcpServer } from '../dist/index.js';

test('does not reply to notifications and accepts legacy initialize', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'express-mcp-'));
  const outputPath = join(directory, 'server.js');
  const app = express();
  app.get('/users', () => {});
  await generateMcpServer(app, {
    expressBaseUrl: 'http://localhost:3000',
    outputPath,
    typescript: false,
  });

  const child = spawn(process.execPath, [outputPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  try {
    child.stdin.write('{"jsonrpc":"2.0","method":"tools/list"}\n');
    child.stdin.write(
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}\n',
    );
    await once(child.stdout, 'data');
    const responses = stdout.trim().split('\n').map(JSON.parse);
    assert.deepEqual(
      responses.map((response) => response.id),
      [1],
    );
    assert.equal(responses[0].result.serverInfo.name, 'express-mcp-server');
  } finally {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

test('import mode serves authenticated legacy and modern HTTP clients and enforces transport limits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'express-mcp-'));
  const outputPath = join(directory, 'server.js');
  await generateMcpServer(appFixture, {
    routes,
    mode: 'import',
    appModule: new URL('./fixtures/execution-app.mjs', import.meta.url).href,
    outputPath,
    typescript: false,
    transport: 'streamable-http',
    mcpPort: 0,
    http: { authTokenEnv: 'TEST_MCP_TOKEN', maxBodySize: 2048 },
  });
  const child = spawn(process.execPath, [outputPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, TEST_MCP_TOKEN: 'test-credential' },
  });
  try {
    const [startup] = await once(child.stderr, 'data');
    const url = startup.toString().match(/http:\/\/127\.0\.0\.1:\d+\/mcp/)?.[0];
    assert.ok(url, startup.toString());
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer test-credential',
    };
    const unauthorized = await fetch(url, { method: 'POST' });
    assert.equal(unauthorized.status, 401);
    const oversized = await fetch(url, { method: 'POST', headers, body: ' '.repeat(2049) });
    assert.equal(oversized.status, 413);
    const untrusted = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://untrusted.example' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(untrusted.status, 403);

    const notification = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    assert.equal(notification.status, 202);
    assert.equal(await notification.text(), '');

    for (const mode of ['legacy', { pin: '2026-07-28' }]) {
      const client = new Client(
        { name: 'http-test', version: '1' },
        { versionNegotiation: { mode } },
      );
      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }),
        );
        const result = await client.callTool({ name: 'get_api_empty' });
        assert.ok(!result.isError);
        assert.equal(result.content[0].text, '');
      } finally {
        await client.close();
      }
    }
  } finally {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});
