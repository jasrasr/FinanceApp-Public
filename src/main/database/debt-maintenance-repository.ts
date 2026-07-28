import { and, asc, eq, isNotNull, isNull, lte, ne } from 'drizzle-orm';
import type { AppDatabase } from './connection';
import {
  auditEvents,
  balanceReconciliations,
  balanceSnapshots,
  debtTerms,
  debtTransactions,
  debts,
  importBatches,
  importPostings,
  importSheetMappings,
  payoffScenarios,
  stagedImportRows,
  transactionAllocations,
} from './schema';
import {
  auditEventInsertSchema,
  balanceReconciliationInputSchema,
  balanceReconciliationRecordSchema,
  balanceSnapshotInsertSchema,
  debtInsertSchema,
  debtTermInsertSchema,
  debtTransactionInsertSchema,
  importBatchInsertSchema,
  importPostingInsertSchema,
  importSheetMappingInsertSchema,
  payoffScenarioInsertSchema,
  stagedImportRowInsertSchema,
  transactionAllocationInsertSchema,
  type AuditEventInsert,
  type BalanceReconciliationInput,
  type BalanceSnapshotInsert,
  type DebtInsert,
  type DebtTermInsert,
  type DebtTransactionInsert,
  type ImportBatchInsert,
  type ImportPostingInsert,
  type ImportSheetMappingInsert,
  type PayoffScenarioInsert,
  type StagedImportRowInsert,
  type TransactionAllocationInsert,
} from './validation';
import { validateTransactionSignConvention } from '../domain/accounting/transaction-validation';

export type DebtRecord = typeof debts.$inferSelect;
export type DebtTermRecord = typeof debtTerms.$inferSelect;
export type DebtTransactionRecord = typeof debtTransactions.$inferSelect;
export type TransactionAllocationRecord = typeof transactionAllocations.$inferSelect;
export type BalanceSnapshotRecord = typeof balanceSnapshots.$inferSelect;
export type BalanceReconciliationRecord = typeof balanceReconciliations.$inferSelect;
export type ImportBatchRecord = typeof importBatches.$inferSelect;
export type ImportPostingRecord = typeof importPostings.$inferSelect;
export type ImportSheetMappingRecord = typeof importSheetMappings.$inferSelect;
export type PayoffScenarioRecord = typeof payoffScenarios.$inferSelect;
export type StagedImportRowRecord = typeof stagedImportRows.$inferSelect;

export interface DebtWithTermsRecord {
  readonly debt: DebtRecord;
  readonly terms: readonly DebtTermRecord[];
}

export interface DebtTransactionWithAllocationsRecord {
  readonly transaction: DebtTransactionRecord;
  readonly allocations: readonly TransactionAllocationRecord[];
}

export interface DebtWithActivityRecord extends DebtWithTermsRecord {
  readonly transactions: readonly DebtTransactionWithAllocationsRecord[];
  readonly balanceSnapshots: readonly BalanceSnapshotRecord[];
  readonly balanceReconciliations: readonly BalanceReconciliationRecord[];
}

export interface ImportBatchWithRowsRecord {
  readonly batch: ImportBatchRecord;
  readonly sheetMappings: readonly ImportSheetMappingRecord[];
  readonly stagedRows: readonly StagedImportRowRecord[];
  readonly postings: readonly ImportPostingRecord[];
}

export interface PostedTransactionInput {
  readonly transaction: DebtTransactionInsert;
  readonly allocations: readonly TransactionAllocationInsert[];
}

export interface CreateBalanceReconciliationRecordInput {
  readonly reconciliation: BalanceReconciliationInput;
  readonly adjustment?: PostedTransactionInput;
  readonly snapshot?: BalanceSnapshotInsert;
  readonly auditInputs: readonly AuditEventInsert[];
}

export interface PostImportBatchRecordInput {
  readonly batchId: string;
  readonly updatedAtUtc: string;
  readonly debts: readonly DebtInsert[];
  readonly terms: readonly DebtTermInsert[];
  readonly transactions: readonly DebtTransactionInsert[];
  readonly allocations: readonly TransactionAllocationInsert[];
  readonly snapshots: readonly BalanceSnapshotInsert[];
  readonly postings: readonly ImportPostingInsert[];
  readonly auditInputs: readonly AuditEventInsert[];
}

