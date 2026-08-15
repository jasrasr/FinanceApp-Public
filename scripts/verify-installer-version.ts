import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const packageJsonSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
});

const packageJson = packageJsonSchema.parse(
  JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')),
);
const distDirectory = resolve(process.cwd(), 'dist');
const expectedName = `Debt Tracker Setup ${packageJson.version}.exe`;
const installerPath = resolve(distDirectory, expectedName);

if (!existsSync(installerPath)) {
  const availableInstallers = readdirSync(distDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.exe'))
    .map((entry) => entry.name)
    .join(', ');
  throw new Error(
    `Expected installer ${expectedName} was not found in ${distDirectory}. Available installers: ${availableInstallers || 'none'}.`,
  );
}

if (process.platform !== 'win32') {
  throw new Error(
    'Installer version verification requires Windows file version metadata.',
  );
}

const productVersion = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$item = Get-Item -LiteralPath '${installerPath.replaceAll("'", "''")}'; $item.VersionInfo.ProductVersion`,
  ],
  { encoding: 'utf8' },
).trim();
const normalizedProductVersion = productVersion.split('.').slice(0, 3).join('.');

if (normalizedProductVersion !== packageJson.version) {
  throw new Error(
    `Installer version mismatch: package.json is ${packageJson.version}, but ${installerPath} reports ${productVersion}.`,
  );
}

console.log(`Verified installer version ${packageJson.version}.`);
console.log(`Installer path: ${installerPath}`);
