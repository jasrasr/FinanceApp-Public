import BetterSqlite3 from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const TARGET_DEBT_NAME = 'Freedom Unlimited - Chase';
const REPAIR_KEY = 'repair.freedom_unlimited_purchases.v1';

interface CandidateRow {
  readonly id: string;
  readonly effective_date: string;
  readonly transaction_type: string;
  readonly status: string;
  readonly principal_cents: number;
}

interface DebtBalanceRow {
  readonly id: string;
  readonly balance_cents: number;
}

const args = process.argv.slice(2);
const valueAfter = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const databaseArgument = valueAfter('--database');
const backupDirectoryArgument = valueAfter('--backup-dir');
const targetDebtName = valueAfter('--target-debt-name') ?? TARGET_DEBT_NAME;
const isApply = args.includes('--apply');
const confirmation = valueAfter('--confirm');

if (!databaseArgument || !isAbsolute(databaseArgument)) {
  throw new Error('Provide an explicit absolute --database path.');
}

if (isApply && confirmation !== targetDebtName) {
  throw new Error(`Apply requires --confirm "${targetDebtName}".`);
}

const databasePath = resolve(databaseArgument);
const backupDirectory = resolve(
  backupDirectoryArgument ?? join(dirname(databasePath), 'backups'),
);

const candidateQuery = `
  SELECT t.id, t.effective_date, t.transaction_type, t.status,
         COALESCE(SUM(CASE
           WHEN a.allocation_type IN ('principal', 'extra_principal')
           THEN a.amount_cents ELSE 0 END), 0) AS principal_cents
  FROM debt_transactions t
  LEFT JOIN transaction_allocations a ON a.transaction_id = t.id
  WHERE t.debt_id = ? AND t.transaction_type = 'borrowing_draw'
  GROUP BY t.id
  HAVING principal_cents > 0
  ORDER BY t.effective_date, t.id`;

const balanceQuery = `
  SELECT d.id,
         d.original_principal_cents + COALESCE(SUM(CASE
           WHEN a.allocation_type IN ('principal', 'extra_principal')
           THEN a.amount_cents ELSE 0 END), 0) AS balance_cents
  FROM debts d
  LEFT JOIN debt_transactions t ON t.debt_id = d.id
  LEFT JOIN transaction_allocations a ON a.transaction_id = t.id
  GROUP BY d.id
  ORDER BY d.id`;

const money = (cents: number): string =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

const readCandidates = (
  database: BetterSqlite3.Database,
): { readonly debtId: string | null; readonly rows: readonly CandidateRow[] } => {
  const debt = database
    .prepare('SELECT id, debt_type FROM debts WHERE name = ?')
    .get(targetDebtName) as { id: string; debt_type: string } | undefined;
  if (!debt) return { debtId: null, rows: [] };
  if (debt.debt_type !== 'credit_card') {
    throw new Error('The exact target debt is not a credit-card debt.');
  }
  return {
    debtId: debt.id,
    rows: database.prepare(candidateQuery).all(debt.id) as CandidateRow[],
  };
};

const printPreview = (
  database: BetterSqlite3.Database,
  debtId: string | null,
  rows: readonly CandidateRow[],
): void => {
  const total = rows.reduce((sum, row) => sum + row.principal_cents, 0);
  const payments = debtId
    ? (
        database
          .prepare(
            `SELECT COUNT(*) AS count FROM debt_transactions t
           JOIN transaction_allocations a ON a.transaction_id = t.id
           WHERE t.debt_id = ? AND t.transaction_type = 'payment'
             AND a.allocation_type IN ('principal', 'extra_principal')
             AND a.amount_cents < 0`,
          )
          .get(debtId) as { count: number }
      ).count
    : 0;
  console.log(`Target: ${targetDebtName}`);
  console.log(`Transactions to reclassify: ${rows.length}`);
  console.log(`Principal total: ${money(total)}`);
  console.log(`Earliest affected date: ${rows[0]?.effective_date ?? 'none'}`);
  console.log(`Latest affected date: ${rows.at(-1)?.effective_date ?? 'none'}`);
  console.log(`Payment/reduction rows included: 0 (payment rows present: ${payments})`);
  console.log('Only positive-principal borrowing_draw rows are eligible.');
  console.log(isApply ? 'Mode: APPLY' : 'Mode: DRY RUN');
};

const run = async (): Promise<void> => {
  if (!existsSync(databasePath))
    throw new Error('The specified database does not exist.');
  const database = new BetterSqlite3(databasePath, {
    fileMustExist: true,
    readonly: !isApply,
  });
  try {
    const marker = database
      .prepare('SELECT value FROM application_settings WHERE key = ?')
      .get(REPAIR_KEY) as { value: string } | undefined;
    if (marker)
      throw new Error('This one-time reclassification has already been applied.');

    const beforeBalances = database.prepare(balanceQuery).all() as DebtBalanceRow[];
    const { debtId, rows } = readCandidates(database);
    printPreview(database, debtId, rows);
    if (!isApply) return;
    if (!debtId || rows.length === 0)
      throw new Error('There are no eligible rows to apply.');

    mkdirSync(backupDirectory, { recursive: true });
    const backupPath = join(
      backupDirectory,
      `pre-freedom-unlimited-reclassification-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite3`,
    );
    await database.backup(backupPath);

    const timestamp = new Date().toISOString();
    database.transaction(() => {
      const update = database.prepare(
        "UPDATE debt_transactions SET transaction_type = 'purchase' WHERE id = ? AND transaction_type = 'borrowing_draw'",
      );
      for (const row of rows) {
        if (update.run(row.id).changes !== 1) {
          throw new Error(`Candidate transaction ${row.id} changed before apply.`);
        }
      }
      database
        .prepare(
          `INSERT INTO application_settings (key, value, updated_at_utc)
           VALUES (?, ?, ?)`,
        )
        .run(
          REPAIR_KEY,
          JSON.stringify({ appliedAtUtc: timestamp, count: rows.length }),
          timestamp,
        );
      database
        .prepare(
          `INSERT INTO audit_events
           (id, event_type, entity_type, entity_id, action, occurred_at_utc,
            source, summary, before_metadata_json, after_metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          'historical_transaction_reclassification',
          'debt',
          debtId,
          'reclassify',
          timestamp,
          'system',
          'Reclassified positive-principal historical borrowing draws as credit-card purchases after explicit confirmation.',
          JSON.stringify({ transactionType: 'borrowing_draw', count: rows.length }),
          JSON.stringify({ transactionType: 'purchase', count: rows.length }),
        );
    })();

    const afterBalances = database.prepare(balanceQuery).all() as DebtBalanceRow[];
    if (JSON.stringify(afterBalances) !== JSON.stringify(beforeBalances)) {
      throw new Error(
        'Post-reclassification balances do not match the pre-reclassification snapshot.',
      );
    }
    if (database.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('Post-reclassification integrity check failed.');
    }
    if ((database.pragma('foreign_key_check') as unknown[]).length !== 0) {
      throw new Error('Post-reclassification foreign-key check failed.');
    }
    console.log(`Applied successfully; backup: ${backupPath}`);
  } finally {
    database.close();
  }
};

void run();