export interface DebtUpdateValues {
  readonly name: string;
  readonly creditor: string;
  readonly ownerEntity: string;
  readonly debtType: DebtRecord['debtType'];
  readonly purpose: string;
  readonly status: DebtRecord['status'];
  readonly maturityDate: string | null;
  readonly creditLimitCents: number | null;
  readonly collateralDescription: string | null;
  readonly taxCategory: DebtRecord['taxCategory'];
  readonly deductiblePercentageBps: number;
  readonly notes: string | null;
  readonly updatedAtUtc: string;
}

export class RepositoryNotFoundError extends Error {}
export class RepositoryConflictError extends Error {}

const getTerms = (database: AppDatabase, debtId: string): readonly DebtTermRecord[] =>
  database
    .select()
    .from(debtTerms)
    .where(eq(debtTerms.debtId, debtId))
    .orderBy(asc(debtTerms.effectiveStartDate))
    .all();

const getTransactionAllocations = (
  database: AppDatabase,
  transactionId: string,
): readonly TransactionAllocationRecord[] =>
  database
    .select()
    .from(transactionAllocations)
    .where(eq(transactionAllocations.transactionId, transactionId))
    .orderBy(asc(transactionAllocations.createdAtUtc))
    .all();

const getTransactions = (
  database: AppDatabase,
  debtId: string,
): readonly DebtTransactionWithAllocationsRecord[] =>
  database
    .select()
    .from(debtTransactions)
    .where(eq(debtTransactions.debtId, debtId))
    .orderBy(
      asc(debtTransactions.effectiveDate),
      asc(debtTransactions.postingDate),
      asc(debtTransactions.createdAtUtc),
    )
    .all()
    .map((transaction) => ({
      transaction,
      allocations: getTransactionAllocations(database, transaction.id),
    }));

const getBalanceSnapshots = (
  database: AppDatabase,
  debtId: string,
): readonly BalanceSnapshotRecord[] =>
  database
    .select()
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.debtId, debtId))
    .orderBy(asc(balanceSnapshots.effectiveDate), asc(balanceSnapshots.createdAtUtc))
    .all();

const getBalanceReconciliations = (
  database: AppDatabase,
  debtId: string,
): readonly BalanceReconciliationRecord[] =>
  database
    .select()
    .from(balanceReconciliations)
    .where(eq(balanceReconciliations.debtId, debtId))
    .orderBy(
      asc(balanceReconciliations.statementDate),
      asc(balanceReconciliations.createdAtUtc),
    )
    .all();

export const listDebtRecords = (
  database: AppDatabase,
  includeArchived: boolean,
): readonly DebtWithTermsRecord[] => {
  const query = database.select().from(debts);
  const debtRows = includeArchived
    ? query.orderBy(asc(debts.name)).all()
    : query.where(isNull(debts.archivedAtUtc)).orderBy(asc(debts.name)).all();

  return debtRows.map((debt) => ({
    debt,
    terms: getTerms(database, debt.id),
  }));
};

export const getDebtRecord = (
  database: AppDatabase,
  debtId: string,
): DebtWithTermsRecord | undefined => {
  const debt = database.select().from(debts).where(eq(debts.id, debtId)).get();

  return debt ? { debt, terms: getTerms(database, debt.id) } : undefined;
};

export const getDebtTransactionRecord = (
  database: AppDatabase,
  transactionId: string,
): DebtTransactionRecord | undefined =>
  database
    .select()
    .from(debtTransactions)
    .where(eq(debtTransactions.id, transactionId))
    .get();

export const getDebtActivityRecord = (
  database: AppDatabase,
  debtId: string,
): DebtWithActivityRecord | undefined => {
  const record = getDebtRecord(database, debtId);

  return record
    ? {
        ...record,
        transactions: getTransactions(database, debtId),
        balanceSnapshots: getBalanceSnapshots(database, debtId),
        balanceReconciliations: getBalanceReconciliations(database, debtId),
      }
    : undefined;
};

