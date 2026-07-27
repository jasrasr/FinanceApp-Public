import { mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export interface TemporaryDatabaseLocation {
  readonly databasePath: string;
  readonly directoryPath: string;
  cleanup(): void;
}

const TEMPORARY_PREFIX = 'debt-tracker-test-';

export const createTemporaryDatabaseLocation = (): TemporaryDatabaseLocation => {
  const directoryPath = mkdtempSync(join(tmpdir(), TEMPORARY_PREFIX));
  const databasePath = join(directoryPath, 'test.sqlite3');
  let cleaned = false;

  return {
    databasePath,
    directoryPath,
    cleanup: () => {
      if (cleaned) {
        return;
      }

      const resolvedDirectory = resolve(directoryPath);

      if (
        dirname(resolvedDirectory) !== resolve(tmpdir()) ||
        !basename(resolvedDirectory).startsWith(TEMPORARY_PREFIX)
      ) {
        throw new Error('Refusing to remove a non-temporary database path.');
      }

      rmSync(resolvedDirectory, { force: true, recursive: true });
      cleaned = true;
    },
  };
};
