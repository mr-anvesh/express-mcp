import type { GenerateOptions } from './types.js';

const defaults = {
  timeoutMs: 30_000,
  maxConcurrentCalls: 32,
  maxResponseBytes: 1_048_576,
  maxFrameBytes: 1_048_576,
  drainTimeoutMs: 10_000,
};

function authorizationUrl(value: string) {
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'OAuth URLs must use HTTPS (or HTTP on loopback) and contain no credentials, query or fragment.',
    );
  }
}

export function validateOptions(options: GenerateOptions, names: string[]) {
  const transport = options.transport ?? 'stdio';
  if (!['stdio', 'streamable-http'].includes(transport))
    throw new Error('Unsupported MCP transport.');
  const http = options.http ?? {};
  const limits = { ...defaults, ...options.limits };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
      throw new Error('Invalid limit: ' + name);
  }
  let expressBaseUrl;
  if (options.mode === 'import') {
    if (
      typeof options.appModule !== 'string' ||
      !options.appModule.trim() ||
      options.expressBaseUrl !== undefined ||
      (options.appExport !== undefined &&
        (typeof options.appExport !== 'string' || !options.appExport.trim()))
    )
      throw new Error(
        'Import mode requires appModule, an optional nonempty appExport, and no expressBaseUrl.',
      );
  } else {
    if (
      (options.mode !== undefined && options.mode !== 'proxy') ||
      !options.expressBaseUrl ||
      options.appModule !== undefined ||
      options.appExport !== undefined
    )
      throw new Error('Proxy mode requires expressBaseUrl.');
    const url = new URL(options.expressBaseUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error('Invalid API base URL.');
    expressBaseUrl = url.href.replace(/\/$/, '');
  }
  if (
    http.authTokenEnv !== undefined &&
    (!http.authTokenEnv.trim() || http.authToken !== undefined)
  )
    throw new Error('Use one nonempty HTTP token setting.');
  if (http.authToken !== undefined && !http.authToken.trim()) throw new Error('Empty HTTP token.');
  if (
    http.maxBodySize !== undefined &&
    (!Number.isSafeInteger(http.maxBodySize) || http.maxBodySize <= 0)
  )
    throw new Error('Invalid maxBodySize.');
  for (const name of Object.keys(options.contracts ?? {}))
    if (!names.includes(name)) throw new Error('Contract refers to an unselected tool: ' + name);
  const host = http.host ?? '127.0.0.1';
  if (
    http.allowedHosts !== undefined &&
    (!Array.isArray(http.allowedHosts) ||
      !http.allowedHosts.length ||
      !http.allowedHosts.every((h) => typeof h === 'string' && h.length && !/[\s/@?#]/.test(h)))
  )
    throw new Error('Invalid allowedHosts.');
  if (['0.0.0.0', '::'].includes(host) && !http.allowedHosts?.length)
    throw new Error('Set allowedHosts for a wildcard bind address.');
  if (http.oauth) {
    const auth = http.oauth;
    if (
      transport !== 'streamable-http' ||
      http.authTokenEnv !== undefined ||
      http.authToken !== undefined
    )
      throw new Error(
        'OAuth requires Streamable HTTP and is exclusive with a shared bearer token.',
      );
    for (const value of [auth.resource, auth.issuer, auth.jwksUri]) authorizationUrl(value);
    if (!auth.toolScopes || typeof auth.toolScopes !== 'object')
      throw new Error('OAuth requires toolScopes.');
    for (const name of names) {
      const scopes = auth.toolScopes[name];
      if (
        !Object.hasOwn(auth.toolScopes, name) ||
        !Array.isArray(scopes) ||
        !scopes.every((s) => typeof s === 'string' && /^[\x21\x23-\x5B\x5D-\x7E]+$/.test(s))
      )
        throw new Error('Set the required OAuth scopes for tool ' + name);
    }
    if (
      options.mode !== 'import' &&
      (typeof auth.delegateModule !== 'string' || !auth.delegateModule.trim())
    )
      throw new Error(
        'OAuth proxy mode requires delegateModule to obtain a separate backend credential.',
      );
    if (expressBaseUrl) authorizationUrl(expressBaseUrl);
    if (options.mode === 'import' && auth.delegateModule !== undefined)
      throw new Error('delegateModule is for proxy mode only.');
  }
  return {
    transport,
    http,
    limits,
    port: options.mcpPort ?? 3001,
    expressBaseUrl,
  };
}
