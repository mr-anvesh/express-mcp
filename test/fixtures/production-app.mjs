import express from 'express';

const app = express();
app.use(express.json());
app.get('/identity', (req, res) =>
  res.json(req.mcpPrincipal ?? { credential: req.headers.authorization }),
);
app.get('/empty', (_req, res) => res.end(''));
app.post('/echo', (req, res) => res.json(req.body));
app.get('/large', (_req, res) => res.end('x'.repeat(4096)));
app.get('/wait', (_req, res) => {
  const timer = setTimeout(() => res.json({ finished: true }), 400);
  res.on('close', () => clearTimeout(timer));
});
export default app;

// A cooperative long-running operation with an observable lifecycle.
const jobs = new Map();
app.get('/jobs/:id/wait', (req, res) => {
  const id = req.params.id;
  jobs.set(id, 'running');
  if (req.mcpSignal) {
    req.mcpSignal.addEventListener('abort', () => jobs.set(id, 'signal received'), { once: true });
  } else {
    res.once('close', () => jobs.set(id, 'connection closed'));
  }
});
app.get('/jobs/:id/status', (req, res) =>
  res.json({ state: jobs.get(req.params.id) ?? 'unknown' }),
);
