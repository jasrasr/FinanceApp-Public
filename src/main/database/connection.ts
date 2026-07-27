import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { schema } from './schema';

export type AppDatabase = ReturnType<typeof createDrizzleDatabase>;

export interface DatabaseContext {
  readonly database: AppDatabase;
  readonly sqlite: BetterSqlite3.Database;
  close(): void;
}

const createDrizzleDatabase = (sqlite: BetterSqlite3.Database) =>
  drizzle(sqlite, { schema });

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
  migrate(context.database, { migrationsFolder });
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
