import { mkdtemp, mkdir, copyFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(join(tmpdir(), 'chatkhu-clean-install-'));
try {
  const npm = process.env.npm_execpath;
  if (!npm || !isAbsolute(npm)) throw new Error('Run through npm run test:install');
  const listing = await exec('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: source, encoding: 'utf8' });
  let files = 0;
  for (const name of listing.stdout.split('\0').filter(Boolean)) {
    const from = resolve(source, name);
    const rel = relative(source, from);
    if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('Invalid source path');
    if ((await lstat(from)).isSymbolicLink()) throw new Error('Symlink in source snapshot');
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await copyFile(from, join(dir, rel));
    files++;
  }
  // No .git, ignored .env files, installed dependencies or local config is copied.
  for (const args of [['ci', '--ignore-scripts', '--no-audit', '--no-fund'], ['test']]) {
    const result = await exec(process.execPath, [npm, ...args], { cwd: dir, timeout: 60000, maxBuffer: 1024 * 1024, windowsHide: true });
    console.log(result.stdout.trim());
  }
  const help = await exec(process.execPath, ['bin/chatkhu.mjs', '--help'], { cwd: dir, windowsHide: true });
  if (!help.stdout.includes('setup')) throw new Error('CLI help failed');
  console.log(`PASS: ${files} source files; clean npm ci, npm test, CLI help`);
} catch (error) {
  // Output from this offline test suite uses only fake fixture secrets.
  console.error(error.stdout || 'Clean install verification failed.');
  process.exitCode = 1;
} finally {
  if (dirname(resolve(dir)) !== resolve(tmpdir())) throw new Error('Invalid cleanup path');
  await rm(dir, { recursive: true, force: true });
}