export const listActiveDebtActivityRecords = (
  database: AppDatabase,
): readonly DebtWithActivityRecord[] => {
  const debtRows = database
    .select()
    .from(debts)
    .where(isNull(debts.archivedAtUtc))
    .orderBy(asc(debts.name))
    .all();

  return debtRows.map((debt) => ({
    debt,
    terms: getTerms(database, debt.id),
    transactions: getTransactions(database, debt.id),
    balanceSnapshots: getBalanceSnapshots(database, debt.id),
    balanceReconciliations: getBalanceReconciliations(database, debt.id),
  }));
};

export const listDebtActivityRecords = (
  database: AppDatabase,
  includeArchived: boolean,
): readonly DebtWithActivityRecord[] => {
  const debtRows = includeArchived
    ? database.select().from(debts).orderBy(asc(debts.name)).all()
    : database
        .select()
        .from(debts)
        .where(isNull(debts.archivedAtUtc))
        .orderBy(asc(debts.name))
        .all();

  return debtRows.map((debt) => ({
    debt,
    terms: getTerms(database, debt.id),
    transactions: getTransactions(database, debt.id),
    balanceSnapshots: getBalanceSnapshots(database, debt.id),
    balanceReconciliations: getBalanceReconciliations(database, debt.id),
  }));
};

export const calculateLedgerBalanceThroughDate = (
  database: AppDatabase,
  debtId: string,
  statementDate: string,
): number => {
  const debt = database
    .select({
      originalPrincipalCents: debts.originalPrincipalCents,
    })
    .from(debts)
    .where(eq(debts.id, debtId))
    .get();

  if (!debt) {
    throw new RepositoryNotFoundError('Debt was not found.');
  }

  const rows = database
    .select({
      allocationType: transactionAllocations.allocationType,
      amountCents: transactionAllocations.amountCents,
      totalAmountCents: debtTransactions.totalAmountCents,
      transactionId: debtTransactions.id,
    })
    .from(transactionAllocations)
    .innerJoin(
      debtTransactions,
      eq(transactionAllocations.transactionId, debtTransactions.id),
    )
    .where(
      and(
        eq(debtTransactions.debtId, debtId),
        lte(debtTransactions.effectiveDate, statementDate),
        ne(debtTransactions.status, 'superseded'),
      ),
    )
    .all();

  const transactionTotals = new Map<string, number>();
  let escrowAllocationTotal = 0;

  for (const row of rows) {
    transactionTotals.set(row.transactionId, row.totalAmountCents);
    if (row.allocationType === 'escrow') {
      escrowAllocationTotal += row.amountCents;
    }
  }

  const transactionTotal =
    [...transactionTotals.values()].reduce((total, amount) => total + amount, 0) -
    escrowAllocationTotal;

  if (!Number.isSafeInteger(transactionTotal)) {
    throw new RangeError('Ledger transaction total exceeds the safe-integer range.');
  }

  const balance = debt.originalPrincipalCents + transactionTotal;

  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new RangeError(
      'Application-calculated debt balance must be nonnegative safe-integer cents.',
    );
  }

  return balance;
};

export const calculateEscrowBalanceThroughDate = (
  database: AppDatabase,
  debtId: string,
  effectiveDate: string,
): number => {
  const rows = database
    .select({
      transactionType: debtTransactions.transactionType,
      amountCents: transactionAllocations.amountCents,
    })
    .from(transactionAllocations)
    .innerJoin(
      debtTransactions,
      eq(transactionAllocations.transactionId, debtTransactions.id),
    )
    .where(
      and(
        eq(debtTransactions.debtId, debtId),
        lte(debtTransactions.effectiveDate, effectiveDate),
        ne(debtTransactions.status, 'superseded'),
        eq(transactionAllocations.allocationType, 'escrow'),
      ),
    )
    .all();

  const balance = rows.reduce((total, row) => {
    if (row.transactionType === 'payment') return total - row.amountCents;
    if (
      row.transactionType === 'escrow_disbursement' ||
      row.transactionType === 'escrow_refund'
    ) {
      return total - row.amountCents;
    }
    return total + row.amountCents;
  }, 0);

  if (!Number.isSafeInteger(balance)) {
    throw new RangeError('Escrow balance exceeds the safe-integer range.');
  }

  return balance;
};

