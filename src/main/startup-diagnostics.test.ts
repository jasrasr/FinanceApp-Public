import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeStartupDiagnostics } from './startup-diagnostics';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = (prefix: string): string => {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('startup diagnostics', () => {
  it('writes sanitized production startup diagnostics under user data', () => {
    const userDataDirectory = createTemporaryDirectory('debt-tracker-diagnostics-');
    const applicationRootDirectory = createTemporaryDirectory('debt-tracker-app-root-');
    const backupRootDirectory = join(userDataDirectory, 'backups');
    mkdirSync(backupRootDirectory, { recursive: true });

    writeStartupDiagnostics({
      applicationRootDirectory,
      backupRootDirectory,
      databasePath: join(userDataDirectory, 'debt-tracker.sqlite3'),
      isPackaged: true,
      status: 'ok',
      userDataDirectory,
    });

    const diagnostic = JSON.parse(
      readFileSync(join(userDataDirectory, 'diagnostics', 'startup.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(diagnostic).toMatchObject({
      status: 'ok',
      isPackaged: true,
      databaseFileName: 'debt-tracker.sqlite3',
      backupDirectoryName: 'backups',
      userDataDirectoryConfigured: true,
      databaseInsideUserData: true,
      backupsInsideUserData: true,
      databaseInsideApplicationRoot: false,
      errorName: null,
    });
    expect(JSON.stringify(diagnostic)).not.toContain(applicationRootDirectory);
    expect(JSON.stringify(diagnostic)).not.toContain(userDataDirectory);
  });

  it('records sanitized startup failure details without raw error messages', () => {
    const userDataDirectory = createTemporaryDirectory('debt-tracker-diagnostics-');
    const applicationRootDirectory = createTemporaryDirectory('debt-tracker-app-root-');

    writeStartupDiagnostics({
      applicationRootDirectory,
      backupRootDirectory: join(userDataDirectory, 'backups'),
      databasePath: join(userDataDirectory, 'debt-tracker.sqlite3'),
      errorName: 'MigrationError',
      isPackaged: false,
      status: 'database_initialization_failed',
      userDataDirectory,
    });

    const diagnostic = JSON.parse(
      readFileSync(join(userDataDirectory, 'diagnostics', 'startup.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(diagnostic.status).toBe('database_initialization_failed');
    expect(diagnostic.errorName).toBe('MigrationError');
    expect(JSON.stringify(diagnostic)).not.toContain('Error:');
  });
});
