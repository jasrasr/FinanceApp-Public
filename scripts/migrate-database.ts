import { isAbsolute, resolve } from 'node:path';
import { openMigratedDatabase } from '../src/main/database/connection';
import {
  createTemporaryDatabaseLocation,
  type TemporaryDatabaseLocation,
} from '../src/main/database/temporary-database';

const argumentsList = process.argv.slice(2);
const useTemporary = argumentsList.includes('--temporary');
const databaseArgumentIndex = argumentsList.indexOf('--database');
const databaseArgument =
  databaseArgumentIndex >= 0 ? argumentsList[databaseArgumentIndex + 1] : undefined;

if (!useTemporary && !databaseArgument) {
  throw new Error(
    'Specify --temporary or provide an explicit --database absolute path.',
  );
}

if (databaseArgument && !isAbsolute(databaseArgument)) {
  throw new Error('Explicit database path must be absolute.');
}

let temporary: TemporaryDatabaseLocation | undefined;
const databasePath = useTemporary
  ? (temporary = createTemporaryDatabaseLocation()).databasePath
  : databaseArgument;

if (!databasePath) {
  throw new Error('Database path could not be resolved.');
}

const context = openMigratedDatabase(databasePath, resolve(process.cwd(), 'drizzle'));

try {
  const migrationRows = context.sqlite
    .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations')
    .get() as { count: number };

  console.log(
    `Applied ${migrationRows.count} migration batch(es) to ${useTemporary ? 'an isolated temporary database' : 'the explicit database path'}.`,
  );
} finally {
  context.close();
  temporary?.cleanup();
}
