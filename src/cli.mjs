import { readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseEnv } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { configDir, readSaved, loadConfig, saveConfig, DEFAULT_BASE, ALIASES, normalizeBase, secret } from './config.mjs';
import { AnthropicAdapter, validateModels } from './adapters/anthropic.mjs';
import { GatewayError, safeError } from './errors.mjs';
import { findClaude, claudeVersion, inspectSettings, validateArgs, runClaude } from './launcher.mjs';
import { startGateway, newToken } from './gateway.mjs';
import { sessionDir, writePrivate, removeSession } from './private-files.mjs';
import { runSmoke } from './smoke.mjs';

const HELP = `ChatKHU 로컬 게이트웨이 (Node.js 22+, foreground Claude Code CLI)

  node bin/chatkhu.mjs setup              숨김 키 입력 · 모델 조회 · 저장
  node bin/chatkhu.mjs models             계정의 Claude 모델 ID 조회
  node bin/chatkhu.mjs doctor             추론 없이 설정·인증·모델·CLI 진단
  node bin/chatkhu.mjs claude [--cwd 경로] [-- Claude 인자...]
  node bin/chatkhu.mjs serve [--port 번호] 게이트웨이만 실행; Ctrl+C 종료
  node bin/chatkhu.mjs smoke --confirm-cost   실제 추론 5회 이내 (크레딧 사용)

공통: --env-file 파일, --key-file 파일, --base-url URL, --model 실제ID
setup: --non-interactive, --opus-model ID, --sonnet-model ID, --haiku-model ID, --fable-model ID
키/로컬 토큰 값은 인자로 받지 않습니다. .env 파일은 --env-file로 지정할 때만 읽습니다.
Claude 연결은 임시 --settings에 적용하고 기존 설정은 유지합니다.
`;

function parse(argv) {
  const command = argv[0] || 'help';
  const options = {};
  let args = [];
  const flags = new Set(['non-interactive', 'confirm-cost', 'help']);
  const values = new Set(['cwd', 'port', 'env-file', 'key-file', 'base-url', 'model', ...ALIASES.map(alias => `${alias}-model`)]);
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--') { args = argv.slice(i + 1); break; }
    const key = argv[i].replace(/^--/, '');
    if (flags.has(key)) options[key] = true;
    else if (values.has(key) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) options[key] = argv[++i];
    else throw new GatewayError('arguments', '지원하지 않는 인자입니다. --help를 확인하고 Claude 인자는 -- 뒤에 넣으세요. 키는 환경 변수/로컬 파일로 입력하세요.');
  }
  return { command, options, args };
}

async function input(label, fallback = '') {
  if (!process.stdin.isTTY) throw new GatewayError('input', '대화형 입력은 터미널에서 실행하세요. 비대화형은 --non-interactive와 환경 변수/로컬 키 파일을 사용하세요.');
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await reader.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback; }
  finally { reader.close(); }
}

export async function hiddenInput() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new GatewayError('input', '키 숨김 입력에는 TTY가 필요합니다. CHATKHU_API_KEY 또는 --key-file을 사용하세요.');
  process.stdout.write('개인 ChatKHU API 키 (화면에 표시되지 않음): ');
  emitKeypressEvents(process.stdin);
  const priorRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (error) => {
      process.stdin.off('keypress', keypress);
      process.stdin.setRawMode(priorRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const keypress = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') return done(new GatewayError('cancel', '설정을 취소했습니다.'));
      if (key.name === 'return' || key.name === 'enter') return done();
      if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    process.stdin.on('keypress', keypress);
  });
}

async function setup(env, options) {
  const saved = await readSaved(env);
  const base = normalizeBase(env.CHATKHU_BASE_URL || saved.baseUrl || DEFAULT_BASE);
  console.log('계정 API Gateway의 “내 에이전트에 연결하기” 카드에서 Base URL을 확인하세요. 키가 든 복사 프롬프트는 채팅에 붙이지 마세요.');
  console.log(`저장 위치: ${configDir(env)} (개인 키는 OS 권한으로 제한한 평문 파일; OS 금고/암호화 저장은 아님)`);
  const baseUrl = normalizeBase(options['non-interactive'] ? base : await input('계정 Base URL', base));
  let apiKey = env.CHATKHU_API_KEY;
  if (env.CHATKHU_KEY_FILE) apiKey = await readFile(resolve(env.CHATKHU_KEY_FILE), 'utf8');
  if (!apiKey && !options['non-interactive']) apiKey = await hiddenInput();
  if (!apiKey) throw new GatewayError('credential', '비대화형 setup에는 CHATKHU_API_KEY 또는 --key-file이 필요합니다.');
  apiKey = secret(apiKey);
  const config = await loadConfig({ ...env, CHATKHU_API_KEY: apiKey, CHATKHU_BASE_URL: baseUrl });
  const models = await new AnthropicAdapter(config).models();
  if (!models.length) throw new GatewayError('models', '사용 가능한 Claude 모델이 없습니다. 조직 모델 권한을 확인하세요.');
  models.forEach((model, i) => console.log(`${i + 1}. ${model.id}`));
  let model = env.CHATKHU_MODEL;
  if (!options['non-interactive']) {
    const selection = await input('모델 번호 또는 실제 ID', model || (models.some(item => item.id === saved.model) ? saved.model : '1'));
    model = /^\d+$/.test(selection) ? models[Number(selection) - 1]?.id : selection;
  }
  if (!model) throw new GatewayError('model', '비대화형 setup에는 --model로 목록의 실제 ID를 지정하세요.');
  const aliases = Object.fromEntries(ALIASES.map(alias => [alias, env[`CHATKHU_${alias.toUpperCase()}_MODEL`] || model]));
  validateModels({ model, aliases }, models);
  console.log(`메인/보조 기본 모델: ${model}`);
  console.log(`별칭 매핑: ${ALIASES.map(alias => `${alias} → ${aliases[alias]}`).join(', ')} (별칭은 성능/모델 계열 보장이 아님)`);
  await saveConfig({ baseUrl, model, aliases }, env.CHATKHU_KEY_FILE ? { keyFile: env.CHATKHU_KEY_FILE } : { apiKey }, env);
  console.log('설정 저장 완료. doctor → claude 순서로 실행하세요. 생성 요청은 보내지 않았습니다.');
}

