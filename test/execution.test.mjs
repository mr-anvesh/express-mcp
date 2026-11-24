import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import express from 'express';
import { generateMcpServer } from '../dist/index.js';
import app, { namedApp, routes } from './fixtures/execution-app.mjs';

for (const mode of ['proxy', 'import-default', 'import-named']) {
  test(
    `${mode}: official MCP client discovers and executes Express routes`,
    { timeout: 15_000 },
    async (t) => {
      const outputPath = join(
        await mkdtemp(fileURLToPath(new URL('express-mcp-', import.meta.url))),
        'server.cjs',
      );
      t.after(() => rm(dirname(outputPath), { recursive: true, force: true }));
      const target = mode === 'import-named' ? namedApp : app;
      let execution;
      if (mode === 'proxy') {
        const upstream = express();
        upstream.use('/service', target);
        const listener = upstream.listen(0, '127.0.0.1');
        await once(listener, 'listening');
        t.after(() => new Promise((resolve) => listener.close(resolve)));
        execution = { expressBaseUrl: `http://127.0.0.1:${listener.address().port}/service/` };
      } else {
        execution = {
          mode: 'import',
          appModule: '../fixtures/execution-app.mjs',
          ...(mode === 'import-named' ? { appExport: 'namedApp' } : {}),
        };
      }

      await generateMcpServer(target, { ...execution, routes, outputPath, typescript: false });
      const client = new Client(
        { name: 'integration-test', version: '1' },
        { versionNegotiation: { mode: { pin: '2026-07-28' } } },
      );
      t.after(() => client.close());
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [outputPath],
          cwd: tmpdir(),
          stderr: 'pipe',
        }),
      );
      const discovery = await client.discover();
      assert.ok(discovery.supportedVersions.includes('2026-07-28'));
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), [
        'get_api_denied',
        'get_api_empty',
        'post_api_items_by_id',
      ]);
      await Promise.all(
        ['a/b +', 'second'].map(async (id) => {
          const result = await client.callTool({
            name: 'post_api_items_by_id',
            arguments: { id, body: { title: id }, query: { tag: ['a', 'b'], page: 2 } },
          });
          assert.ok(!result.isError, JSON.stringify(result.content));
          assert.deepEqual(result.structuredContent, {
            id,
            middleware: 'ran',
            query: { tag: ['a', 'b'], page: '2' },
            body: { title: id },
          });
        }),
      );
      const empty = await client.callTool({ name: 'get_api_empty' });
      assert.ok(!empty.isError);
      assert.equal(empty.content[0].text, '');
      const failure = await client.callTool({ name: 'get_api_denied' });
      assert.equal(failure.isError, true);
      assert.match(failure.content[0].text, /HTTP 403/);
    },
  );
}
