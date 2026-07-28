import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const distDirectory = resolve(projectRoot, 'dist');
const installer = readdirSync(distDirectory)
  .filter((fileName) => /^Debt Tracker Setup .+\.exe$/.test(fileName))
  .sort()
  .at(-1);

if (!installer) {
  throw new Error('No Debt Tracker NSIS installer was found in dist.');
}

const installDirectory = mkdtempSync(join(tmpdir(), 'debt-tracker-installed-'));
const userDataDirectory = mkdtempSync(
  join(tmpdir(), 'debt-tracker-packaged-user-data-'),
);
const exportDirectory = mkdtempSync(join(tmpdir(), 'debt-tracker-packaged-export-'));
const installerPath = join(distDirectory, installer);
const applicationPath = join(installDirectory, 'Debt Tracker.exe');
const uninstallerPath = join(installDirectory, 'Uninstall Debt Tracker.exe');
const databasePath = join(userDataDirectory, 'debt-tracker.sqlite3');
const backupDirectory = join(userDataDirectory, 'backups');

let uninstallVerified = false;

const run = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): void => {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${String(result.status)}.`);
  }
};

try {
  run(installerPath, ['/S', `/D=${installDirectory}`]);

  if (!existsSync(applicationPath)) {
    throw new Error('The installed Debt Tracker executable was not found.');
  }

  run(
    process.execPath,
    [
      resolve(projectRoot, 'node_modules/@playwright/test/cli.js'),
      'test',
      'e2e/packaged-app.spec.ts',
    ],
    {
      ...process.env,
      DEBT_TRACKER_PACKAGED_EXE: applicationPath,
      DEBT_TRACKER_PACKAGED_USER_DATA_DIR: userDataDirectory,
      DEBT_TRACKER_TEST_EXPORT_DIR: exportDirectory,
    },
  );

  run(installerPath, ['/S', `/D=${installDirectory}`]);

  run(
    process.execPath,
    [
      resolve(projectRoot, 'node_modules/@playwright/test/cli.js'),
      'test',
      'e2e/packaged-upgrade.spec.ts',
    ],
    {
      ...process.env,
      DEBT_TRACKER_PACKAGED_EXE: applicationPath,
      DEBT_TRACKER_PACKAGED_USER_DATA_DIR: userDataDirectory,
      DEBT_TRACKER_TEST_EXPORT_DIR: exportDirectory,
    },
  );

  if (!existsSync(databasePath)) {
    throw new Error(
      'Packaged smoke test did not create the expected user-data database.',
    );
  }

  if (!existsSync(backupDirectory)) {
    throw new Error(
      'Packaged smoke test did not create the expected backup directory.',
    );
  }

  if (existsSync(uninstallerPath)) {
    run(uninstallerPath, ['/S']);
    if (!existsSync(databasePath) || !existsSync(backupDirectory)) {
      throw new Error('Uninstall removed test user data or backups unexpectedly.');
    }
    uninstallVerified = true;
  }
} finally {
  if (!uninstallVerified && existsSync(uninstallerPath)) {
    const result = spawnSync(uninstallerPath, ['/S'], {
      cwd: projectRoot,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (
      result.status !== 0 ||
      !existsSync(databasePath) ||
      !existsSync(backupDirectory)
    ) {
      process.stderr.write(
        'Silent uninstall cleanup could not be verified after failure.\n',
      );
    }
  }
  rmSync(installDirectory, { force: true, recursive: true });
  rmSync(userDataDirectory, { force: true, recursive: true });
  rmSync(exportDirectory, { force: true, recursive: true });
}