export const createDebtAndInitialTerm = (
  database: AppDatabase,
  debtInput: DebtInsert,
  termInput: DebtTermInsert,
  auditInputs: readonly AuditEventInsert[],
): void => {
  const debt = debtInsertSchema.parse(debtInput);
  const term = debtTermInsertSchema.parse(termInput);
  const audit = auditInputs.map((event) => auditEventInsertSchema.parse(event));

  database.transaction((transaction) => {
    transaction.insert(debts).values(debt).run();
    transaction.insert(debtTerms).values(term).run();
    transaction.insert(auditEvents).values(audit).run();
  });
};

export const createPostedTransactionRecord = (
  database: AppDatabase,
  transactionInput: DebtTransactionInsert,
  allocationInputs: readonly TransactionAllocationInsert[],
  auditInputs: readonly AuditEventInsert[],
): void => {
  const transaction = debtTransactionInsertSchema.parse(transactionInput);
  const allocations = allocationInputs.map((allocation) =>
    transactionAllocationInsertSchema.parse(allocation),
  );
  const audit = auditInputs.map((event) => auditEventInsertSchema.parse(event));

  if (allocations.some((allocation) => allocation.transactionId !== transaction.id)) {
    throw new Error('Every allocation must reference its transaction.');
  }

  const errors = validateTransactionSignConvention(transaction, allocations);

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  database.transaction((transactionDb) => {
    transactionDb.insert(debtTransactions).values(transaction).run();
    transactionDb.insert(transactionAllocations).values(allocations).run();
    transactionDb.insert(auditEvents).values(audit).run();
  });
};

export const createBalanceSnapshotRecord = (
  database: AppDatabase,
  snapshotInput: BalanceSnapshotInsert,
  auditInput: AuditEventInsert,
): void => {
  const snapshot = balanceSnapshotInsertSchema.parse(snapshotInput);
  const audit = auditEventInsertSchema.parse(auditInput);

  database.transaction((transaction) => {
    transaction.insert(balanceSnapshots).values(snapshot).run();
    transaction.insert(auditEvents).values(audit).run();
  });
};

export const createBalanceReconciliationRecord = (
  database: AppDatabase,
  input: CreateBalanceReconciliationRecordInput,
): void => {
  const reconciliationInput = balanceReconciliationInputSchema.parse(
    input.reconciliation,
  );
  const reconciliation = balanceReconciliationRecordSchema.parse({
    ...reconciliationInput,
    calculatedDifferenceCents:
      reconciliationInput.statementEndingBalanceCents -
      reconciliationInput.applicationCalculatedBalanceCents,
  });
  const adjustment = input.adjustment
    ? {
        transaction: debtTransactionInsertSchema.parse(input.adjustment.transaction),
        allocations: input.adjustment.allocations.map((allocation) =>
          transactionAllocationInsertSchema.parse(allocation),
        ),
      }
    : null;
  const snapshot = input.snapshot
    ? balanceSnapshotInsertSchema.parse(input.snapshot)
    : null;
  const audit = input.auditInputs.map((event) => auditEventInsertSchema.parse(event));

  if (
    reconciliation.reconciliationStatus === 'reconciled_with_adjustment' &&
    !adjustment
  ) {
    throw new Error('An approved adjustment transaction is required.');
  }

  if (
    reconciliation.reconciliationStatus !== 'reconciled_with_adjustment' &&
    adjustment
  ) {
    throw new Error('Only reconciled-with-adjustment records may create adjustments.');
  }

  if (adjustment) {
    if (reconciliation.approvedAdjustmentTransactionId !== adjustment.transaction.id) {
      throw new Error(
        'Reconciliation must link to the approved adjustment transaction.',
      );
    }

    if (
      adjustment.transaction.debtId !== reconciliation.debtId ||
      adjustment.transaction.transactionType !== 'approved_reconciliation_adjustment' ||
      adjustment.transaction.status !== 'posted' ||
      adjustment.transaction.sourceType !== 'reconciliation'
    ) {
      throw new Error(
        'Approved adjustment must be a posted reconciliation adjustment for the same debt.',
      );
    }

    if (
      adjustment.allocations.some(
        (allocation) => allocation.transactionId !== adjustment.transaction.id,
      )
    ) {
      throw new Error('Every allocation must reference its transaction.');
    }

    const errors = validateTransactionSignConvention(
      adjustment.transaction,
      adjustment.allocations,
    );

    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }
  }

  database.transaction((transactionDb) => {
    if (adjustment) {
      transactionDb.insert(debtTransactions).values(adjustment.transaction).run();
      transactionDb.insert(transactionAllocations).values(adjustment.allocations).run();
    }

    if (snapshot) {
      transactionDb
        .insert(balanceSnapshots)
        .values(snapshot)
        .onConflictDoNothing()
        .run();
    }

    transactionDb.insert(balanceReconciliations).values(reconciliation).run();
    transactionDb.insert(auditEvents).values(audit).run();
  });
};

