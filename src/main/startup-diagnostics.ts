import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

export interface StartupDiagnosticInput {
  readonly applicationRootDirectory: string;
  readonly backupRootDirectory: string;
  readonly databasePath: string;
  readonly errorName?: string;
  readonly migrationFailure?: {
    readonly migrationIdentifier: string | null;
    readonly sanitizedMessage: string;
    readonly sqliteErrorCode: string | null;
    readonly stage: string;
  };
  readonly isPackaged: boolean;
  readonly status: 'ok' | 'database_initialization_failed';
  readonly userDataDirectory: string;
}

const isPathInside = (candidate: string, parent: string): boolean => {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return (
    relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
};

export const writeStartupDiagnostics = ({
  applicationRootDirectory,
  backupRootDirectory,
  databasePath,
  errorName,
  migrationFailure,
  isPackaged,
  status,
  userDataDirectory,
}: StartupDiagnosticInput): void => {
  const diagnosticsDirectory = join(userDataDirectory, 'diagnostics');
  mkdirSync(diagnosticsDirectory, { recursive: true });
  writeFileSync(
    join(diagnosticsDirectory, 'startup.json'),
    `${JSON.stringify(
      {
        checkedAtUtc: new Date().toISOString(),
        status,
        isPackaged,
        databaseFileName: basename(databasePath),
        backupDirectoryName: basename(backupRootDirectory),
        userDataDirectoryConfigured: userDataDirectory.length > 0,
        databaseInsideUserData: isPathInside(databasePath, userDataDirectory),
        backupsInsideUserData: isPathInside(backupRootDirectory, userDataDirectory),
        databaseInsideApplicationRoot: isPathInside(
          databasePath,
          applicationRootDirectory,
        ),
        errorName: errorName ?? null,
        migrationIdentifier: migrationFailure?.migrationIdentifier ?? null,
        sqliteErrorCode: migrationFailure?.sqliteErrorCode ?? null,
        migrationFailureStage: migrationFailure?.stage ?? null,
        sanitizedErrorMessage: migrationFailure?.sanitizedMessage ?? null,
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8' },
  );
};
