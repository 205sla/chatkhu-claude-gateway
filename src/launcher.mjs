import { access, readFile, realpath, stat } from 'node:fs/promises';
import { delimiter, dirname, extname, join, resolve, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ALIASES } from './config.mjs';
import { GatewayError } from './errors.mjs';
import { sessionDir, writePrivate, removeSession } from './private-files.mjs';
import { startGateway } from './gateway.mjs';

const exec = promisify(execFile);
const providers = ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_AWS'];
const credentialVars = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_CUSTOM_HEADERS', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR', 'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR'];
const unsupported = new Set(['--settings', '--setting-sources', '--cloud', '--remote-control', '--remote-control-session-name-prefix', '--bg', '--background', '--teleport', '--tmux']);

async function exists(path) { try { await access(path); return true; } catch { return false; } }

async function npmEntry(packageRoot) {
  try {
    const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (pkg.name !== '@anthropic-ai/claude-code') return null;
    const name = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.claude;
    if (typeof name !== 'string') return null;
    const root = await realpath(packageRoot);
    const target = await realpath(resolve(root, name));
    const diff = relative(root, target);
    if (diff.startsWith('..') || isAbsolute(diff)) return null;
    return executableFile(target, false);
  } catch { return null; }
}

async function executableFile(path, verifyJs = true) {
  if (!(await exists(path)) || !(await stat(path)).isFile()) return null;
  const extension = extname(path).toLowerCase();
  if (['.cmd', '.bat', '.ps1'].includes(extension)) return npmEntry(join(dirname(path), 'node_modules', '@anthropic-ai', 'claude-code'));
  if (['.js', '.cjs', '.mjs'].includes(extension)) {
    if (verifyJs) {
      let ancestor = dirname(path);
      for (let i = 0; i < 4; i++) {
        const candidate = await npmEntry(ancestor);
        if (candidate?.args?.[0] === await realpath(path)) return candidate;
        ancestor = dirname(ancestor);
      }
      return null;
    }
    return { command: process.execPath, args: [path], kind: 'npm-node' };
  }
  if (process.platform === 'win32' && extension !== '.exe') return null;
  return { command: path, args: [], kind: 'native' };
}

export async function findClaude(env = process.env) {
  if (env.CHATKHU_CLAUDE_BIN) {
    const file = await executableFile(resolve(env.CHATKHU_CLAUDE_BIN));
    if (file) return file;
    throw new GatewayError('claude_binary', 'CHATKHU_CLAUDE_BIN은 native 실행 파일 또는 검증된 Claude npm entrypoint여야 합니다. 셸 shim을 직접 실행하지 않습니다.');
  }
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const dir of (env.PATH || env.Path || '').split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const path = join(dir.replace(/^"|"$/g, ''), name);
      const file = await executableFile(path);
      if (file) return file;
      if (process.platform !== 'win32' && await exists(path)) return { command: path, args: [], kind: 'native-or-npm' };
    }
  }
  const native = await executableFile(join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'));
  if (native) return native;
  throw new GatewayError('claude_missing', 'Claude Code를 찾지 못했습니다. 공식 설치 후 새 터미널을 열거나 CHATKHU_CLAUDE_BIN을 지정하세요.');
}

export async function claudeVersion(binary, env = process.env) {
  try {
    const result = await exec(binary.command, [...binary.args, '--version'], { env, timeout: 15000, windowsHide: true, maxBuffer: 16384 });
    return result.stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0] || '버전 확인 불가';
  } catch { throw new GatewayError('claude_binary', 'Claude Code --version 실행에 실패했습니다. 설치 상태를 확인하세요.'); }
}