export const updateDebtDescriptiveRecord = (
  database: AppDatabase,
  debtId: string,
  expectedUpdatedAtUtc: string,
  changes: DebtUpdateValues,
  auditInput: AuditEventInsert,
): void => {
  const audit = auditEventInsertSchema.parse(auditInput);

  database.transaction((transaction) => {
    const result = transaction
      .update(debts)
      .set(changes)
      .where(
        and(
          eq(debts.id, debtId),
          eq(debts.updatedAtUtc, expectedUpdatedAtUtc),
          isNull(debts.archivedAtUtc),
        ),
      )
      .run();

    if (result.changes !== 1) {
      const existing = transaction
        .select({ id: debts.id })
        .from(debts)
        .where(eq(debts.id, debtId))
        .get();

      if (!existing) {
        throw new RepositoryNotFoundError('Debt was not found.');
      }

      throw new RepositoryConflictError(
        'Debt changed or was archived before this update was saved.',
      );
    }

    transaction.insert(auditEvents).values(audit).run();
  });
};

export interface AppendDebtTermInput {
  readonly debtId: string;
  readonly expectedDebtUpdatedAtUtc: string;
  readonly priorTermId: string;
  readonly expectedPriorEndDate: string | null;
  readonly priorEndDate: string | null;
  readonly debtUpdatedAtUtc: string;
  readonly term: DebtTermInsert;
  readonly audit: AuditEventInsert;
}

export const appendDebtTermRecord = (
  database: AppDatabase,
  input: AppendDebtTermInput,
): void => {
  const term = debtTermInsertSchema.parse(input.term);
  const audit = auditEventInsertSchema.parse(input.audit);

  database.transaction((transaction) => {
    if (input.expectedPriorEndDate === null) {
      const priorUpdate = transaction
        .update(debtTerms)
        .set({
          effectiveEndDate: input.priorEndDate,
          updatedAtUtc: input.debtUpdatedAtUtc,
        })
        .where(
          and(
            eq(debtTerms.id, input.priorTermId),
            eq(debtTerms.debtId, input.debtId),
            isNull(debtTerms.effectiveEndDate),
          ),
        )
        .run();

      if (priorUpdate.changes !== 1) {
        throw new RepositoryConflictError(
          'Debt terms changed before the new period was saved.',
        );
      }
    }

    const debtUpdate = transaction
      .update(debts)
      .set({ updatedAtUtc: input.debtUpdatedAtUtc })
      .where(
        and(
          eq(debts.id, input.debtId),
          eq(debts.updatedAtUtc, input.expectedDebtUpdatedAtUtc),
          isNull(debts.archivedAtUtc),
        ),
      )
      .run();

    if (debtUpdate.changes !== 1) {
      throw new RepositoryConflictError(
        'Debt changed or was archived before the new term was saved.',
      );
    }

    transaction.insert(debtTerms).values(term).run();
    transaction.insert(auditEvents).values(audit).run();
  });
};