async function doctor(env, cwd) {
  let failed = false;
  let config;
  const check = async (name, fn) => {
    try { const detail = await fn(); console.log(`[확인] ${name}${detail ? `: ${detail}` : ''}`); }
    catch (error) { failed = true; console.error(`[확인 필요] ${name}: ${safeError(error)}`); }
  };
  await check('설정/HTTPS/키', async () => { config = await loadConfig(env); return config.baseUrl; });
  if (config) await check('인증/모델 목록', async () => {
    const models = await new AnthropicAdapter(config).models();
    validateModels(config, models);
    return `${models.length}개 Claude 모델, 메인 ${config.model}; 목록 조회 성공은 추론/모든 기능 성공을 보장하지 않음`;
  });
  await check('Claude Code 설치', async () => claudeVersion(await findClaude(env), env));
  await check('기존 설정 충돌', async () => {
    const result = await inspectSettings(cwd, env);
    return result.notices.join(' ') || '로컬 파일에서 충돌을 발견하지 못함';
  });
  console.log('생성 요청 없음. 관리자 정책(MDM/레지스트리 포함)은 Claude CLI에서 최종 적용됩니다. 실행 후 /status로 실제 경로를 확인하세요.');
  return failed ? 1 : 0;
}

async function serve(config, env) {
  const root = join(config.dir, 'sessions');
  const dir = await sessionDir(root);
  let gateway;
  let stop;
  let interrupted = false;
  const stopped = new Promise(resolve => { stop = () => { interrupted = true; resolve(); }; });
  process.on('SIGINT', stop).on('SIGTERM', stop);
  try {
    const token = env.CHATKHU_LOCAL_TOKEN_FILE ? secret(await readFile(resolve(env.CHATKHU_LOCAL_TOKEN_FILE), 'utf8'), '로컬 토큰') : newToken();
    gateway = await startGateway(config, { token, log: item => console.error(JSON.stringify(item)) });
    const connection = join(dir, 'client-env.json');
    await writePrivate(connection, JSON.stringify({ ANTHROPIC_BASE_URL: gateway.url, ANTHROPIC_AUTH_TOKEN: token, ANTHROPIC_MODEL: config.model }, null, 2));
    console.log(`게이트웨이: ${gateway.url} | health: ${gateway.url}/health`);
    console.log(`로컬 클라이언트 설정 파일: ${connection}\n토큰을 명령행/채팅에 복사하지 마세요. Ctrl+C로 종료합니다.`);
    if (!interrupted) await stopped;
  } finally {
    process.off('SIGINT', stop).off('SIGTERM', stop);
    await gateway?.close();
    await removeSession(root, dir);
  }
}

export async function main(argv = process.argv.slice(2), inherited = process.env) {
  const { command, options, args } = parse(argv);
  if (['help', '--help', '-h'].includes(command) || options.help) { console.log(HELP); return 0; }
  if (!['setup', 'models', 'doctor', 'claude', 'serve', 'smoke'].includes(command)) throw new GatewayError('arguments', '알 수 없는 명령입니다. --help를 확인하세요.');
  let env = { ...inherited };
  if (options['env-file']) {
    const data = parseEnv(await readFile(resolve(options['env-file']), 'utf8'));
    for (const [name, value] of Object.entries(data)) if (name.startsWith('CHATKHU_')) env[name] = value;
  }
  const mapping = { 'key-file': 'KEY_FILE', 'base-url': 'BASE_URL', model: 'MODEL', port: 'PORT', ...Object.fromEntries(ALIASES.map(alias => [`${alias}-model`, `${alias.toUpperCase()}_MODEL`])) };
  for (const [name, variable] of Object.entries(mapping)) if (options[name] !== undefined) env[`CHATKHU_${variable}`] = options[name];
  const cwd = resolve(options.cwd || process.cwd());
  if (!(await stat(cwd)).isDirectory()) throw new GatewayError('cwd', '작업 폴더가 올바르지 않습니다.');
  if (command === 'setup') { await setup(env, options); return 0; }
  if (command === 'doctor') return doctor(env, cwd);
  if (command === 'smoke' && !options['confirm-cost']) throw new GatewayError('cost_confirmation', 'smoke는 개인 크레딧을 쓰는 생성 요청을 최대 5회 보냅니다. 실행하려면 --confirm-cost를 추가하세요. 재시도/부하 테스트는 하지 않습니다.');
  const config = await loadConfig(env);
  const adapter = new AnthropicAdapter(config);
  const models = await adapter.models();
  if (command === 'models') { models.forEach(model => console.log(model.id)); if (!models.length) throw new GatewayError('models', '사용 가능한 Claude 모델이 없습니다.'); return 0; }
  validateModels(config, models);
  if (command === 'claude') { validateArgs(args, models, config.aliases); return runClaude(config, { cwd, args, env }); }
  if (command === 'serve') { await serve(config, env); return 0; }
  if (command === 'smoke') { console.log('ChatKHU 크레딧을 사용하는 명시적 smoke 검사입니다. 자동 재시도 없음.'); await runSmoke(config, adapter); return 0; }
}
