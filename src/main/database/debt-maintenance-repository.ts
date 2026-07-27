import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { AppDatabase } from './connection';
import {
  auditEvents,
  balanceSnapshots,
  debtTerms,
  debtTransactions,
  debts,
  transactionAllocations,
} from './schema';
import {
  auditEventInsertSchema,
  balanceSnapshotInsertSchema,
  debtInsertSchema,
  debtTermInsertSchema,
  debtTransactionInsertSchema,
  transactionAllocationInsertSchema,
  type AuditEventInsert,
  type BalanceSnapshotInsert,
  type DebtInsert,
  type DebtTermInsert,
  type DebtTransactionInsert,
  type TransactionAllocationInsert,
} from './validation';
import { validateTransactionSignConvention } from '../domain/accounting/transaction-validation';

export type DebtRecord = typeof debts.$inferSelect;
export type DebtTermRecord = typeof debtTerms.$inferSelect;
export type DebtTransactionRecord = typeof debtTransactions.$inferSelect;
export type TransactionAllocationRecord = typeof transactionAllocations.$inferSelect;
export type BalanceSnapshotRecord = typeof balanceSnapshots.$inferSelect;

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
      }
    : undefined;
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
