import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
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
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}\n',
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

test('HTTP transport rejects browser origins by default and notifications return 202', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'express-mcp-'));
  const port = await getAvailablePort();
  const outputPath = join(directory, 'server.js');
  const app = express();
  app.get('/users', () => {});
  await generateMcpServer(app, {
    expressBaseUrl: 'http://localhost:3000',
    outputPath,
    typescript: false,
    transport: 'streamable-http',
    mcpPort: port,
  });
  const child = spawn(process.execPath, [outputPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    await once(child.stderr, 'data');
    const url = `http://127.0.0.1:${port}/mcp`;
    const untrusted = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://untrusted.example' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(untrusted.status, 403);

    const notification = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list' }),
    });
    assert.equal(notification.status, 202);
    assert.equal(await notification.text(), '');
  } finally {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not allocate a TCP port'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
    server.on('error', reject);
  });
}