export async function inspectSettings(cwd, env = process.env, upstreamKey) {
  const files = new Set([join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')]);
  let dir = resolve(cwd);
  // Include ancestor project settings without reading prompts, MCP secrets or login stores.
  for (;;) {
    if (dir === homedir() && dir !== resolve(cwd)) break;
    files.add(join(dir, '.claude', 'settings.json'));
    files.add(join(dir, '.claude', 'settings.local.json'));
    if (await exists(join(dir, '.git'))) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const managedRoot = process.platform === 'win32' ? join(env.ProgramFiles || 'C:\\Program Files', 'ClaudeCode')
    : process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode' : '/etc/claude-code';
  files.add(join(managedRoot, 'managed-settings.json'));
  const notices = [];
  const extraEnv = new Set();
  const secretEnv = new Set();
  for (const path of files) {
    let settings;
    try { settings = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new GatewayError('settings', '기존 Claude 설정을 안전하게 해석할 수 없습니다. Claude Code /doctor로 확인하세요. 원본 파일은 수정하지 않았습니다.');
    }
    if (!settings || typeof settings !== 'object') throw new GatewayError('settings', '기존 Claude 설정이 JSON 객체가 아닙니다.');
    if (settings.apiKeyHelper) throw new GatewayError('settings_helper', '기존 apiKeyHelper가 발견됐습니다. 실행 인증과 충돌할 수 있어 시작하지 않았습니다. 관리자/사용자가 helper의 적용 범위를 확인하세요. 원본은 유지했습니다.');
    if (settings.forceLoginMethod || settings.forceLoginOrgUUID || settings.forceLoginGatewayUrl) throw new GatewayError('managed_policy', '로그인/조직/게이트웨이를 강제하는 설정이 있습니다. 해당 정책 담당자에게 확인하세요. 정책을 우회하지 않습니다.');
    for (const name of Object.keys(settings.env || {})) extraEnv.add(name);
    for (const [name, value] of Object.entries(settings.env || {})) {
      if (upstreamKey && String(value).includes(upstreamKey)) secretEnv.add(name);
    }
    if (settings.model || Object.keys(settings.env || {}).some(name => /^ANTHROPIC_|^CLAUDE_CODE_USE_|^CLAUDE_CODE_OAUTH_/.test(name))) notices.push('기존 모델/연결 설정을 감지했습니다. 이번 실행의 임시 설정이 적용되는지 /status로 확인하세요.');
  }
  return { notices: [...new Set(notices)], extraEnv, secretEnv };
}

export function sessionSettings(config, url, token, inherited = process.env, settingsKeys = []) {
  const env = {};
  for (const name of new Set([...Object.keys(inherited), ...settingsKeys])) {
    if (name.startsWith('CHATKHU_')) env[name] = '';
  }
  for (const name of credentialVars) env[name] = '';
  for (const name of providers) env[name] = '0';
  Object.assign(env, {
    ANTHROPIC_BASE_URL: url, ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_MODEL: config.model, ANTHROPIC_DEFAULT_MODEL: config.model,
    ANTHROPIC_SMALL_FAST_MODEL: config.aliases.haiku,
    CLAUDE_CODE_SUBAGENT_MODEL: config.model,
    DISABLE_AUTOUPDATER: '1',
    NO_PROXY: [inherited.NO_PROXY || inherited.no_proxy, '127.0.0.1', 'localhost'].filter(Boolean).join(','),
  });
  env.no_proxy = env.NO_PROXY;
  for (const alias of ALIASES) {
    env[`ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL`] = config.aliases[alias];
    env[`ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL_NAME`] = config.aliases[alias];
    env[`ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL_DESCRIPTION`] = `ChatKHU 설정: ${alias} → ${config.aliases[alias]}`;
  }
  return { model: config.model, env };
}

export function childEnvironment(parent, settings, upstreamKey) {
  const env = { ...parent };
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('CHATKHU_') || credentialVars.includes(name) || (upstreamKey && String(value).includes(upstreamKey))) delete env[name];
  }
  Object.assign(env, settings.env);
  return env;
}

export function validateArgs(args, models, aliases) {
  const ids = new Set(models.map(model => model.id));
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') break;
    const flag = args[i].split('=')[0];
    if (unsupported.has(flag)) throw new GatewayError('claude_args', `${flag}은 이 실행기의 세션 수명/연결 설정과 충돌합니다. foreground CLI 범위에서 실행하세요.`);
    if (flag === '--model' || flag === '--fallback-model') {
      const value = args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : args[++i];
      for (const id of (value || '').split(',')) {
        if (!ids.has(id) && !ids.has(aliases[id])) throw new GatewayError('model', 'Claude 인자의 모델이 계정 목록/설정 별칭에 없습니다. 실제 ID를 확인하세요.');
      }
    }
  }
  if (args.length && !args[0].startsWith('-') && ['agents', 'attach', 'auth', 'gateway', 'install', 'update', 'upgrade', 'plugin', 'plugins', 'mcp', 'stop', 'kill', 'rm', 'respawn', 'ultrareview'].includes(args[0])) {
    throw new GatewayError('claude_args', '이 실행기는 foreground Claude 대화를 위한 도구입니다. 관리/백그라운드 명령은 일반 Claude CLI에서 실행하세요.');
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    await exec('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    await new Promise(resolve => {
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} resolve(); }, 1500);
      child.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
}

export async function runClaude(config, { cwd = process.cwd(), args = [], env = process.env, binary, gatewayOptions, stdio = 'inherit', notify = console.error, onChild } = {}) {
  cwd = resolve(cwd);
  if (!(await stat(cwd)).isDirectory()) throw new GatewayError('cwd', '작업 경로는 디렉터리여야 합니다.');
  binary ||= await findClaude(env);
  const inspected = await inspectSettings(cwd, env, config.apiKey);
  for (const notice of inspected.notices) notify(notice);
  const root = join(config.dir, 'sessions');
  const dir = await sessionDir(root);
  let gateway;
  let child;
  let stopping;
  const interrupt = () => { stopping ||= Promise.all([gateway?.close(), child ? stopChild(child) : undefined]); };
  process.on('SIGINT', interrupt).on('SIGTERM', interrupt);
  try {
    gateway = await startGateway(config, gatewayOptions);
    const settings = sessionSettings(config, gateway.url, gateway.token, env, inspected.extraEnv);
    for (const name of inspected.secretEnv) if (!(name in settings.env)) settings.env[name] = '';
    const settingsFile = join(dir, 'settings.json');
    await writePrivate(settingsFile, JSON.stringify(settings));
    notify(`로컬 게이트웨이 ${gateway.url} | 실제 모델 ${config.model}`);
    notify(`별칭: ${ALIASES.map(alias => `${alias} → ${config.aliases[alias]}`).join(', ')}`);
    notify('Claude에서 /status로 Base URL과 인증 출처를 확인하세요. 종료하면 게이트웨이도 정리됩니다.');
    if (stopping) return 130;
    child = spawn(binary.command, [...binary.args, '--settings', settingsFile, ...args], {
      cwd, env: childEnvironment(env, settings, config.apiKey), stdio,
      shell: false, windowsHide: true, detached: process.platform !== 'win32',
    });
    onChild?.(child);
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(signal ? 130 : (code ?? 1)));
    });
    return stopping ? 130 : result;
  } finally {
    process.off('SIGINT', interrupt).off('SIGTERM', interrupt);
    await stopping;
    if (child) await stopChild(child);
    await gateway?.close();
    await removeSession(root, dir);
  }
}
