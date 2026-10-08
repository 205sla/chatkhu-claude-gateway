import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm, copyFile, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { harness, jsonResponse, modelList } from './helpers.mjs';
import { findClaude, runClaude, validateArgs } from '../src/launcher.mjs';
import { normalizeBase, loadConfig, saveConfig } from '../src/config.mjs';
import { validateModels } from '../src/adapters/anthropic.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'chatkhu-test-'));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return dir;
}
async function fixture(t, overrides = {}) {
  const dir = await temporary(t);
  const cwd = join(dir, '한글 project & percent% ! ^ (괄호)');
  const userDir = join(dir, 'user-config');
  const packageRoot = join(dir, 'npm space', 'node_modules', '@anthropic-ai', 'claude-code');
  await mkdir(join(cwd, '.claude'), { recursive: true });
  await mkdir(userDir, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await mkdir(join(cwd, '.git'));
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-code', bin: { claude: 'cli.mjs' } }));
  await copyFile(join(root, 'test', 'fixtures', 'fake-claude.mjs'), join(packageRoot, 'cli.mjs'));
  const shim = join(dir, 'npm space', 'claude.cmd');
  await writeFile(shim, '@echo this shim must never run\r\nexit /b 99\r\n');
  const original = JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://old.example/claude', ANTHROPIC_AUTH_TOKEN: 'old-token', ANTHROPIC_CUSTOM_HEADERS: 'Authorization: old', CLAUDE_CODE_USE_BEDROCK: '1' }, model: 'old-model', hooks: { Stop: [] }, permissions: { defaultMode: 'default' } });
  await writeFile(join(userDir, 'settings.json'), original);
  await writeFile(join(cwd, '.claude', 'settings.local.json'), original);
  const report = join(dir, 'probe.json');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: userDir, CHATKHU_CLAUDE_BIN: shim, CHATKHU_API_KEY: 'fake-upstream-key-only-for-tests', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_OAUTH_TOKEN: 'old-oauth', GATEWAY_TEST_REPORT: report, ...overrides };
  // Do not inherit test-mode switches from unrelated environments.
  return { dir, cwd, userDir, original, env, report };
}

test('HTTPS config and duplicate /v1 rejected; public CLI cannot enable mock HTTP', async t => {
  assert.equal(normalizeBase('https://institution.example/v1/gateway/'), 'https://institution.example/v1/gateway/claude');
  for (const url of ['http://127.0.0.1/claude', 'https://x/claude/v1', 'https://x/claude/v1/messages', 'https://key@x/claude', 'https://x/claude?key=secret']) assert.throws(() => normalizeBase(url));
  const dir = await temporary(t);
  await assert.rejects(loadConfig({ CHATKHU_CONFIG_DIR: dir, CHATKHU_API_KEY: 'fake', CHATKHU_BASE_URL: 'http://127.0.0.1/claude', CHATKHU_TEST_ALLOW_HTTP: '1' }), /HTTPS/);
});

test('settings persist with restricted permissions; env/file credentials never enter config JSON', async t => {
  const dir = await temporary(t);
  const env = { CHATKHU_CONFIG_DIR: join(dir, 'private') };
  await saveConfig({ baseUrl: 'https://institution.example/claude', model: 'claude-test-a', aliases: { opus: 'claude-test-a' } }, { apiKey: 'fake-test-key' }, env);
  const config = await loadConfig(env);
  assert.equal(config.apiKey, 'fake-test-key');
  assert.ok(!(await readFile(join(config.dir, 'config.json'), 'utf8')).includes('fake-test-key'));
  if (process.platform !== 'win32') assert.equal((await stat(join(config.dir, 'credentials.key'))).mode & 0o777, 0o600);
  else {
    const acl = (await exec('icacls.exe', [join(config.dir, 'credentials.key')], { windowsHide: true })).stdout;
    assert.ok(!acl.includes('(I)'));
  }
});

