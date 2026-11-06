import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { generateMcpServer } from '../dist/index.js';

function createApp() {
  const app = express();
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
}

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'express-mcp-'));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('creates missing nested parent directories', async () => {
  await withTempDir(async dir => {
    const outputPath = path.join(dir, 'nested', 'deep', 'mcp.ts');

    await generateMcpServer(createApp(), {
      expressBaseUrl: 'http://localhost:3000',
      outputPath,
    });

    const content = await fs.readFile(outputPath, 'utf-8');
    assert.match(content, /name: 'get_ping'/);
  });
});

test('writes into an existing parent directory and overwrites the output file', async () => {
  await withTempDir(async dir => {
    const parent = path.join(dir, 'existing');
    const outputPath = path.join(parent, 'mcp.ts');
    const sentinel = 'STALE SENTINEL';
    await fs.mkdir(parent);
    await fs.writeFile(outputPath, sentinel);

    await generateMcpServer(createApp(), {
      expressBaseUrl: 'http://localhost:3000',
      outputPath,
    });

    const content = await fs.readFile(outputPath, 'utf-8');
    assert.ok(!content.includes(sentinel));
    assert.match(content, /name: 'get_ping'/);
  });
});

test('rejects when the parent path is an existing file', async () => {
  await withTempDir(async dir => {
    const blocker = path.join(dir, 'blocker');
    await fs.writeFile(blocker, 'not a directory');
    const outputPath = path.join(blocker, 'mcp.ts');

    await assert.rejects(
      generateMcpServer(createApp(), {
        expressBaseUrl: 'http://localhost:3000',
        outputPath,
      }),
      error => error.code === 'EEXIST' || error.code === 'ENOTDIR'
    );
  });
});
