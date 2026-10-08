import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { harness, request, jsonResponse, modelList, message, body, sse, textEvents, listen, close } from './helpers.mjs';
import { startGateway } from '../src/gateway.mjs';
import { AnthropicAdapter } from '../src/adapters/anthropic.mjs';
import { runSmoke } from '../src/smoke.mjs';

test('raw JSON and future fields, both directions, header policy and safe metadata', async t => {
  const responseBytes = Buffer.from(` {"content":[],"stop_reason":"tool_use","usage":{"cache_read_input_tokens":9},"future":{"x":1}}\n`);
  const h = await harness(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'upstream-123', 'anthropic-ratelimit-tokens-remaining': '100', 'set-cookie': 'secret=cookie', connection: 'x-remove', 'x-remove': 'hop' }); res.end(responseBytes); });
  const raw = Buffer.from(' { "model":"claude-test-a", "system":[{"type":"text","text":"프롬프트 SECRET","cache_control":{"type":"ephemeral"}}], "messages":[{"role":"user","content":[{"type":"image","source":{"type":"base64","data":"AA==","media_type":"image/png"}}]}],"tools":[{"name":"read","input_schema":{"type":"object"}}],"tool_choice":{"type":"auto"},"thinking":{"type":"adaptive"},"output_config":{"effort":"high"},"future":{"unicode":"한글"} }\n');
  const response = await request(h.gateway, '/v1/messages/?beta=true&x=a%2Fb&x=2', { payload: raw, headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'future-beta-2099-01-01,thinking-x', 'anthropic-future': 'keep', cookie: 'do-not-forward', 'x-extra-secret': 'private', connection: 'x-hop', 'x-hop': 'drop' } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, responseBytes);
  assert.deepEqual(h.received[0].body, raw);
  assert.equal(h.received[0].url, '/v1/gateway/claude/v1/messages/?beta=true&x=a%2Fb&x=2');
  assert.equal(h.received[0].headers.authorization, `Bearer ${h.config.apiKey}`);
  assert.equal(h.received[0].headers['anthropic-beta'], 'future-beta-2099-01-01,thinking-x');
  assert.equal(h.received[0].headers['anthropic-future'], 'keep');
  for (const name of ['x-api-key', 'cookie', 'x-extra-secret', 'x-hop']) assert.equal(h.received[0].headers[name], undefined);
  assert.equal(Number(h.received[0].headers['content-length']), raw.length);
  assert.equal(response.headers['request-id'], 'upstream-123');
  assert.equal(response.headers['anthropic-ratelimit-tokens-remaining'], '100');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.headers['x-remove'], undefined);
  const logs = JSON.stringify(h.logs);
  for (const value of [h.gateway.token, h.config.apiKey, 'SECRET', 'private', 'do-not-forward', 'a%2Fb']) assert.ok(!logs.includes(value));
});

test('local Bearer / x-api-key, unauthorized health boundary, Host and Origin protections', async t => {
  const h = await harness(t, (_req, res) => jsonResponse(res, message()));
  for (const headers of [{}, { authorization: 'Bearer wrong' }, { 'x-api-key': h.config.apiKey }, { authorization: `Bearer ${h.gateway.token}`, 'x-api-key': 'wrong' }]) {
    assert.equal((await request(h.gateway, '/v1/messages', { auth: false, headers })).status, 401);
  }
  assert.equal(h.received.length, 0);
  assert.equal((await request(h.gateway, '/health', { method: 'GET', auth: false })).body.toString(), '{"status":"ok"}');
  assert.equal((await request(h.gateway, '/v1/messages', { auth: false, headers: { 'x-api-key': h.gateway.token } })).status, 200);
  for (const headers of [{ host: 'evil.example' }, { origin: 'null' }, { origin: 'https://evil.example' }, { 'sec-fetch-site': 'same-origin' }]) assert.equal((await request(h.gateway, '/v1/messages', { headers })).status, 403);
  assert.equal(h.received.length, 1);
});

test('Electron main-process fetch is authenticated while browser origins and cross-site requests stay blocked', async t => {
  const h = await harness(t, (req, res) => jsonResponse(res, req.method === 'GET' ? { data: modelList } : message()));
  const desktopHeaders = { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'empty' };
  assert.equal((await request(h.gateway, '/v1/models', { method: 'GET', auth: false, headers: desktopHeaders })).status, 401);
  assert.equal((await request(h.gateway, '/v1/messages', { auth: false, headers: { ...desktopHeaders, authorization: 'Bearer wrong' } })).status, 401);
  for (const headers of [
    { ...desktopHeaders, origin: 'null' },
    { ...desktopHeaders, origin: 'https://evil.example' },
    { ...desktopHeaders, origin: 'app://localhost' },
    { ...desktopHeaders, host: 'evil.example' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'same-origin' },
  ]) assert.equal((await request(h.gateway, '/v1/models', { method: 'GET', headers })).status, 403);
  assert.equal(h.received.length, 0);
  const models = await request(h.gateway, '/v1/models', { method: 'GET', headers: desktopHeaders });
  assert.equal(models.status, 200);
  assert.deepEqual(JSON.parse(models.body).data, modelList);
  assert.equal(models.headers['access-control-allow-origin'], undefined);
  assert.equal((await request(h.gateway, '/v1/messages', { headers: desktopHeaders })).status, 200);
  assert.equal(h.received.length, 2);
  for (const item of h.received) {
    assert.equal(item.headers.authorization, `Bearer ${h.config.apiKey}`);
    for (const name of Object.keys(desktopHeaders)) assert.equal(item.headers[name], undefined);
  }
});