test('real child process preserves cwd/argv, secrets stay out of argv/env, settings preserved, cleanup on error exit', async t => {
  const f = await fixture(t, { GATEWAY_TEST_EXIT: '7' });
  const h = await harness(t, (_req, res) => jsonResponse(res, {}));
  const args = ['--print', '한글 space & | %TEMP% ! ^ $(whoami) `echo` "quotes"\nsecond line', '--name', 'test name'];
  const binary = await findClaude(f.env);
  assert.equal(binary.kind, 'npm-node');
  const code = await runClaude({ ...h.config, dir: join(f.dir, 'gateway-config') }, { cwd: f.cwd, args, env: f.env, binary, gatewayOptions: { adapter: h.adapter }, stdio: 'pipe', notify: () => {} });
  assert.equal(code, 7);
  const result = JSON.parse(await readFile(f.report, 'utf8'));
  // macOS may expose tmpdir() via /var while the child's cwd resolves to /private/var.
  assert.equal(await realpath(result.cwd), await realpath(f.cwd));
  assert.deepEqual(result.args, args);
  assert.equal(result.status, 200); assert.equal(result.upstreamKeyInEnv, false); assert.equal(result.secretInArgv, false);
  assert.ok(result.providerDisabled && result.oauthCleared);
  assert.equal(result.aliases.OPUS, 'claude-test-a'); assert.equal(result.aliases.SONNET, 'claude-test-b');
  assert.equal(await readFile(join(f.userDir, 'settings.json'), 'utf8'), f.original);
  assert.equal(await readFile(join(f.cwd, '.claude', 'settings.local.json'), 'utf8'), f.original);
  assert.deepEqual(await readdir(join(f.dir, 'gateway-config', 'sessions')), []);
  await assert.rejects(fetch(`${result.localUrl}/health`));
});

test('foreground SIGINT handler shuts down its own real child tree and listener', async t => {
  const f = await fixture(t, { GATEWAY_TEST_WAIT: '1' });
  // POSIX resolves the npm entrypoint directly.
  f.env.CHATKHU_CLAUDE_BIN = join(dirname(f.env.CHATKHU_CLAUDE_BIN), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.mjs');
  const h = await harness(t, (_req, res) => jsonResponse(res, {}));
  const running = runClaude({ ...h.config, dir: join(f.dir, 'gateway-config') }, { cwd: f.cwd, args: [], env: f.env, gatewayOptions: { adapter: h.adapter }, stdio: 'ignore', notify: () => {} });
  let result;
  for (let i = 0; i < 100; i++) { try { result = JSON.parse(await readFile(f.report, 'utf8')); break; } catch { await delay(50); } }
  assert.ok(result);
  // Windows Node kill(SIGINT) is a force kill, so deliver the handler event directly.
  // Separate PTY verification covers the real console Ctrl+C input.
  process.emit('SIGINT');
  assert.equal(await running, 130);
  await assert.rejects(fetch(`${result.localUrl}/health`));
  assert.deepEqual(await readdir(join(f.dir, 'gateway-config', 'sessions')), []);
  let nestedAlive = true;
  for (let i = 0; i < 20; i++) { try { process.kill(result.nestedPid, 0); await delay(50); } catch { nestedAlive = false; break; } }
  assert.equal(nestedAlive, false);
});

test('existing helper/policy conflicts stop before launching, models and lifecycle args fail closed', async t => {
  const f = await fixture(t);
  const h = await harness(t, (_req, res) => jsonResponse(res, {}));
  for (const settings of [{ apiKeyHelper: 'do-not-run' }, { forceLoginMethod: 'claudeai' }]) {
    await writeFile(join(f.userDir, 'settings.json'), JSON.stringify(settings));
    await assert.rejects(runClaude({ ...h.config, dir: join(f.dir, 'gateway-config') }, { cwd: f.cwd, env: f.env, gatewayOptions: { adapter: h.adapter }, notify: () => {} }));
  }
  assert.equal(h.received.length, 0);
  for (const args of [['--settings', '{}'], ['--cloud'], ['--bg'], ['--model', 'gpt-test']]) assert.throws(() => validateArgs(args, modelList, h.config.aliases));
  assert.doesNotThrow(() => validateArgs(['--model', 'sonnet', '--print', 'hello'], modelList, h.config.aliases));
  assert.throws(() => validateModels({ model: 'invented', aliases: {} }, modelList));
});

test('public CLI help, no-key doctor, smoke consent and secret-argument rejection run without network', async t => {
  const dir = await temporary(t);
  const env = { ...process.env, CHATKHU_CONFIG_DIR: dir, CHATKHU_API_KEY: '', CHATKHU_KEY_FILE: join(dir, 'absent.key') };
  const help = await exec(process.execPath, ['bin/chatkhu.mjs', '--help'], { cwd: root, env });
  assert.ok(help.stdout.includes('setup'));
  for (const args of [['smoke'], ['setup', '--api-key', 'DO-NOT-ECHO-SECRET']]) {
    const error = await exec(process.execPath, ['bin/chatkhu.mjs', ...args], { cwd: root, env }).catch(error => error);
    assert.equal(error.code, 1);
    assert.ok(!error.stderr.includes('DO-NOT-ECHO-SECRET'));
  }
  const error = await exec(process.execPath, ['bin/chatkhu.mjs', 'doctor'], { cwd: root, env }).catch(error => error);
  assert.equal(error.code, 1);
  assert.ok(error.stderr.includes('API 키가 없습니다'));
});