export const setDebtArchivedState = (
  database: AppDatabase,
  debtId: string,
  expectedUpdatedAtUtc: string,
  archivedAtUtc: string | null,
  auditInput: AuditEventInsert,
): void => {
  const audit = auditEventInsertSchema.parse(auditInput);

  database.transaction((transaction) => {
    const stateCondition =
      archivedAtUtc === null
        ? isNotNull(debts.archivedAtUtc)
        : isNull(debts.archivedAtUtc);
    const result = transaction
      .update(debts)
      .set({
        archivedAtUtc,
        updatedAtUtc: audit.occurredAtUtc,
      })
      .where(
        and(
          eq(debts.id, debtId),
          eq(debts.updatedAtUtc, expectedUpdatedAtUtc),
          stateCondition,
        ),
      )
      .run();

    if (result.changes !== 1) {
      const existing = transaction
        .select({ id: debts.id })
        .from(debts)
        .where(eq(debts.id, debtId))
        .get();

      if (!existing) {
        throw new RepositoryNotFoundError('Debt was not found.');
      }

      throw new RepositoryConflictError(
        'Debt changed or its archive state no longer matches.',
      );
    }

    transaction.insert(auditEvents).values(audit).run();
  });
};

export const createImportBatchRecord = (
  database: AppDatabase,
  input: {
    readonly batch: ImportBatchInsert;
    readonly sheetMappings: readonly ImportSheetMappingInsert[];
    readonly stagedRows: readonly StagedImportRowInsert[];
    readonly audit: AuditEventInsert;
  },
): void => {
  const batch = importBatchInsertSchema.parse(input.batch);
  const sheetMappings = input.sheetMappings.map((mapping) =>
    importSheetMappingInsertSchema.parse(mapping),
  );
  const stagedRows = input.stagedRows.map((row) =>
    stagedImportRowInsertSchema.parse(row),
  );
  const audit = auditEventInsertSchema.parse(input.audit);

  database.transaction((transaction) => {
    transaction.insert(importBatches).values(batch).run();
    if (sheetMappings.length > 0) {
      transaction.insert(importSheetMappings).values(sheetMappings).run();
    }
    if (stagedRows.length > 0) {
      transaction.insert(stagedImportRows).values(stagedRows).run();
    }
    transaction.insert(auditEvents).values(audit).run();
  });
};

export const getImportBatchRecord = (
  database: AppDatabase,
  batchId: string,
): ImportBatchWithRowsRecord | undefined => {
  const batch = database
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .get();

  if (!batch) return undefined;

  return {
    batch,
    sheetMappings: database
      .select()
      .from(importSheetMappings)
      .where(eq(importSheetMappings.batchId, batchId))
      .orderBy(asc(importSheetMappings.sourceSheetName))
      .all(),
    stagedRows: database
      .select()
      .from(stagedImportRows)
      .where(eq(stagedImportRows.batchId, batchId))
      .orderBy(
        asc(stagedImportRows.sourceSheetName),
        asc(stagedImportRows.sourceRowNumber),
      )
      .all(),
    postings: database
      .select()
      .from(importPostings)
      .where(eq(importPostings.batchId, batchId))
      .orderBy(asc(importPostings.postedAtUtc), asc(importPostings.liveEntityType))
      .all(),
  };
};

export const listImportBatchRecords = (
  database: AppDatabase,
): readonly ImportBatchRecord[] =>
  database.select().from(importBatches).orderBy(asc(importBatches.importedAtUtc)).all();

export const updateImportSheetMappingReview = (
  database: AppDatabase,
  input: {
    readonly id: string;
    readonly batchId: string;
    readonly reviewStatus: ImportSheetMappingRecord['reviewStatus'];
    readonly proposedRecordType: ImportSheetMappingRecord['proposedRecordType'];
    readonly fieldMappingJson: string;
    readonly notes: string | null;
    readonly updatedAtUtc: string;
    readonly audit: AuditEventInsert;
  },
): void => {
  const audit = auditEventInsertSchema.parse(input.audit);

  database.transaction((transaction) => {
    const result = transaction
      .update(importSheetMappings)
      .set({
        reviewStatus: input.reviewStatus,
        proposedRecordType: input.proposedRecordType,
        fieldMappingJson: input.fieldMappingJson,
        notes: input.notes,
        updatedAtUtc: input.updatedAtUtc,
      })
      .where(
        and(
          eq(importSheetMappings.id, input.id),
          eq(importSheetMappings.batchId, input.batchId),
        ),
      )
      .run();

    if (result.changes !== 1) {
      throw new RepositoryNotFoundError('Import sheet mapping was not found.');
    }

    transaction.insert(auditEvents).values(audit).run();
  });
};

