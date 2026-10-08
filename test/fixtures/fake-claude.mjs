import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

if (process.argv.includes('--version')) { console.log('2.1.280 (test double)'); process.exit(0); }
const fileIndex = process.argv.indexOf('--settings');
const settingsPath = process.argv[fileIndex + 1];
const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
const expectedKey = 'fake-upstream-key-only-for-tests';
const sessionToken = settings.env.ANTHROPIC_AUTH_TOKEN;
const response = await fetch(`${settings.env.ANTHROPIC_BASE_URL}/v1/messages`, { method: 'POST', headers: { authorization: `Bearer ${sessionToken}` }, body: '{"model":"claude-test-a","messages":[]}' });
const probe = {
  cwd: process.cwd(), args: process.argv.slice(fileIndex + 2), settingsPath,
  model: settings.model,
  aliases: Object.fromEntries(['OPUS', 'SONNET', 'HAIKU', 'FABLE'].map(alias => [alias, settings.env[`ANTHROPIC_DEFAULT_${alias}_MODEL`]])),
  localUrl: settings.env.ANTHROPIC_BASE_URL,
  upstreamKeyInEnv: Object.values(process.env).some(value => String(value).includes(expectedKey)),
  secretInArgv: process.argv.some(value => value.includes(expectedKey) || value.includes(sessionToken)),
  providerDisabled: process.env.CLAUDE_CODE_USE_BEDROCK === '0',
  oauthCleared: !process.env.CLAUDE_CODE_OAUTH_TOKEN,
  status: response.status,
};
if (process.env.GATEWAY_TEST_WAIT) {
  const nested = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  probe.nestedPid = nested.pid;
}
await writeFile(process.env.GATEWAY_TEST_REPORT, JSON.stringify(probe));
if (process.env.GATEWAY_TEST_WAIT) setInterval(() => {}, 1000);
else process.exit(Number(process.env.GATEWAY_TEST_EXIT || 0));
