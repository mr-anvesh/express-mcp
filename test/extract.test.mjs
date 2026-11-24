import assert from 'node:assert/strict';
import test from 'node:test';
import express4 from 'express';
import express5 from 'express5';
import { extractRoutes } from '../dist/index.js';

for (const [label, express] of [
  ['Express 4', express4],
  ['Express 5', express5],
]) {
  test(`${label}: extracts nested router mount paths`, () => {
    const app = express();
    const api = express.Router();
    const v1 = express.Router();
    v1.get('/users/:id', () => {});
    api.use('/v1', v1);
    app.use('/api', api);

    assert.deepEqual(extractRoutes(app), [
      { method: 'GET', path: '/api/v1/users/:id', params: ['id'] },
    ]);
  });
}

test('reports a useful error for an Express 4 app without routes', () => {
  assert.throws(() => extractRoutes(express4()), /No router found/);
});
