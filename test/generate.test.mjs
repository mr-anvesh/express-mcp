import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import express from 'express';
import { generateMcpServer } from '../dist/index.js';

test('generates syntax-valid JavaScript and safely embeds route literals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'express-mcp-'));
  const outputPath = join(directory, 'server.js');
  try {
    const app = express();
    app.get("/it's/:id", () => {});
    const result = await generateMcpServer(app, {
      expressBaseUrl: 'http://localhost:3000',
      outputPath,
      typescript: false,
    });
    assert.equal(result.toolCount, 1);
    const source = await readFile(outputPath, 'utf8');
    assert.ok(source.includes("/it's/:id"));
    assert.equal(spawnSync(process.execPath, ['--check', outputPath]).status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('filters destructive routes when readOnly is enabled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'express-mcp-'));
  try {
    const app = express();
    app.get('/users', () => {});
    app.delete('/users/:id', () => {});
    const outputPath = join(directory, 'server.js');
    await generateMcpServer(app, {
      expressBaseUrl: 'http://localhost:3000',
      outputPath,
      readOnly: true,
    });
    const source = await readFile(outputPath, 'utf8');
    assert.match(source, /get_users/);
    assert.doesNotMatch(source, /delete_users_by_id/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects conflicting execution modes and ambiguous routes before writing output', async () => {
  const app = express();
  app.get('/items', () => {});
  const directory = await mkdtemp(join(tmpdir(), 'express-mcp-'));
  const outputPath = join(directory, 'server.mjs');
  try {
    for (const execution of [
      {},
      { mode: 'import' },
      { mode: 'import', appModule: './app.js', expressBaseUrl: 'http://localhost' },
    ]) {
      await assert.rejects(generateMcpServer(app, { ...execution, outputPath }), /mode requires/i);
    }
    app.get('/a-b', () => {});
    app.get('/a_b', () => {});
    await assert.rejects(
      generateMcpServer(app, { outputPath, mode: 'import', appModule: './app.js' }),
      /ambiguous/,
    );
    await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid policy and schema options preserve the previous server', async (t) => {
  const app = express();
  app.get('/hello', (_req, res) => res.send('hello'));
  const dir = await mkdtemp(join(tmpdir(), 'express-mcp-generation-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outputPath = join(dir, 'server.cjs');
  await writeFile(outputPath, 'previous artifact');
  const oauth = {
    issuer: 'https://issuer.example',
    resource: 'https://mcp.example/mcp',
    jwksUri: 'https://issuer.example/keys',
    toolScopes: {},
  };
  for (const [options, expected] of [
    [{ http: { oauth } }, /required OAuth scopes/],
    [{ limits: { timeoutMs: 0 } }, /Invalid limit/],
    [{ http: { host: '0.0.0.0' } }, /allowedHosts/],
    [{ contracts: { get_hello: { outputSchema: { type: 'unknown' } } } }, /schema|type/],
  ]) {
    await assert.rejects(
      generateMcpServer(app, {
        mode: 'import',
        appModule: './app.js',
        transport: 'streamable-http',
        outputPath,
        ...options,
      }),
      expected,
    );
    assert.equal(await readFile(outputPath, 'utf8'), 'previous artifact');
  }
});