test('models pagination and exact count_tokens path with query', async t => {
  const h = await harness(t, (req, res) => {
    if (req.url.includes('count_tokens')) return jsonResponse(res, { input_tokens: 321 });
    jsonResponse(res, req.url.includes('after_id') ? { data: [modelList[1]], has_more: false } : { data: [modelList[0]], has_more: true, last_id: modelList[0].id });
  });
  assert.deepEqual(await h.adapter.models(), modelList);
  assert.equal(h.received[1].url, '/v1/gateway/claude/v1/models?after_id=claude-test-a');
  const modelResponse = await request(h.gateway, '/v1/models/', { method: 'GET' });
  assert.equal(JSON.parse(modelResponse.body).data[0].id, 'claude-test-a');
  const count = await request(h.gateway, '/v1/messages/count_tokens/?beta=true', { payload: '{"system":"same"}' });
  assert.equal(JSON.parse(count.body).input_tokens, 321);
  assert.equal(h.received.at(-1).url, '/v1/gateway/claude/v1/messages/count_tokens/?beta=true');
  assert.equal((await request(h.gateway, '/v1/v1/messages')).status, 404);
});

test('SSE arrives before upstream completion; split UTF-8, thinking/signatures, tools, ping and error preserved', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const prefix = Buffer.from('event: ping\ndata: {"type":"ping"}\n\n');
  const tail = sse([
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '한글 사고' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'preserved-signature' } },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tool_A', name: 'Read', input: {} } },
    { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tool_B', name: 'Read', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"file_path":"B"}' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'path":"가"}' } },
    { type: 'future_event', value: 'unchanged' },
    { type: 'error', error: { type: 'overloaded_error', message: 'mock' } },
  ]);
  const h = await harness(t, async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(prefix);
    await gate;
    for (let i = 0; i < tail.length; i += 7) { res.write(tail.subarray(i, i + 7)); await delay(1); }
    res.end();
  });
  const { response } = await request(h.gateway, '/v1/messages', { raw: true });
  const first = await Promise.race([once(response, 'data').then(([chunk]) => chunk), delay(1500).then(() => { throw new Error('SSE was buffered'); })]);
  assert.deepEqual(first, prefix);
  const remaining = body(response);
  release();
  assert.deepEqual(Buffer.concat([first, await remaining]), Buffer.concat([prefix, tail]));
});

test('tool_use → tool_result → next model response preserves ids, args and usage', async t => {
  const tool = { type: 'tool_use', id: 'tool-exact-id', name: 'add', input: { a: 7, b: 5 } };
  const h = await harness(t, (_req, res, payload, n) => {
    const content = JSON.parse(payload);
    if (n === 1) return jsonResponse(res, message('claude-test-a', [tool], 'tool_use'));
    assert.deepEqual(content.messages.at(-2).content, [tool]);
    assert.equal(content.messages.at(-1).content[0].tool_use_id, tool.id);
    assert.equal(content.messages.at(-1).content[0].content, '12');
    jsonResponse(res, message('claude-test-a', [{ type: 'text', text: '12' }]));
  });
  const first = JSON.parse((await request(h.gateway)).body);
  const final = JSON.parse((await request(h.gateway, '/v1/messages', { payload: JSON.stringify({ messages: [{ role: 'assistant', content: first.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: '12' }] }] }) })).body);
  assert.equal(final.content[0].text, '12');
  assert.equal(final.usage.cache_read_input_tokens, 4);
});

test('all upstream error statuses/bodies/retry headers pass through without retries', async t => {
  let status;
  const bytes = Buffer.from('{"error":{"message":"private prompt fake-key"}}');
  const h = await harness(t, (_req, res) => { res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '3', 'x-request-id': 'req-upstream' }); res.end(bytes); });
  for (status of [400, 401, 402, 403, 404, 422, 429, 500, 503]) {
    const result = await request(h.gateway);
    assert.equal(result.status, status); assert.deepEqual(result.body, bytes);
    assert.equal(result.headers['retry-after'], '3'); assert.equal(result.headers['x-request-id'], 'req-upstream');
  }
  assert.equal(h.received.length, 9);
  assert.ok(!JSON.stringify(h.logs).includes('private prompt'));
});

