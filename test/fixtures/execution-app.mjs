import express from 'express';
import express5 from 'express5';

function buildApp(framework) {
  const app = framework();
  const router = framework.Router();
  app.use(framework.json());
  app.use((_req, res, next) => {
    res.locals.middleware = 'ran';
    next();
  });
  router.post('/items/:id', (req, res) => {
    res.status(201).json({
      middleware: res.locals.middleware,
      id: req.params.id,
      query: req.query,
      body: req.body,
    });
  });
  router.get('/empty', (_req, res) => res.status(204).end());
  router.get('/denied', (_req, res) => res.sendStatus(403));
  app.use('/api', router);
  return app;
}

export default buildApp(express);
export const namedApp = buildApp(express5);

export const routes = [
  { method: 'POST', path: '/api/items/:id' },
  { method: 'GET', path: '/api/empty' },
  { method: 'GET', path: '/api/denied' },
];
