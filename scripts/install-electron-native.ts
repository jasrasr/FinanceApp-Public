import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptsDirectory, '..');
const electronPackage = JSON.parse(
  readFileSync(resolve(projectRoot, 'node_modules/electron/package.json'), 'utf8'),
) as { version?: unknown };

if (typeof electronPackage.version !== 'string') {
  throw new Error('Installed Electron version could not be determined.');
}

const result = spawnSync(
  process.execPath,
  [
    resolve(projectRoot, 'node_modules/prebuild-install/bin.js'),
    '--runtime',
    'electron',
    '--target',
    electronPackage.version,
  ],
  {
    cwd: resolve(projectRoot, 'node_modules/better-sqlite3'),
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(
    `Electron better-sqlite3 prebuild installation failed with exit code ${String(result.status)}.`,
  );
}