export const updateStagedImportRowReview = (
  database: AppDatabase,
  input: {
    readonly id: string;
    readonly batchId: string;
    readonly reviewStatus: StagedImportRowRecord['reviewStatus'];
    readonly proposedRecordType: StagedImportRowRecord['proposedRecordType'];
    readonly activityClassification: StagedImportRowRecord['activityClassification'];
    readonly normalizedValuesJson: string;
    readonly reviewNotes: string | null;
    readonly reviewedAtUtc: string | null;
    readonly updatedAtUtc: string;
    readonly audit: AuditEventInsert;
  },
): void => {
  const audit = auditEventInsertSchema.parse(input.audit);

  database.transaction((transaction) => {
    const result = transaction
      .update(stagedImportRows)
      .set({
        reviewStatus: input.reviewStatus,
        proposedRecordType: input.proposedRecordType,
        activityClassification: input.activityClassification,
        normalizedValuesJson: input.normalizedValuesJson,
        reviewNotes: input.reviewNotes,
        reviewedAtUtc: input.reviewedAtUtc,
        updatedAtUtc: input.updatedAtUtc,
      })
      .where(
        and(
          eq(stagedImportRows.id, input.id),
          eq(stagedImportRows.batchId, input.batchId),
        ),
      )
      .run();

    if (result.changes !== 1) {
      throw new RepositoryNotFoundError('Staged import row was not found.');
    }

    transaction.insert(auditEvents).values(audit).run();
  });
};

export const postImportBatchRecord = (
  database: AppDatabase,
  input: PostImportBatchRecordInput,
): void => {
  const debtInputs = input.debts.map((debt) => debtInsertSchema.parse(debt));
  const termInputs = input.terms.map((term) => debtTermInsertSchema.parse(term));
  const transactionInputs = input.transactions.map((transaction) =>
    debtTransactionInsertSchema.parse(transaction),
  );
  const allocationInputs = input.allocations.map((allocation) =>
    transactionAllocationInsertSchema.parse(allocation),
  );
  const snapshotInputs = input.snapshots.map((snapshot) =>
    balanceSnapshotInsertSchema.parse(snapshot),
  );
  const postingInputs = input.postings.map((posting) =>
    importPostingInsertSchema.parse(posting),
  );
  const auditInputs = input.auditInputs.map((event) =>
    auditEventInsertSchema.parse(event),
  );

  const allocationsByTransaction = new Map<string, TransactionAllocationInsert[]>();
  for (const allocation of allocationInputs) {
    const allocations = allocationsByTransaction.get(allocation.transactionId) ?? [];
    allocations.push(allocation);
    allocationsByTransaction.set(allocation.transactionId, allocations);
  }

  for (const transaction of transactionInputs) {
    const errors = validateTransactionSignConvention(
      transaction,
      allocationsByTransaction.get(transaction.id) ?? [],
    );

    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }
  }

  database.transaction((transactionDb) => {
    const existingPostings = transactionDb
      .select({ id: importPostings.id })
      .from(importPostings)
      .where(eq(importPostings.batchId, input.batchId))
      .all();

    if (existingPostings.length > 0) {
      throw new RepositoryConflictError('Import batch has already been posted.');
    }

    const batchUpdate = transactionDb
      .update(importBatches)
      .set({ status: 'closed', updatedAtUtc: input.updatedAtUtc })
      .where(
        and(eq(importBatches.id, input.batchId), ne(importBatches.status, 'closed')),
      )
      .run();

    if (batchUpdate.changes !== 1) {
      throw new RepositoryConflictError('Import batch is already closed or missing.');
    }

    if (debtInputs.length > 0) transactionDb.insert(debts).values(debtInputs).run();
    if (termInputs.length > 0) transactionDb.insert(debtTerms).values(termInputs).run();
    if (transactionInputs.length > 0) {
      transactionDb.insert(debtTransactions).values(transactionInputs).run();
    }
    if (allocationInputs.length > 0) {
      transactionDb.insert(transactionAllocations).values(allocationInputs).run();
    }
    if (snapshotInputs.length > 0) {
      transactionDb.insert(balanceSnapshots).values(snapshotInputs).run();
    }
    if (postingInputs.length > 0) {
      transactionDb.insert(importPostings).values(postingInputs).run();
    }
    if (auditInputs.length > 0)
      transactionDb.insert(auditEvents).values(auditInputs).run();
  });
};

