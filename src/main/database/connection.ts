import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { schema } from './schema';

export type AppDatabase = ReturnType<typeof createDrizzleDatabase>;

export interface DatabaseContext {
  readonly database: AppDatabase;
  readonly sqlite: BetterSqlite3.Database;
  close(): void;
}

const createDrizzleDatabase = (sqlite: BetterSqlite3.Database) =>
  drizzle(sqlite, { schema });

export interface MigrationFailureDetails {
  readonly migrationIdentifier: string | null;
  readonly sqliteErrorCode: string | null;
  readonly sanitizedMessage: string;
  readonly stage:
    'prepare_migrations' | 'apply_migrations' | 'post_migration_validation';
}

export class DatabaseMigrationError extends Error {
  readonly details: MigrationFailureDetails;

  constructor(details: MigrationFailureDetails, cause?: unknown) {
    super(`Database migration failed during ${details.stage}.`, { cause });
    this.name = 'DatabaseMigrationError';
    this.details = details;
  }
}

const sqliteErrorCode = (error: unknown): string | null => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    typeof error.cause === 'object' &&
    error.cause !== null &&
    'code' in error.cause &&
    typeof error.cause.code === 'string'
  ) {
    return error.cause.code;
  }

  return null;
};

const sanitizedErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('FOREIGN KEY constraint failed')) {
    return 'SQLite foreign-key constraint failed during migration.';
  }

  if (message.includes('CHECK constraint failed')) {
    return 'SQLite check constraint failed during migration.';
  }

  if (message.includes('UNIQUE constraint failed')) {
    return 'SQLite unique constraint failed during migration.';
  }

  return 'Database migration failed.';
};

const appliedMigrationCount = (sqlite: BetterSqlite3.Database): number => {
  const table = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();

  if (!table) return 0;

  const row = sqlite
    .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations')
    .get() as { count: number };

  return row.count;
};

const pendingMigrationIdentifier = (
  sqlite: BetterSqlite3.Database,
  migrationsFolder: string,
): string | null => {
  try {
    const journal = JSON.parse(
      readFileSync(resolve(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as { entries?: { tag?: string }[] };
    const appliedCount = appliedMigrationCount(sqlite);
    return journal.entries?.[appliedCount]?.tag ?? null;
  } catch {
    return null;
  }
};

const validateMigratedDatabase = (
  sqlite: BetterSqlite3.Database,
  migrationIdentifier: string | null,
): void => {
  const foreignKeyRows = sqlite.pragma('foreign_key_check') as unknown[];

  if (foreignKeyRows.length > 0) {
    throw new DatabaseMigrationError({
      migrationIdentifier,
      sanitizedMessage: 'SQLite foreign-key check failed after migration.',
      sqliteErrorCode: 'SQLITE_FOREIGN_KEY_CHECK',
      stage: 'post_migration_validation',
    });
  }

  const integrityCheck = sqlite.pragma('integrity_check', {
    simple: true,
  });

  if (integrityCheck !== 'ok') {
    throw new DatabaseMigrationError({
      migrationIdentifier,
      sanitizedMessage: 'SQLite integrity check failed after migration.',
      sqliteErrorCode: 'SQLITE_INTEGRITY_CHECK',
      stage: 'post_migration_validation',
    });
  }
};

export const openDatabase = (databasePath: string): DatabaseContext => {
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new BetterSqlite3(databasePath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');

  const foreignKeysEnabled = sqlite.pragma('foreign_keys', {
    simple: true,
  });

  if (foreignKeysEnabled !== 1) {
    sqlite.close();
    throw new Error('SQLite foreign-key enforcement could not be enabled.');
  }

  return {
    database: createDrizzleDatabase(sqlite),
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
};

export const applyMigrations = (
  context: DatabaseContext,
  migrationsFolder: string,
): void => {
  const migrationIdentifier = pendingMigrationIdentifier(
    context.sqlite,
    migrationsFolder,
  );

  try {
    context.sqlite.pragma('foreign_keys = OFF');
    migrate(context.database, { migrationsFolder });
  } catch (error) {
    throw new DatabaseMigrationError(
      {
        migrationIdentifier,
        sanitizedMessage: sanitizedErrorMessage(error),
        sqliteErrorCode: sqliteErrorCode(error),
        stage: 'apply_migrations',
      },
      error,
    );
  } finally {
    context.sqlite.pragma('foreign_keys = ON');
  }

  validateMigratedDatabase(context.sqlite, migrationIdentifier);
};

export const openMigratedDatabase = (
  databasePath: string,
  migrationsFolder: string,
): DatabaseContext => {
  const context = openDatabase(databasePath);

  try {
    applyMigrations(context, migrationsFolder);
    return context;
  } catch (error) {
    context.close();
    throw error;
  }
};
