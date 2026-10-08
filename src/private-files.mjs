import { mkdir, chmod, lstat, open, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GatewayError } from './errors.mjs';

const exec = promisify(execFile);
let sid;
async function restrict(path, directory) {
  if (process.platform !== 'win32') return chmod(path, directory ? 0o700 : 0o600);
  // Use the immutable SID, not a localized account name. Never put secrets in argv.
  sid ??= (await exec('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true })).stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new GatewayError('permissions', '현재 사용자 SID를 확인할 수 없어 비밀 파일 저장을 중단했습니다.');
  await exec('icacls.exe', [path, '/inheritance:r', '/grant:r', `*${sid}:${directory ? '(OI)(CI)F' : 'F'}`], { windowsHide: true });
}

export async function privateDir(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (!(await lstat(path)).isDirectory() || (await lstat(path)).isSymbolicLink()) {
    throw new GatewayError('permissions', '설정 경로는 실제 사용자 전용 디렉터리여야 합니다.');
  }
  await restrict(path, true);
  return path;
}

export async function writePrivate(path, data, { exclusive = false } = {}) {
  await privateDir(dirname(path));
  const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const file = await open(temp, 'wx', 0o600);
    try {
      await restrict(temp, false);
      await file.writeFile(data, 'utf8');
      await file.sync();
    } finally { await file.close(); }
    if (exclusive) {
      // Reserve the final name without replacing any user file.
      const reserved = await open(path, 'wx', 0o600);
      await reserved.close();
    }
    await rename(temp, path);
  } finally { await rm(temp, { force: true }); }
}

export async function sessionDir(root) {
  const path = join(await privateDir(root), `session-${process.pid}-${randomBytes(10).toString('hex')}`);
  await privateDir(path);
  return path;
}

export async function removeSession(root, path) {
  // Recursive removal is only for this exact, newly-created child of the session root.
  const child = relative(resolve(root), resolve(path));
  if (!child.startsWith('session-') || child.includes('..') || isAbsolute(child) || /[/\\]/.test(child)) {
    throw new GatewayError('cleanup', '임시 세션 경로 검증에 실패했습니다.');
  }
  await rm(resolve(path), { recursive: true, force: true });
}
