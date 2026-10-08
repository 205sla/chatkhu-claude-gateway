// Explicit small real-account CLI test. Never part of npm test or CI.
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { AnthropicAdapter, validateModels } from '../src/adapters/anthropic.mjs';
import { findClaude, claudeVersion, runClaude, validateArgs } from '../src/launcher.mjs';
import { safeError } from '../src/errors.mjs';

if (!process.argv.includes('--confirm-cost')) {
  console.error('실제 크레딧을 사용합니다. 실행하려면 --confirm-cost를 추가하세요. 최대 3턴의 임시 파일 Read 검사입니다.');
  process.exit(1);
}
const dir = await mkdtemp(join(tmpdir(), 'chatkhu-live-cli-'));
const cwd = join(dir, '한글 live project & spaces');
const userDir = join(dir, 'claude-config');
let timer;
try {
  await mkdir(cwd); await mkdir(join(cwd, '.git')); await mkdir(userDir);
  await writeFile(join(cwd, 'fixture.txt'), 'CHATKHU_LIVE_READ_OK');
  const config = await loadConfig();
  const adapter = new AnthropicAdapter(config);
  validateModels(config, await adapter.models());
  const env = { ...process.env, CLAUDE_CONFIG_DIR: userDir, USERPROFILE: dir, HOME: dir, DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  delete env.CLAUDECODE;
  const binary = await findClaude(process.env);
  const stats = [];
  let stdout = '';
  let outputTooLarge = false;
  timer = setTimeout(() => process.emit('SIGINT'), 60000);
  const args = ['--print', 'Use the Read tool to read fixture.txt. Reply with exactly the marker from that file and nothing else.', '--allowedTools', 'Read', '--max-turns', '3', '--no-session-persistence', '--output-format', 'json'];
  validateArgs(args, [{ id: config.model }], config.aliases);
  const code = await runClaude({ ...config, dir: join(dir, 'gateway-config') }, {
    cwd, env, binary, args, stdio: 'pipe', gatewayOptions: { adapter, log: row => stats.push(row) },
    onChild(child) {
      child.stdout.on('data', chunk => { if (stdout.length < 1024 * 1024) stdout += chunk; else outputTooLarge = true; });
      // Do not dump raw diagnostics: the CLI, unlike our gateway, may include context.
      child.stderr.resume();
    },
  });
  assert.equal(code, 0);
  assert.equal(outputTooLarge, false);
  const result = stdout.split(/\r?\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).find(item => item?.type === 'result');
  assert.ok(result && !result.is_error);
  assert.ok(result.result.includes('CHATKHU_LIVE_READ_OK'));
  assert.ok(result.num_turns >= 2);
  assert.equal(result.permission_denials.length, 0);
  assert.deepEqual(await readdir(join(dir, 'gateway-config', 'sessions')), []);
  console.log(JSON.stringify({ result: 'PASS', nativeVersion: await claudeVersion(binary), selectedModel: config.model, modelUsageIds: Object.keys(result.modelUsage || {}), turns: result.num_turns, toolResultMarkerConfirmed: true, permissionDenials: 0, localAuthStyles: [...new Set(stats.filter(item => item.route === '/v1/messages').map(item => item.auth))], messageRequests: stats.filter(item => item.route === '/v1/messages').length, sessionsRemoved: true }, null, 2));
} catch (error) {
  console.error(`실계정 CLI 검사 실패: ${safeError(error)}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  // Exact mkdtemp directory, never a user project.
  await rm(dir, { recursive: true, force: true });
}
