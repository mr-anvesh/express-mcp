import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
    assert.ok(source.includes('const pathTemplate = "/it\'s/:id";'));
    assert.match(source, /encodeURIComponent\(String\(args\[parameter\]\)\)/);
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
