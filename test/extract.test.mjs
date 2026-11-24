import assert from 'node:assert/strict';
import test from 'node:test';
import express4 from 'express';
import express5 from 'express5';
import { extractRoutes, generateMcpServer } from '../dist/index.js';

for (const [label, express] of [
  ['Express 4', express4],
  ['Express 5', express5],
]) {
  test(`${label}: preserves the full nested router mount path`, () => {
    const app = express();
    const api = express.Router();
    const v1 = express.Router();
    v1.get('/users/:id', () => {});
    api.use('/v1', v1);
    app.use('/api', api);

    const manifest = [{ method: 'GET', path: '/api/v1/users/:id' }];
    if (!app._router) assert.throws(() => extractRoutes(app), /Cannot infer Express router mount/);
    assert.deepEqual(extractRoutes(app, app._router ? undefined : manifest), [
      { method: 'GET', path: '/api/v1/users/:id', params: ['id'] },
    ]);
  });
}

test('reports a useful error when generating from an empty app', async () => {
  await assert.rejects(
    generateMcpServer(express4(), {
      mode: 'import',
      appModule: './app.js',
      outputPath: './unused.js',
    }),
    /No router found|No routes found/,
  );
});

test('opaque mounts fail before a prefix can be lost, including after dispatch', () => {
  const app = express5();
  const router = express5.Router();
  router.get('/detail', () => {});
  app.use('/:tenant', router);
  const layer = app.router.stack[0];
  layer.match('/existing');
  assert.throws(() => extractRoutes(app), /explicit routes/);
  assert.deepEqual(extractRoutes(app, [{ method: 'get', path: '/:tenant/detail' }]), [
    { method: 'GET', path: '/:tenant/detail', params: ['tenant'] },
  ]);
});

test('expands literal aliases and preserves strict trailing slashes', () => {
  const app = express5();
  app.enable('strict routing');
  app.get(['/first', '/alias/'], () => {});
  assert.deepEqual(
    extractRoutes(app).map((route) => route.path),
    ['/first', '/alias/'],
  );
});

test('rejects unsupported templates and ambiguous generated inputs', () => {
  for (const path of ['/a/*rest', '/a{/:id}', '/:query', '/:body', '/:id/:id', '/:constructor']) {
    assert.throws(
      () => extractRoutes(express5(), [{ method: 'POST', path }]),
      /Unsupported|Ambiguous/,
    );
  }
});
