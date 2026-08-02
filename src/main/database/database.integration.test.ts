// @vitest-environment node

import { eq } from 'drizzle-orm';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DatabaseContext, openMigratedDatabase } from './connection';
import {
  insertDebtTerm,
  insertPostedTransaction,
  reversePostedTransaction,
} from './repository';
import {
  auditEvents,
  debtTerms,
  debtTransactions,
  importBatches,
  importPostings,
  importSheetMappings,
  stagedImportRows,
  transactionAllocations,
} from './schema';
import {
  createTemporaryDatabaseLocation,
  type TemporaryDatabaseLocation,
} from './temporary-database';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'drizzle');
const PRIOR_MIGRATION_TAGS = [
  '0000_initial-core-schema',
  '0001_aberrant_the_santerians',
  '0002_foamy_betty_ross',
  '0003_peaceful_ghost_rider',
  '0004_youthful_starbolt',
] as const;
const PRIOR_0005_MIGRATION_TAGS = [
  ...PRIOR_MIGRATION_TAGS,
  '0005_large_omega_sentinel',
] as const;
const FIXED_TIMESTAMP = '2026-07-27T13:00:00.000Z';

let context: DatabaseContext;
let temporary: TemporaryDatabaseLocation;

const createFictionalDebt = () => {
  const debtId = randomUUID();

  context.sqlite
    .prepare(
      `INSERT INTO debts (
        id,
        name,
        creditor,
        owner_entity,
        debt_type,
        purpose,
        status,
        original_principal_cents,
        origination_date,
        maturity_date,
        minimum_payment_cents,
        payment_frequency,
        credit_limit_cents,
        collateral_description,
        tax_category,
        deductible_percentage_bps,
        notes,
        created_at_utc,
        updated_at_utc,
        archived_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      debtId,
      'Fictional Vehicle Note',
      'Northstar Community Bank',
      'Sample Household',
      'auto',
      'Generated integration-test obligation',
      'active',
      2_500_000,
      '2025-01-15',
      '2030-01-15',
      48_500,
      'monthly',
      null,
      'Generated vehicle description',
      'personal_nondeductible',
      0,
      'Fictional test record only.',
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
      null,
    );

  return debtId;
};

const createPriorMigrationFolder = (
  tags: readonly string[] = PRIOR_MIGRATION_TAGS,
): string => {
  const directory = mkdtempSync(join(tmpdir(), 'debt-tracker-prior-migrations-'));
  const metaDirectory = join(directory, 'meta');
  mkdirSync(metaDirectory, { recursive: true });

  for (const tag of tags) {
    copyFileSync(
      resolve(MIGRATIONS_FOLDER, `${tag}.sql`),
      resolve(directory, `${tag}.sql`),
    );
  }

  const journal = JSON.parse(
    readFileSync(resolve(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
  ) as {
    version: string;
    dialect: string;
    entries: { tag: string }[];
  };
  writeFileSync(
    resolve(metaDirectory, '_journal.json'),
    JSON.stringify(
      {
        ...journal,
        entries: journal.entries.filter((entry) => tags.includes(entry.tag)),
      },
      null,
      2,
    ),
  );

  return directory;
};

beforeEach(() => {
  temporary = createTemporaryDatabaseLocation();
  context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
});

afterEach(() => {
  context.close();
  temporary.cleanup();
});

describe('database migrations and isolation', () => {
  it('creates a new isolated temporary database from migrations', () => {
    expect(temporary.databasePath.startsWith(tmpdir())).toBe(true);
    expect(temporary.databasePath.startsWith(process.cwd())).toBe(false);
    expect(existsSync(temporary.databasePath)).toBe(true);

    const tableNames = context.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
      )
      .all() as { name: string }[];

    expect(tableNames.map((row) => row.name)).toEqual([
      'audit_events',
      'balance_reconciliations',
      'balance_snapshots',
      'debt_terms',
      'debt_transactions',
      'debts',
      'import_batches',
      'import_postings',
      'import_sheet_mappings',
      'payoff_scenarios',
      'refinance_events',
      'staged_import_rows',
      'transaction_allocations',
    ]);
  });

  it('enforces foreign keys', () => {
    expect(context.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);

    expect(() =>
      context.database
        .insert(debtTerms)
        .values({
          id: randomUUID(),
          debtId: randomUUID(),
          effectiveStartDate: '2026-01-01',
          effectiveEndDate: null,
          interestRateType: 'fixed',
          interestRateMicros: 50_000,
          dayCountConvention: 'actual_365',
          calculationConvention: 'simple_daily',
          requiredPaymentCents: 10_000,
          paymentFrequency: 'monthly',
          notes: null,
          createdAtUtc: FIXED_TIMESTAMP,
          updatedAtUtc: FIXED_TIMESTAMP,
        })
        .run(),
    ).toThrow();
  });

  it('opens an existing database containing dormant legacy import tables', () => {
    const batchId = randomUUID();
    const mappingId = randomUUID();
    const rowId = randomUUID();
    const postingId = randomUUID();
    const legacyLiveEntityId = randomUUID();

    context.database
      .insert(importBatches)
      .values({
        id: batchId,
        sourceWorkbookName: 'generated-legacy-source.xlsx',
        sourceWorkbookFingerprint: 'generated-legacy-fingerprint',
        sourceWorkbookModifiedAtUtc: FIXED_TIMESTAMP,
        status: 'closed',
        importedAtUtc: FIXED_TIMESTAMP,
        createdAtUtc: FIXED_TIMESTAMP,
        updatedAtUtc: FIXED_TIMESTAMP,
      })
      .run();
    context.database
      .insert(importSheetMappings)
      .values({
        id: mappingId,
        batchId,
        sourceSheetName: 'Generated Legacy Rows',
        proposedRecordType: 'transaction',
        reviewStatus: 'approved',
        fieldMappingJson: JSON.stringify({ amount: 'amount' }),
        notes: null,
        createdAtUtc: FIXED_TIMESTAMP,
        updatedAtUtc: FIXED_TIMESTAMP,
      })
      .run();
    context.database
      .insert(stagedImportRows)
      .values({
        id: rowId,
        batchId,
        sheetMappingId: mappingId,
        sourceSheetName: 'Generated Legacy Rows',
        sourceRowNumber: 2,
        sourceCellReferencesJson: JSON.stringify({ amount: 'A2' }),
        sourceDisplayedValuesJson: JSON.stringify({ amount: '125.00' }),
        sourceFormulasJson: JSON.stringify({}),
        proposedRecordType: 'transaction',
        activityClassification: 'actual',
        normalizedValuesJson: JSON.stringify({ amount: '125.00' }),
        validationMessagesJson: JSON.stringify([]),
        duplicateCandidateJson: null,
        reconciliationExceptionJson: null,
        reviewStatus: 'approved',
        reviewNotes: null,
        reviewedAtUtc: FIXED_TIMESTAMP,
        createdAtUtc: FIXED_TIMESTAMP,
        updatedAtUtc: FIXED_TIMESTAMP,
      })
      .run();
    context.database
      .insert(importPostings)
      .values({
        id: postingId,
        batchId,
        stagedRowId: rowId,
        liveEntityType: 'debt_transaction',
        liveEntityId: legacyLiveEntityId,
        postedAtUtc: FIXED_TIMESTAMP,
        createdAtUtc: FIXED_TIMESTAMP,
      })
      .run();

    context.close();
    context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);

    expect(context.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(context.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(context.database.select().from(importPostings).all()).toHaveLength(1);
  });

  it('migrates a representative existing database with prior reconciliation records', () => {
    context.close();
    temporary.cleanup();

    const priorMigrationFolder = createPriorMigrationFolder();
    temporary = createTemporaryDatabaseLocation();
    context = openMigratedDatabase(temporary.databasePath, priorMigrationFolder);

    const debtId = createFictionalDebt();
    const reconciliationId = randomUUID();
    context.sqlite
      .prepare(
        `INSERT INTO balance_reconciliations (
          id, debt_id, statement_date, statement_ending_balance_cents,
          application_calculated_balance_cents, calculated_difference_cents,
          reconciliation_status, explanation, approved_adjustment_transaction_id,
          source_reference, supporting_notes, created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        reconciliationId,
        debtId,
        '2026-01-31',
        2_500_000,
        2_500_000,
        0,
        'reconciled',
        null,
        null,
        'Generated prior statement',
        null,
        FIXED_TIMESTAMP,
        FIXED_TIMESTAMP,
      );
    context.close();

    context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);
    const migrated = context.sqlite
      .prepare(
        `SELECT lifecycle_status, supersedes_reconciliation_id,
          superseded_by_reconciliation_id, voided_at_utc, superseded_at_utc
         FROM balance_reconciliations
         WHERE id = ?`,
      )
      .get(reconciliationId) as
      | {
          lifecycle_status: string;
          supersedes_reconciliation_id: string | null;
          superseded_by_reconciliation_id: string | null;
          voided_at_utc: string | null;
          superseded_at_utc: string | null;
        }
      | undefined;

    expect(migrated).toEqual({
      lifecycle_status: 'current',
      supersedes_reconciliation_id: null,
      superseded_by_reconciliation_id: null,
      voided_at_utc: null,
      superseded_at_utc: null,
    });

    const correctedId = randomUUID();
    context.sqlite
      .prepare(
        `UPDATE balance_reconciliations
         SET lifecycle_status = 'superseded',
           superseded_at_utc = ?,
           updated_at_utc = ?
         WHERE id = ?`,
      )
      .run(FIXED_TIMESTAMP, FIXED_TIMESTAMP, reconciliationId);
    context.sqlite
      .prepare(
        `INSERT INTO balance_reconciliations (
          id, debt_id, statement_date, statement_ending_balance_cents,
          application_calculated_balance_cents, calculated_difference_cents,
          reconciliation_status, explanation, approved_adjustment_transaction_id,
          source_reference, supporting_notes, lifecycle_status,
          supersedes_reconciliation_id, superseded_by_reconciliation_id,
          voided_at_utc, superseded_at_utc, created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        correctedId,
        debtId,
        '2026-01-31',
        2_500_000,
        2_500_000,
        0,
        'reconciled',
        null,
        null,
        'Generated corrected statement',
        null,
        'current',
        reconciliationId,
        null,
        null,
        null,
        FIXED_TIMESTAMP,
        FIXED_TIMESTAMP,
      );
    context.sqlite
      .prepare(
        `UPDATE balance_reconciliations
         SET superseded_by_reconciliation_id = ?
         WHERE id = ?`,
      )
      .run(correctedId, reconciliationId);

    expect(context.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(context.sqlite.pragma('foreign_key_check')).toEqual([]);

    rmSync(priorMigrationFolder, { force: true, recursive: true });
  });

  it('upgrades a representative 0005 database with transaction foreign-key references through 0006', () => {
    context.close();
    temporary.cleanup();

    const priorMigrationFolder = createPriorMigrationFolder(PRIOR_0005_MIGRATION_TAGS);
    temporary = createTemporaryDatabaseLocation();
    context = openMigratedDatabase(temporary.databasePath, priorMigrationFolder);

    const debtId = createFictionalDebt();
    insertDebtTerm(context.database, {
      id: randomUUID(),
      debtId,
      effectiveStartDate: '2025-01-15',
      effectiveEndDate: null,
      interestRateType: 'fixed',
      interestRateMicros: 49_000,
      dayCountConvention: 'actual_365',
      calculationConvention: 'simple_daily',
      requiredPaymentCents: 48_500,
      paymentFrequency: 'monthly',
      notes: 'Generated prior terms.',
      createdAtUtc: FIXED_TIMESTAMP,
      updatedAtUtc: FIXED_TIMESTAMP,
    });

    const originalPaymentId = randomUUID();
    const editReversalId = randomUUID();
    const replacementPaymentId = randomUUID();
    const escrowDisbursementId = randomUUID();
    const manualReversalId = randomUUID();
    const insertTransaction = context.sqlite.prepare(
      `INSERT INTO debt_transactions (
        id, debt_id, transaction_type, effective_date, posting_date,
        total_amount_cents, status, description, source_type, source_reference,
        reversal_of_transaction_id, supersedes_transaction_id, created_at_utc,
        updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAllocation = context.sqlite.prepare(
      `INSERT INTO transaction_allocations (
        id, transaction_id, allocation_type, amount_cents, notes,
        created_at_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    insertTransaction.run(
      originalPaymentId,
      debtId,
      'payment',
      '2026-01-15',
      '2026-01-15',
      -50_000,
      'superseded',
      'Generated superseded payment.',
      'manual',
      null,
      null,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      originalPaymentId,
      'principal',
      -40_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      originalPaymentId,
      'interest',
      -10_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );

    insertTransaction.run(
      editReversalId,
      debtId,
      'reversal',
      '2026-01-15',
      '2026-01-15',
      50_000,
      'posted',
      'Generated edit reversal.',
      'system',
      originalPaymentId,
      originalPaymentId,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      editReversalId,
      'principal',
      40_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      editReversalId,
      'interest',
      10_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );

    insertTransaction.run(
      replacementPaymentId,
      debtId,
      'payment',
      '2026-01-15',
      '2026-01-15',
      -55_000,
      'reversed',
      'Generated replacement payment.',
      'manual',
      null,
      null,
      originalPaymentId,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      replacementPaymentId,
      'principal',
      -42_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      replacementPaymentId,
      'interest',
      -8_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      replacementPaymentId,
      'escrow',
      -5_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );

    insertTransaction.run(
      manualReversalId,
      debtId,
      'reversal',
      '2026-01-16',
      '2026-01-16',
      55_000,
      'posted',
      'Generated manual reversal.',
      'system',
      replacementPaymentId,
      replacementPaymentId,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      manualReversalId,
      'principal',
      42_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      manualReversalId,
      'interest',
      8_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      manualReversalId,
      'escrow',
      5_000,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );

    insertTransaction.run(
      escrowDisbursementId,
      debtId,
      'escrow_disbursement',
      '2026-02-01',
      '2026-02-01',
      12_500,
      'posted',
      'Generated escrow disbursement.',
      'manual',
      null,
      null,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );
    insertAllocation.run(
      randomUUID(),
      escrowDisbursementId,
      'escrow',
      12_500,
      null,
      FIXED_TIMESTAMP,
      FIXED_TIMESTAMP,
    );

    context.sqlite
      .prepare(
        `INSERT INTO balance_reconciliations (
          id, debt_id, statement_date, statement_ending_balance_cents,
          application_calculated_balance_cents, calculated_difference_cents,
          reconciliation_status, explanation, approved_adjustment_transaction_id,
          source_reference, supporting_notes, lifecycle_status,
          supersedes_reconciliation_id, superseded_by_reconciliation_id,
          voided_at_utc, superseded_at_utc, created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        debtId,
        '2026-02-28',
        2_470_000,
        2_470_000,
        0,
        'reconciled',
        null,
        null,
        'Generated prior statement',
        null,
        'current',
        null,
        null,
        null,
        null,
        FIXED_TIMESTAMP,
        FIXED_TIMESTAMP,
      );

    const before = context.sqlite
      .prepare(
        `SELECT COUNT(*) AS transaction_count,
          COALESCE(SUM(total_amount_cents), 0) AS transaction_total,
          (SELECT COUNT(*) FROM transaction_allocations) AS allocation_count,
          (SELECT COALESCE(SUM(amount_cents), 0) FROM transaction_allocations)
            AS allocation_total,
          (SELECT COUNT(*) FROM balance_reconciliations) AS reconciliation_count
         FROM debt_transactions`,
      )
      .get();

    expect(context.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(context.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    context.close();

    context = openMigratedDatabase(temporary.databasePath, MIGRATIONS_FOLDER);

    const after = context.sqlite
      .prepare(
        `SELECT COUNT(*) AS transaction_count,
          COALESCE(SUM(total_amount_cents), 0) AS transaction_total,
          (SELECT COUNT(*) FROM transaction_allocations) AS allocation_count,
          (SELECT COALESCE(SUM(amount_cents), 0) FROM transaction_allocations)
            AS allocation_total,
          (SELECT COUNT(*) FROM balance_reconciliations) AS reconciliation_count
         FROM debt_transactions`,
      )
      .get();
    const statuses = context.sqlite
      .prepare(
        'SELECT status, COUNT(*) AS count FROM debt_transactions GROUP BY status ORDER BY status',
      )
      .all();
    const temporaryRebuildTable = context.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__new_debt_transactions'",
      )
      .get();
    const migrationCount = context.sqlite
      .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations')
      .get() as { count: number };

    expect(after).toEqual(before);
    expect(statuses).toEqual([
      { status: 'posted', count: 3 },
      { status: 'reversed', count: 1 },
      { status: 'superseded', count: 1 },
    ]);
    expect(temporaryRebuildTable).toBeUndefined();
    expect(migrationCount.count).toBe(10);
    expect(context.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(context.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');

    context.sqlite
      .prepare(
        `INSERT INTO debt_transactions (
          id, debt_id, transaction_type, effective_date, posting_date,
          total_amount_cents, status, description, source_type, source_reference,
          reversal_of_transaction_id, supersedes_transaction_id, created_at_utc,
          updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        debtId,
        'payment',
        '2026-03-01',
        '2026-03-01',
        -1_000,
        'voided',
        'Generated voided row constraint check.',
        'manual',
        null,
        null,
        null,
        FIXED_TIMESTAMP,
        FIXED_TIMESTAMP,
      );

    rmSync(priorMigrationFolder, { force: true, recursive: true });
  });
});

describe('effective-dated terms', () => {
  it('preserves distinct historical rate periods and rejects overlap', () => {
    const debtId = createFictionalDebt();

    insertDebtTerm(context.database, {
      id: randomUUID(),
      debtId,
      effectiveStartDate: '2025-01-15',
      effectiveEndDate: '2025-12-31',
      interestRateType: 'fixed',
      interestRateMicros: 49_000,
      dayCountConvention: 'actual_365',
      calculationConvention: 'simple_daily',
      requiredPaymentCents: 48_500,
      paymentFrequency: 'monthly',
      notes: 'Generated historical term.',
      createdAtUtc: FIXED_TIMESTAMP,
      updatedAtUtc: FIXED_TIMESTAMP,
    });
    insertDebtTerm(context.database, {
      id: randomUUID(),
      debtId,
      effectiveStartDate: '2026-01-01',
      effectiveEndDate: null,
      interestRateType: 'variable',
      interestRateMicros: 52_500,
      dayCountConvention: 'actual_365',
      calculationConvention: 'simple_daily',
      requiredPaymentCents: 49_000,
      paymentFrequency: 'monthly',
      notes: 'Generated current term.',
      createdAtUtc: FIXED_TIMESTAMP,
      updatedAtUtc: FIXED_TIMESTAMP,
    });

    const savedTerms = context.database
      .select()
      .from(debtTerms)
      .where(eq(debtTerms.debtId, debtId))
      .all();

    expect(savedTerms).toHaveLength(2);
    expect(savedTerms.map((term) => term.interestRateMicros)).toEqual([49_000, 52_500]);

    expect(() =>
      insertDebtTerm(context.database, {
        id: randomUUID(),
        debtId,
        effectiveStartDate: '2025-06-01',
        effectiveEndDate: '2026-06-01',
        interestRateType: 'fixed',
        interestRateMicros: 50_000,
        dayCountConvention: 'actual_365',
        calculationConvention: 'simple_daily',
        requiredPaymentCents: 48_500,
        paymentFrequency: 'monthly',
        notes: null,
        createdAtUtc: FIXED_TIMESTAMP,
        updatedAtUtc: FIXED_TIMESTAMP,
      }),
    ).toThrow('Debt term effective periods cannot overlap.');
  });
});

describe('posted transaction controls', () => {
  it('reverses a posted transaction without deleting the original', () => {
    const debtId = createFictionalDebt();
    const originalTransactionId = randomUUID();

    insertPostedTransaction(context.database, {
      transaction: {
        id: originalTransactionId,
        debtId,
        transactionType: 'payment',
        effectiveDate: '2026-06-15',
        postingDate: '2026-06-16',
        totalAmountCents: -50_000,
        status: 'posted',
        description: 'Generated monthly payment.',
        sourceType: 'manual',
        sourceReference: null,
        reversalOfTransactionId: null,
        supersedesTransactionId: null,
        createdAtUtc: FIXED_TIMESTAMP,
        updatedAtUtc: FIXED_TIMESTAMP,
      },
      allocations: [
        {
          id: randomUUID(),
          transactionId: originalTransactionId,
          allocationType: 'principal',
          amountCents: -40_000,
          notes: null,
          createdAtUtc: FIXED_TIMESTAMP,
          updatedAtUtc: FIXED_TIMESTAMP,
        },
        {
          id: randomUUID(),
          transactionId: originalTransactionId,
          allocationType: 'interest',
          amountCents: -10_000,
          notes: null,
          createdAtUtc: FIXED_TIMESTAMP,
          updatedAtUtc: FIXED_TIMESTAMP,
        },
      ],
    });

    const reversalId = reversePostedTransaction(context.database, {
      originalTransactionId,
      expectedUpdatedAtUtc: FIXED_TIMESTAMP,
      effectiveDate: '2026-06-17',
      postingDate: '2026-06-17',
      description: 'Reverse generated payment entered in error.',
      occurredAtUtc: '2026-07-27T13:05:00.000Z',
    });

    const savedTransactions = context.database
      .select()
      .from(debtTransactions)
      .where(eq(debtTransactions.debtId, debtId))
      .all();
    const reversalAllocations = context.database
      .select()
      .from(transactionAllocations)
      .where(eq(transactionAllocations.transactionId, reversalId))
      .all();

    expect(savedTransactions).toHaveLength(2);
    expect(
      savedTransactions.find((transaction) => transaction.id === originalTransactionId)
        ?.status,
    ).toBe('reversed');
    expect(
      savedTransactions.find((transaction) => transaction.id === reversalId),
    ).toMatchObject({
      reversalOfTransactionId: originalTransactionId,
      totalAmountCents: 50_000,
      transactionType: 'reversal',
    });
    expect(
      reversalAllocations.reduce(
        (total, allocation) => total + allocation.amountCents,
        0,
      ),
    ).toBe(50_000);
    expect(context.database.select().from(auditEvents).all()).toHaveLength(1);
  });

  it('rejects projected and scenario statuses in the posted ledger', () => {
    const debtId = createFictionalDebt();

    expect(() =>
      context.sqlite
        .prepare(
          `INSERT INTO debt_transactions (
            id, debt_id, transaction_type, effective_date, posting_date,
            total_amount_cents, status, description, source_type,
            created_at_utc, updated_at_utc
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          debtId,
          'payment',
          '2026-06-15',
          '2026-06-16',
          -50_000,
          'projected',
          'Generated invalid projected row.',
          'system',
          FIXED_TIMESTAMP,
          FIXED_TIMESTAMP,
        ),
    ).toThrow();

    expect(() =>
      context.sqlite
        .prepare(
          `INSERT INTO debt_transactions (
            id, debt_id, transaction_type, effective_date, posting_date,
            total_amount_cents, status, description, source_type,
            created_at_utc, updated_at_utc
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          debtId,
          'payment',
          '2026-06-15',
          '2026-06-16',
          -50_000,
          'scenario',
          'Generated invalid scenario row.',
          'system',
          FIXED_TIMESTAMP,
          FIXED_TIMESTAMP,
        ),
    ).toThrow();
  });
});
