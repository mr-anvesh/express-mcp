import pkg from '../package.json' with { type: 'json' };
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { setMaxListeners } from 'node:events';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';
import { serveHttp } from './http.mjs';
import { createExecutor } from './execution.mjs';

export function prepareTools(definitions) {
  const ajv = new Ajv2020({ strict: true, ownProperties: true, addUsedSchema: false });
  addFormats(ajv);
  const validator = new AjvJsonSchemaValidator(ajv);
  return definitions.map((tool) => ({
    tool,
    registration: {
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: fromJsonSchema(tool.inputSchema, validator),
      ...(tool.outputSchema && { outputSchema: fromJsonSchema(tool.outputSchema, validator) }),
    },
  }));
}

export async function start(config, definitions, app, delegate) {
  const { limits, http } = config;
  const execute = createExecutor(config, app, delegate);
  const tools = prepareTools(definitions);
  const state = {
    draining: false,
    active: 0,
    counters: new Map(),
    shutdown: new AbortController(),
  };
  setMaxListeners(0, state.shutdown.signal);
  function factory({ authInfo, requestInfo }) {
    const server = new McpServer(
      { name: 'express-mcp-server', version: pkg.version },
      { capabilities: { tools: {} } },
    );
    for (const { tool, registration } of tools) {
      const registered = server.registerTool(tool.name, registration, async (args, ctx) => {
        if (state.draining) throw new Error('Server is draining');
        if (state.active >= limits.maxConcurrentCalls)
          throw new Error('Tool concurrency limit reached');
        const deadline = new AbortController();
        const timeout = setTimeout(
          () => deadline.abort(new Error('Tool deadline exceeded')),
          limits.timeoutMs,
        );
        timeout.unref();
        const signals = [ctx.mcpReq.signal, state.shutdown.signal];
        if (requestInfo) signals.push(requestInfo.signal);
        const forwardAbort = (event) => deadline.abort(event.target.reason);
        for (const parent of signals) {
          if (parent.aborted) deadline.abort(parent.reason);
          else parent.addEventListener('abort', forwardAbort, { once: true });
        }
        const signal = deadline.signal;
        const principal = authInfo && {
          subject: authInfo.extra.subject,
          issuer: authInfo.extra.issuer,
          scopes: authInfo.scopes,
          clientId: authInfo.clientId,
        };
        const startTime = performance.now();
        const metric = state.counters.get(tool.name) ?? { calls: 0, errors: 0, totalMs: 0 };
        state.counters.set(tool.name, metric);
        state.active++;
        metric.calls++;
        let rejectOnAbort;
        const cancelled = new Promise((_, reject) => {
          rejectOnAbort = () => reject(signal.reason);
          if (signal.aborted) rejectOnAbort();
          else signal.addEventListener('abort', rejectOnAbort, { once: true });
        });
        // Keep the slot charged until the underlying operation settles, even
        // when an application-provided credential delegate ignores cancellation.
        const work = execute(tool, args, signal, principal, authInfo?.token).finally(() => {
          state.active--;
        });
        try {
          const result = await Promise.race([work, cancelled]);
          return {
            content: [
              { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) },
            ],
            structuredContent: result,
          };
        } catch (error) {
          metric.errors++;
          if (signal.aborted) throw signal.reason;
          throw error;
        } finally {
          signal.removeEventListener('abort', rejectOnAbort);
          for (const parent of signals) parent.removeEventListener('abort', forwardAbort);
          clearTimeout(timeout);
          metric.totalMs += performance.now() - startTime;
        }
      });
      if (
        http.oauth &&
        !http.oauth.toolScopes[tool.name].every((scope) => authInfo?.scopes.includes(scope))
      ) {
        registered.disable();
      }
    }
    return server;
  }

  if (config.transport === 'stdio') {
    serveStdio(factory, {
      transport: new StdioServerTransport(process.stdin, process.stdout, {
        maxBufferSize: limits.maxFrameBytes,
      }),
    });
    return;
  }
  await serveHttp(config, factory, state);
}