export const listPayoffScenarioRecords = (
  database: AppDatabase,
  includeArchived: boolean,
): readonly PayoffScenarioRecord[] => {
  const query = database.select().from(payoffScenarios);
  return includeArchived
    ? query.orderBy(asc(payoffScenarios.createdAtUtc)).all()
    : query
        .where(eq(payoffScenarios.status, 'active'))
        .orderBy(asc(payoffScenarios.createdAtUtc))
        .all();
};

export const getPayoffScenarioRecord = (
  database: AppDatabase,
  id: string,
): PayoffScenarioRecord | undefined =>
  database.select().from(payoffScenarios).where(eq(payoffScenarios.id, id)).get();

export const createPayoffScenarioRecord = (
  database: AppDatabase,
  input: PayoffScenarioInsert,
  auditInput: AuditEventInsert,
): void => {
  const scenario = payoffScenarioInsertSchema.parse(input);
  const audit = auditEventInsertSchema.parse(auditInput);

  database.transaction((transaction) => {
    transaction.insert(payoffScenarios).values(scenario).run();
    transaction.insert(auditEvents).values(audit).run();
  });
};

export const updatePayoffScenarioArchiveState = (
  database: AppDatabase,
  input: {
    readonly id: string;
    readonly expectedUpdatedAtUtc: string;
    readonly status: PayoffScenarioRecord['status'];
    readonly archivedAtUtc: string | null;
    readonly updatedAtUtc: string;
    readonly audit: AuditEventInsert;
  },
): void => {
  const audit = auditEventInsertSchema.parse(input.audit);

  database.transaction((transaction) => {
    const result = transaction
      .update(payoffScenarios)
      .set({
        status: input.status,
        archivedAtUtc: input.archivedAtUtc,
        updatedAtUtc: input.updatedAtUtc,
      })
      .where(
        and(
          eq(payoffScenarios.id, input.id),
          eq(payoffScenarios.updatedAtUtc, input.expectedUpdatedAtUtc),
        ),
      )
      .run();

    if (result.changes !== 1) {
      const existing = transaction
        .select({ id: payoffScenarios.id })
        .from(payoffScenarios)
        .where(eq(payoffScenarios.id, input.id))
        .get();

      if (!existing) throw new RepositoryNotFoundError('Scenario was not found.');
      throw new RepositoryConflictError('Scenario changed before archive update.');
    }

    transaction.insert(auditEvents).values(audit).run();
  });
};

export const updatePayoffScenarioResultRecord = (
  database: AppDatabase,
  input: {
    readonly id: string;
    readonly expectedUpdatedAtUtc: string;
    readonly resultJson: string;
    readonly calculationEngineVersion: string;
    readonly updatedAtUtc: string;
    readonly audit: AuditEventInsert;
  },
): void => {
  const audit = auditEventInsertSchema.parse(input.audit);

  database.transaction((transaction) => {
    const result = transaction
      .update(payoffScenarios)
      .set({
        resultJson: input.resultJson,
        calculationEngineVersion: input.calculationEngineVersion,
        updatedAtUtc: input.updatedAtUtc,
      })
      .where(
        and(
          eq(payoffScenarios.id, input.id),
          eq(payoffScenarios.updatedAtUtc, input.expectedUpdatedAtUtc),
          eq(payoffScenarios.status, 'active'),
        ),
      )
      .run();

    if (result.changes !== 1) {
      const existing = transaction
        .select({ id: payoffScenarios.id })
        .from(payoffScenarios)
        .where(eq(payoffScenarios.id, input.id))
        .get();

      if (!existing) throw new RepositoryNotFoundError('Scenario was not found.');
      throw new RepositoryConflictError('Scenario changed before rerun.');
    }

    transaction.insert(auditEvents).values(audit).run();
  });
};
