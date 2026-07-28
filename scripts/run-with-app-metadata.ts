import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';

const packageJsonSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
});
const packageBinSchema = z.object({
  bin: z.union([z.string(), z.record(z.string(), z.string())]),
});
const requireFromWorkspace = createRequire(resolve(process.cwd(), 'package.json'));

const [, , ...command] = process.argv;

if (command.length === 0) {
  throw new Error('Expected a command to run with application metadata.');
}

const [executable, ...args] = command;

if (!executable) {
  throw new Error('Expected an executable to run with application metadata.');
}

const packageJson = packageJsonSchema.parse(
  JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')),
);
const lastChangedAtUtc = new Date().toISOString();

console.log(
  `Using application metadata: version ${packageJson.version}, last changed ${lastChangedAtUtc}.`,
);

const resolveExecutable = (): {
  readonly command: string;
  readonly args: readonly string[];
} => {
  if (isAbsolute(executable) || executable.includes('/') || executable.includes('\\')) {
    return { command: executable, args };
  }

  const packageJsonPath = requireFromWorkspace.resolve(`${executable}/package.json`);
  const commandPackageJson = packageBinSchema.parse(
    JSON.parse(readFileSync(packageJsonPath, 'utf8')),
  );
  const bin =
    typeof commandPackageJson.bin === 'string'
      ? commandPackageJson.bin
      : commandPackageJson.bin[executable];

  if (!bin) {
    throw new Error(`Package ${executable} does not define a matching binary.`);
  }

  return {
    command: process.execPath,
    args: [resolve(dirname(packageJsonPath), bin), ...args],
  };
};

const resolved = resolveExecutable();
const child = spawn(resolved.command, resolved.args, {
  env: {
    ...process.env,
    VITE_DEBT_TRACKER_APP_VERSION: packageJson.version,
    VITE_DEBT_TRACKER_LAST_CHANGED_AT_UTC: lastChangedAtUtc,
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