test('redirects never followed or exposed, hanging and interrupted streams fail honestly', async t => {
  const h = await harness(t, (_req, res, _payload, n) => {
    if (n === 1) { res.writeHead(307, { location: 'https://other.example/stolen' }); res.end(); }
    if (n === 2) return;
    if (n === 3) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: ping\ndata: {}\n\n'); setTimeout(() => res.destroy(), 30); }
  }, { idleTimeoutMs: 120 });
  const redirect = await request(h.gateway);
  assert.equal(redirect.status, 502); assert.equal(redirect.headers.location, undefined);
  assert.equal(redirect.headers['x-chatkhu-upstream-status'], '307');
  // The downstream idle timeout can close earlier than an HTTP 504 is writable.
  const timeout = await request(h.gateway).catch(error => ({ disconnected: ['ECONNRESET', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code) }));
  assert.ok(timeout.status === 504 || timeout.disconnected);
  const { response } = await request(h.gateway, '/v1/messages', { raw: true });
  let received = '';
  response.on('data', chunk => { received += chunk; });
  await once(response, 'error');
  assert.ok(received.startsWith('event: ping'));
  assert.ok(!received.includes('gateway_error'));
  assert.equal(h.received.length, 3);
});

test('TLS connection timeout is bounded without disabling certificate validation', async t => {
  const sockets = new Set();
  const blackhole = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await listen(blackhole);
  const config = { baseUrl: `https://127.0.0.1:${blackhole.address().port}/claude`, apiKey: 'test-key', port: 0, maxRequestBytes: 1024, connectTimeoutMs: 50, idleTimeoutMs: 2000 };
  const gateway = await startGateway(config);
  t.after(async () => { await gateway.close(); for (const socket of sockets) socket.destroy(); await close(blackhole); });
  const result = await request(gateway);
  assert.equal(result.status, 504);
  assert.equal(JSON.parse(result.body).error.code, 'connect_timeout');
});

test('client cancellation aborts upstream and oversized uploads never reach it', async t => {
  let closed;
  const wasClosed = new Promise(resolve => { closed = resolve; });
  const h = await harness(t, (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: ping\n\n'); res.on('close', closed); }, { maxRequestBytes: 100 });
  assert.equal((await request(h.gateway, '/v1/messages', { payload: 'x'.repeat(101), headers: { 'content-length': '101' } })).status, 413);
  assert.equal((await request(h.gateway, '/v1/messages', { payload: 'x'.repeat(101), headers: { 'transfer-encoding': 'chunked' } })).status, 413);
  assert.equal(h.received.length, 0);
  const { response } = await request(h.gateway, '/v1/messages', { raw: true });
  response.destroy();
  await Promise.race([wasClosed, delay(1500).then(() => { throw new Error('upstream cancellation missing'); })]);
});

test('slow client backpressure bounds producer progress and preserves bytes', async t => {
  const count = 512;
  const chunk = Buffer.alloc(64 * 1024, 'z');
  let produced = 0;
  const expected = createHash('sha256');
  for (let i = 0; i < count; i++) expected.update(chunk);
  const h = await harness(t, async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    for (; produced < count; produced++) if (!res.write(chunk)) await once(res, 'drain');
    res.end();
  }, { idleTimeoutMs: 5000 });
  const { response } = await request(h.gateway, '/v1/messages', { raw: true });
  response.pause();
  await delay(120);
  assert.ok(produced < count, `producer ran to completion: ${produced}`);
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const data of response) { digest.update(data); bytes += data.length; }
  assert.equal(bytes, count * chunk.length);
  assert.equal(digest.digest('hex'), expected.digest('hex'));
});

test('port collisions reported; close cancels active requests and releases listener', async t => {
  const h = await harness(t, (_req, res) => jsonResponse(res, {}));
  const port = h.gateway.server.address().port;
  await assert.rejects(startGateway({ ...h.config, port }, { adapter: h.adapter }), { code: 'EADDRINUSE' });
  await h.gateway.close();
  const replacement = http.createServer();
  await new Promise((resolve, reject) => replacement.once('error', reject).listen(port, '127.0.0.1', resolve));
  await close(replacement);
});

test('complete smoke sequence exercises direct baseline and local routes only on explicit call', async t => {
  const h = await harness(t, (_req, res, payload) => {
    const data = JSON.parse(payload);
    if (data.stream) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse(textEvents())); return; }
    if (data.tool_choice) return jsonResponse(res, message('claude-test-a', [{ type: 'tool_use', id: 'tool1', name: 'chatkhu_add', input: { a: 7, b: 5 } }], 'tool_use'));
    jsonResponse(res, message('claude-test-a', [{ type: 'text', text: data.tools ? '12' : 'OK' }]));
  });
  const reports = [];
  const result = await runSmoke(h.config, h.adapter, { report: text => reports.push(text) });
  assert.equal(h.received.length, 5);
  assert.equal(reports.length, 4);
  assert.equal(result.direct, 'claude-test-a');
});
