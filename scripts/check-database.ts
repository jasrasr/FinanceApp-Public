import { resolve } from 'node:path';
import { openMigratedDatabase } from '../src/main/database/connection';
import { createTemporaryDatabaseLocation } from '../src/main/database/temporary-database';

const expectedTables = [
  'application_settings',
  'audit_events',
  'balance_reconciliations',
  'balance_snapshots',
  'debt_goals',
  'debt_terms',
  'debt_transactions',
  'debts',
  'import_batches',
  'import_postings',
  'import_sheet_mappings',
  'income_records',
  'income_sources',
  'income_transactions',
  'payment_schedule_overrides',
  'payoff_scenarios',
  'refinance_events',
  'staged_import_rows',
  'transaction_allocations',
];

const temporary = createTemporaryDatabaseLocation();
const migrationsFolder = resolve(process.cwd(), 'drizzle');
let context: ReturnType<typeof openMigratedDatabase> | undefined;

try {
  context = openMigratedDatabase(temporary.databasePath, migrationsFolder);
  const foreignKeys = context.sqlite.pragma('foreign_keys', {
    simple: true,
  });
  const integrity = context.sqlite.pragma('integrity_check', {
    simple: true,
  });
  const tableRows = context.sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
    )
    .all() as { name: string }[];
  const tableNames = tableRows.map((row) => row.name);

  if (foreignKeys !== 1) {
    throw new Error('Foreign-key enforcement is not active.');
  }

  if (integrity !== 'ok') {
    throw new Error(`SQLite integrity check failed: ${String(integrity)}`);
  }

  if (JSON.stringify(tableNames) !== JSON.stringify(expectedTables)) {
    throw new Error(
      `Migrated table list did not match expectations: ${tableNames.join(', ')}`,
    );
  }

  console.log(
    `Database check passed: ${tableNames.length} tables, foreign keys enabled, integrity ok.`,
  );
} finally {
  context?.close();
  temporary.cleanup();
}
