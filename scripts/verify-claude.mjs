// Explicit, optional integration verification. No ChatKHU key or real inference.
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { findClaude, claudeVersion, runClaude } from '../src/launcher.mjs';
import { AnthropicAdapter } from '../src/adapters/anthropic.mjs';
import { body, listen, close, message, jsonResponse, sse, textEvents } from '../test/helpers.mjs';

const dir = await mkdtemp(join(tmpdir(), 'chatkhu-real-cli-mock-'));
const cwd = join(dir, '한글 mock project & spaces');
const userDir = join(dir, 'claude-config');
await mkdir(cwd); await mkdir(join(cwd, '.git')); await mkdir(userDir);
const target = join(cwd, 'fixture.txt');
const marker = 'CHATKHU_MOCK_READ_OK';
await writeFile(target, marker);
const priorSettings = JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1', ANTHROPIC_AUTH_TOKEN: 'intentionally-wrong', ANTHROPIC_CUSTOM_HEADERS: 'Authorization: intentionally-wrong' }, model: 'intentionally-wrong', permissions: { allow: ['Read'] } });
await writeFile(join(userDir, 'settings.json'), priorSettings);
const records = [];
const localRecords = [];
let toolResultSeen = false;
const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith('/v1/gateway/claude/v1/models')) return jsonResponse(response, { data: [{ id: 'claude-sonnet-4-6', type: 'model', display_name: 'Mock only', created_at: '2026-01-01T00:00:00Z' }], has_more: false });
    const raw = await body(request);
    const data = raw.length ? JSON.parse(raw) : {};
    if (request.url.includes('count_tokens')) return jsonResponse(response, { input_tokens: 123 });
    if (!request.url.startsWith('/v1/gateway/claude/v1/messages')) return jsonResponse(response, {}, 404);
    const tool = data.tools?.find(item => item.name === 'Read');
    const results = data.messages?.flatMap(item => Array.isArray(item.content) ? item.content : []).filter(item => item.type === 'tool_result' && item.tool_use_id === 'tool_read_mock') || [];
    if (results.some(item => JSON.stringify(item.content).includes(marker))) toolResultSeen = true;
    records.push({ model: data.model, stream: data.stream === true, system: Boolean(data.system?.length), tools: data.tools?.length || 0, toolResult: results.length > 0, authIsUpstreamKey: request.headers.authorization === 'Bearer fake-only-mock-upstream-key', betaPresent: Boolean(request.headers['anthropic-beta']) });
    let content = [{ type: 'text', text: 'MOCK_CLI_OK' }];
    let reason = 'end_turn';
    if (tool && !results.length && !toolResultSeen) { content = [{ type: 'tool_use', id: 'tool_read_mock', name: 'Read', input: { file_path: target } }]; reason = 'tool_use'; }
    if (!data.stream) return jsonResponse(response, message(data.model, content, reason));
    let events = textEvents(data.model, 'MOCK_CLI_OK');
    if (reason === 'tool_use') events = [
      { type: 'message_start', message: { ...message(data.model, [], null), usage: { input_tokens: 100, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { ...content[0], input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(content[0].input).slice(0, 12) } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(content[0].input).slice(12) } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } },
      { type: 'message_stop' },
    ];
    response.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': 'mock-request' });
    for (const event of events) response.write(sse([event]));
    response.end();
  } catch { response.destroy(); }
});
const upstream = await listen(server);
const config = { dir: join(dir, 'gateway-config'), baseUrl: `${upstream}/v1/gateway/claude`, apiKey: 'fake-only-mock-upstream-key', model: 'claude-sonnet-4-6', aliases: Object.fromEntries(['opus', 'sonnet', 'haiku', 'fable'].map(key => [key, 'claude-sonnet-4-6'])), port: 0, maxRequestBytes: 25000000, connectTimeoutMs: 2000, idleTimeoutMs: 10000 };
const env = { ...process.env, CLAUDE_CONFIG_DIR: userDir, USERPROFILE: dir, HOME: dir, DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY: '1' };
for (const name of Object.keys(env)) if (name.startsWith('CHATKHU_') || name === 'CLAUDECODE') delete env[name];
const binary = await findClaude(process.env);
const adapter = new AnthropicAdapter(config, { testOnlyAllowHttp: true });
const interactive = process.argv.includes('--interactive');
const timer = setTimeout(() => process.emit('SIGINT'), interactive ? 180000 : 60000);
try {
  console.log(`실제 Claude CLI ${await claudeVersion(binary)} → 로컬 mock (실계정 호출 아님)`);
  const code = await runClaude(config, {
    cwd, env, binary, gatewayOptions: { adapter, log: item => localRecords.push(item) },
    args: interactive ? [] : ['--print', `Read fixture.txt using the Read tool, then reply MOCK_CLI_OK.`, '--allowedTools', 'Read', '--max-turns', '3', '--no-session-persistence', '--output-format', 'json'],
    stdio: interactive ? 'inherit' : 'ignore',
  });
  if (!interactive) {
    assert.equal(code, 0, 'Claude CLI exit');
    assert.ok(toolResultSeen, 'Read tool result was not returned to the model');
    assert.ok(records.some(item => item.system && item.tools > 0 && item.stream));
    assert.ok(records.every(item => item.authIsUpstreamKey));
    assert.ok(localRecords.some(item => item.auth === 'bearer' || item.auth === 'both'));
  }
  const afterSettings = await readFile(join(userDir, 'settings.json'), 'utf8');
  if (interactive) {
    // Onboarding can save a theme; connection/model/permissions must stay intact.
    const after = JSON.parse(afterSettings);
    for (const key of ['env', 'model', 'permissions']) assert.deepEqual(after[key], JSON.parse(priorSettings)[key]);
  } else assert.equal(afterSettings, priorSettings);
  assert.deepEqual(await readdir(join(config.dir, 'sessions')), []);
  console.log(JSON.stringify({ result: 'PASS', mode: interactive ? 'interactive' : 'print', exitCode: code, nativeVersion: await claudeVersion(binary), toolResultSeen, requests: records, localAuthStyles: [...new Set(localRecords.map(item => item.auth))], connectionSettingsPreserved: true, sessionsRemoved: true }, null, 2));
} finally {
  clearTimeout(timer);
  await close(server);
  // dir is the exact mkdtemp result in the system temporary directory.
  await rm(dir, { recursive: true, force: true });
}
