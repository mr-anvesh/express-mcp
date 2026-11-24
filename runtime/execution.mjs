import { createServer, request } from 'node:http';
import { Duplex, PassThrough } from 'node:stream';

function buildPath(template, args) {
  const path = template.replace(/:([A-Za-z0-9_]+)/g, (_, key) => encodeURIComponent(args[key]));
  if (path.split('/').some((segment) => segment === '.' || segment === '..'))
    throw new Error('Invalid relative path segment');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(args.query ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, String(item));
  }
  const suffix = query.toString();
  return suffix ? path + '?' + suffix : path;
}

async function decode(method, status, statusText, contentType, body, limit) {
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${statusText}`);
  if (method === 'HEAD' || status === 204 || status === 205) return '';
  const type = contentType?.split(';')[0].trim().toLowerCase();
  const json = type === 'application/json' || type?.endsWith('+json');
  if (
    type === 'text/event-stream' ||
    (type &&
      !json &&
      !type.startsWith('text/') &&
      type !== 'application/xml' &&
      !type.endsWith('+xml'))
  ) {
    throw new Error('Unsupported tool response media type: ' + type);
  }
  const chunks = [];
  let size = 0;
  if (body)
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > limit) throw new Error('Tool response exceeded maxResponseBytes');
      chunks.push(chunk);
    }
  const text = Buffer.concat(chunks, size).toString('utf8');
  return text && json ? JSON.parse(text) : text;
}

function importedRequest(app, limit) {
  const contexts = new WeakMap();
  const server = createServer((req, res) => {
    const { principal, signal } = contexts.get(req.socket);
    if (principal) req.mcpPrincipal = principal;
    req.mcpSignal = signal;
    app(req, res);
  });
  return async (path, options, principal) => {
    const response = await new Promise((resolve, reject) => {
      function createConnection() {
        const input = new PassThrough();
        const output = new PassThrough();
        const peer = Duplex.from({ readable: input, writable: output });
        const client = Duplex.from({ readable: output, writable: input });
        contexts.set(peer, { principal, signal: options.signal });
        server.emit('connection', peer);
        return client;
      }
      const req = request(
        {
          createConnection,
          path,
          method: options.method,
          headers: options.headers,
          signal: options.signal,
        },
        resolve,
      );
      req.on('error', reject);
      req.end(options.body);
    });
    try {
      return await decode(
        options.method,
        response.statusCode,
        response.statusMessage,
        response.headers['content-type'],
        response,
        limit,
      );
    } finally {
      response.destroy();
    }
  };
}

export function createExecutor(config, app, delegate) {
  const limit = config.limits.maxResponseBytes;
  const dispatch = app
    ? importedRequest(app, limit)
    : async (path, options) => {
        const response = await fetch(config.expressBaseUrl + path, options);
        try {
          return await decode(
            options.method,
            response.status,
            response.statusText,
            response.headers.get('content-type'),
            response.body,
            limit,
          );
        } finally {
          if (!response.bodyUsed) await response.body?.cancel();
        }
      };
  return async (tool, args, signal, principal, accessToken) => {
    const { method, path } = tool.route;
    const headers = {};
    const options = { method, headers, signal };
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(args.body ?? {});
    }
    if (delegate) {
      const token = await Promise.resolve()
        .then(() => delegate({ principal, tool: tool.name, signal, accessToken }))
        .catch(() => {
          throw new Error('API credential delegation failed');
        });
      if (typeof token !== 'string' || !/^[A-Za-z0-9._~+/-]+=*$/.test(token))
        throw new Error('Invalid delegated API credential');
      if (token === accessToken) throw new Error('Delegate must return a separate API credential');
      headers.authorization = 'Bearer ' + token;
      options.redirect = 'error';
    }
    signal.throwIfAborted();
    return dispatch(buildPath(path, args), options, principal);
  };
}
