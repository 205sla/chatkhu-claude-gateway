import http from 'node:http';
import { once } from 'node:events';
import { AnthropicAdapter } from '../src/adapters/anthropic.mjs';
import { startGateway } from '../src/gateway.mjs';

export async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
export async function close(server) { const result = new Promise(resolve => server.close(resolve)); server.closeAllConnections?.(); await result; }
export async function body(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks); }
export const modelList = [{ id: 'claude-test-a', type: 'model' }, { id: 'claude-test-b', type: 'model' }];
export const jsonResponse = (response, value, status = 200, headers = {}) => { response.writeHead(status, { 'content-type': 'application/json', ...headers }); response.end(JSON.stringify(value)); };

export async function harness(t, handler, overrides = {}) {
  const received = [];
  const upstream = http.createServer(async (request, response) => {
    const payload = await body(request);
    received.push({ url: request.url, headers: request.headers, body: payload });
    try { await handler(request, response, payload, received.length); }
    catch { response.destroy(); }
  });
  const url = await listen(upstream);
  const config = { baseUrl: `${url}/v1/gateway/claude`, apiKey: 'fake-upstream-key-only-for-tests', model: 'claude-test-a', aliases: { opus: 'claude-test-a', sonnet: 'claude-test-b', haiku: 'claude-test-a', fable: 'claude-test-b' }, port: 0, connectTimeoutMs: 1000, idleTimeoutMs: 3000, maxRequestBytes: 25000000, ...overrides };
  const logs = [];
  const adapter = new AnthropicAdapter(config, { testOnlyAllowHttp: true });
  const gateway = await startGateway(config, { adapter, log: item => logs.push(item) });
  t.after(async () => { await gateway.close(); await close(upstream); });
  return { gateway, config, adapter, upstream, received, logs };
}

export function request(gateway, path = '/v1/messages', { method = 'POST', headers = {}, payload = '{}', auth = true, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${gateway.url}${path}`, { method, headers: { ...(auth ? { authorization: `Bearer ${gateway.token}` } : {}), ...headers } }, async response => {
      if (raw) { resolve({ req, response }); return; }
      try { resolve({ status: response.statusCode, headers: response.headers, body: await body(response) }); } catch (error) { reject(error); }
    });
    req.on('error', reject);
    req.end(method === 'GET' ? undefined : payload);
  });
}

export function message(model = 'claude-test-a', content = [{ type: 'text', text: 'OK' }], stop_reason = 'end_turn') {
  return { id: 'msg_mock', type: 'message', role: 'assistant', model, content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: 4 } };
}

export function sse(events) { return Buffer.from(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')); }
export function textEvents(model = 'claude-test-a', text = 'OK') {
  return [
    { type: 'message_start', message: { ...message(model, [], null), usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ];
}
