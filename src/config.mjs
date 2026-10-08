import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { GatewayError } from './errors.mjs';
import { writePrivate } from './private-files.mjs';

export const DEFAULT_BASE = 'https://factchat-cloud.mindlogic.ai/v1/gateway/claude';
export const ALIASES = ['opus', 'sonnet', 'haiku', 'fable'];

export function configDir(env = process.env) {
  return resolve(env.CHATKHU_CONFIG_DIR || (process.platform === 'win32'
    ? join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'chatkhu-gateway')
    : join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'chatkhu-gateway')));
}

export function normalizeBase(value, { testOnlyAllowHttp = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new GatewayError('base_url', '올바른 HTTPS Base URL을 입력하세요.'); }
  if (url.username || url.password || url.search || url.hash) throw new GatewayError('base_url', 'Base URL에는 인증 정보, 쿼리, fragment를 넣을 수 없습니다.');
  if (url.protocol !== 'https:' && !(testOnlyAllowHttp && url.protocol === 'http:' && url.hostname === '127.0.0.1')) {
    throw new GatewayError('base_url', '운영 Base URL은 HTTPS여야 합니다. 인증서 검증은 끌 수 없습니다.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (/\/claude\/v1(?:\/|$)/.test(path)) throw new GatewayError('base_url', 'Base URL은 /claude에서 끝나야 합니다. /claude/v1은 /v1을 중복합니다.');
  if (path.endsWith('/gateway')) url.pathname = `${path}/claude`;
  else if (path.endsWith('/claude')) url.pathname = path;
  else throw new GatewayError('base_url', '계정 화면의 /gateway 또는 /claude로 끝나는 Base URL을 사용하세요. Messages 전체 URL은 사용할 수 없습니다.');
  return url.href.replace(/\/$/, '');
}

function integer(value, fallback, name, min = 1, max = 2 ** 31 - 1) {
  const number = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new GatewayError('config', `${name}의 정수 범위를 확인하세요.`);
  return number;
}

export async function readSaved(env = process.env) {
  try {
    const value = JSON.parse(await readFile(join(configDir(env), 'config.json'), 'utf8'));
    if (!value || value.version !== 1 || typeof value !== 'object') throw new Error();
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new GatewayError('config', 'config.json을 읽을 수 없거나 형식이 올바르지 않습니다. setup으로 다시 설정하세요.');
  }
}

export function secret(value, label = 'API 키') {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x20\x7f]/.test(value.trim())) throw new GatewayError('credential', `${label}가 없거나 공백/제어 문자가 들어 있습니다.`);
  return value.trim();
}

export async function loadConfig(env = process.env, { requireKey = true } = {}) {
  const saved = await readSaved(env);
  const dir = configDir(env);
  const keyFile = env.CHATKHU_KEY_FILE ? resolve(env.CHATKHU_KEY_FILE) : saved.keyFile ? resolve(saved.keyFile) : join(dir, 'credentials.key');
  let apiKey = env.CHATKHU_API_KEY;
  if (!apiKey) {
    try { apiKey = await readFile(keyFile, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw new GatewayError('credential', 'API 키 파일을 읽을 수 없습니다. 파일 경로와 권한을 확인하세요.'); }
  }
  if (requireKey && !apiKey) throw new GatewayError('credential', 'API 키가 없습니다. setup을 실행하거나 CHATKHU_API_KEY / CHATKHU_KEY_FILE을 설정하세요. 키를 명령행 인자로 넣지 마세요.');
  const model = env.CHATKHU_MODEL || saved.model;
  const aliases = Object.fromEntries(ALIASES.map(alias => [alias, env[`CHATKHU_${alias.toUpperCase()}_MODEL`] || saved.aliases?.[alias] || model]));
  for (const id of [model, ...Object.values(aliases)]) {
    if (id !== undefined && (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(id))) throw new GatewayError('model', '모델 ID 형식이 올바르지 않습니다. models에서 반환한 ID를 그대로 사용하세요.');
  }
  return {
    dir, apiKey: apiKey ? secret(apiKey) : undefined, keyFile,
    baseUrl: normalizeBase(env.CHATKHU_BASE_URL || saved.baseUrl || DEFAULT_BASE),
    model, aliases,
    port: integer(env.CHATKHU_PORT ?? saved.port, 0, '포트', 0, 65535),
    connectTimeoutMs: integer(env.CHATKHU_CONNECT_TIMEOUT_MS ?? saved.connectTimeoutMs, 15000, '연결 타임아웃'),
    idleTimeoutMs: integer(env.CHATKHU_IDLE_TIMEOUT_MS ?? saved.idleTimeoutMs, 120000, '유휴 타임아웃'),
    maxRequestBytes: integer(env.CHATKHU_MAX_REQUEST_BYTES ?? saved.maxRequestBytes, 25000000, '요청 크기'),
  };
}

export async function saveConfig(config, { apiKey, keyFile } = {}, env = process.env) {
  const dir = configDir(env);
  if (apiKey) await writePrivate(join(dir, 'credentials.key'), secret(apiKey));
  const safe = { version: 1, baseUrl: normalizeBase(config.baseUrl), model: config.model, aliases: config.aliases };
  if (keyFile) safe.keyFile = resolve(keyFile);
  await writePrivate(join(dir, 'config.json'), `${JSON.stringify(safe, null, 2)}\n`);
}
