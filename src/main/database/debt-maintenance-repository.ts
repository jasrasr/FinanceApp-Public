import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
} from 'drizzle-orm';
import type { AppDatabase } from './connection';
import {
  auditEvents,
  balanceReconciliations,
  balanceSnapshots,
  debtTerms,
  debtTransactions,
  debts,
  importPostings,
  payoffScenarios,
  refinanceEvents,
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
  payoffScenarioInsertSchema,
  refinanceEventInsertSchema,
  transactionAllocationInsertSchema,
  type AuditEventInsert,
  type BalanceReconciliationInput,
  type BalanceSnapshotInsert,
  type DebtInsert,
  type DebtTermInsert,
  type DebtTransactionInsert,
  type PayoffScenarioInsert,
  type RefinanceEventInsert,
  type TransactionAllocationInsert,
} from './validation';
import { validateTransactionSignConvention } from '../domain/accounting/transaction-validation';

export type DebtRecord = typeof debts.$inferSelect;
export type DebtTermRecord = typeof debtTerms.$inferSelect;
export type DebtTransactionRecord = typeof debtTransactions.$inferSelect;
export type TransactionAllocationRecord = typeof transactionAllocations.$inferSelect;
export type BalanceSnapshotRecord = typeof balanceSnapshots.$inferSelect;
export type BalanceReconciliationRecord = typeof balanceReconciliations.$inferSelect;
export type PayoffScenarioRecord = typeof payoffScenarios.$inferSelect;
export type RefinanceEventRecord = typeof refinanceEvents.$inferSelect;

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
  readonly refinanceEvents: readonly RefinanceEventRecord[];
}

export interface PermanentDebtDeletionCounts {
  readonly debtTerms: number;
  readonly transactions: number;
  readonly allocations: number;
  readonly balanceSnapshots: number;
  readonly reconciliations: number;
  readonly auditEvents: number;
  readonly importProvenance: number;
  readonly payoffScenarioReferences: number;
  readonly otherRelatedRecords: number;
}

export interface PermanentDebtDeletionRecordInput {
  readonly debtId: string;
  readonly expectedUpdatedAtUtc: string;
  readonly audit: AuditEventInsert;
  readonly simulateFailure?: boolean;
}

export interface PostedTransactionInput {
  readonly transaction: DebtTransactionInsert;
  readonly allocations: readonly TransactionAllocationInsert[];
}

export interface RecordInPlaceRefinanceRecordInput {
  readonly debtId: string;
  readonly expectedDebtUpdatedAtUtc: string;
  readonly priorTermId: string;
  readonly expectedPriorEndDate: string | null;
  readonly priorEndDate: string;
  readonly debtUpdate: {
    readonly maturityDate: string;
    readonly minimumPaymentCents: number;
    readonly paymentFrequency: DebtRecord['paymentFrequency'];
    readonly updatedAtUtc: string;
  };
  readonly newTerm: DebtTermInsert;
  readonly principalAdjustment?: PostedTransactionInput;
  readonly cashFeeTransaction?: PostedTransactionInput;
  readonly escrowTransaction?: PostedTransactionInput;
  readonly refinanceEvent: RefinanceEventInsert;
  readonly auditInputs: readonly AuditEventInsert[];
}

export interface EditPostedTransactionRecordInput {
  readonly originalTransactionId: string;
  readonly expectedUpdatedAtUtc: string;
  readonly reversal: PostedTransactionInput;
  readonly replacement: PostedTransactionInput;
  readonly updatedAtUtc: string;
  readonly affectedReconciliationDate: string;
  readonly auditInputs: readonly AuditEventInsert[];
}

export interface CreateBalanceReconciliationRecordInput {
  readonly reconciliation: BalanceReconciliationInput;
  readonly adjustment?: PostedTransactionInput;
  readonly snapshot?: BalanceSnapshotInsert;
  readonly supersedes?: {
    readonly id: string;
    readonly expectedUpdatedAtUtc: string;
    readonly supersededAtUtc: string;
  };
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
  readonly financingChainName: string | null;
  readonly refinancedFromDebtId: string | null;
  readonly refinancedIntoDebtId: string | null;
  readonly refinanceDate: string | null;
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

const getRefinanceEvents = (
  database: AppDatabase,
  debtId: string,
): readonly RefinanceEventRecord[] =>
  database
    .select()
    .from(refinanceEvents)
    .where(eq(refinanceEvents.debtId, debtId))
    .orderBy(asc(refinanceEvents.refinanceDate), asc(refinanceEvents.createdAtUtc))
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
        refinanceEvents: getRefinanceEvents(database, debtId),
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
    refinanceEvents: getRefinanceEvents(database, debt.id),
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
    refinanceEvents: getRefinanceEvents(database, debt.id),
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
      transactionId: debtTransactions.id,
      transactionType: debtTransactions.transactionType,
      reversalOfTransactionId: debtTransactions.reversalOfTransactionId,
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

  const reversedTransactionIds = rows
    .map((row) => row.reversalOfTransactionId)
    .filter((id): id is string => id !== null);
  const originalTypes =
    reversedTransactionIds.length === 0
      ? new Map<string, Pick<DebtTransactionRecord, 'transactionType' | 'status'>>()
      : new Map(
          database
            .select({
              id: debtTransactions.id,
              transactionType: debtTransactions.transactionType,
              status: debtTransactions.status,
            })
            .from(debtTransactions)
            .all()
            .filter((transaction) => reversedTransactionIds.includes(transaction.id))
            .map((transaction) => [
              transaction.id,
              {
                transactionType: transaction.transactionType,
                status: transaction.status,
              },
            ]),
        );

  let balanceActivity = 0;
  for (const row of rows) {
    const original = row.reversalOfTransactionId
      ? originalTypes.get(row.reversalOfTransactionId)
      : undefined;
    if (row.transactionType === 'reversal' && original?.status === 'superseded') {
      continue;
    }
    const effectiveTransactionType =
      row.transactionType === 'reversal' && row.reversalOfTransactionId
        ? (original?.transactionType ?? row.transactionType)
        : row.transactionType;

    if (
      row.allocationType === 'principal' ||
      row.allocationType === 'extra_principal' ||
      row.allocationType === 'fee' ||
      row.allocationType === 'penalty' ||
      (row.allocationType === 'interest' &&
        effectiveTransactionType === 'interest_charge')
    ) {
      balanceActivity += row.amountCents;
    }

    if (!Number.isSafeInteger(balanceActivity)) {
      throw new RangeError('Ledger balance activity exceeds the safe-integer range.');
    }
  }

  if (!Number.isSafeInteger(balanceActivity)) {
    throw new RangeError('Ledger transaction total exceeds the safe-integer range.');
  }

  const balance = debt.originalPrincipalCents + balanceActivity;

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
      transactionId: debtTransactions.id,
      transactionType: debtTransactions.transactionType,
      reversalOfTransactionId: debtTransactions.reversalOfTransactionId,
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

  const reversedTransactionIds = rows
    .map((row) => row.reversalOfTransactionId)
    .filter((id): id is string => id !== null);
  const originalTypes =
    reversedTransactionIds.length === 0
      ? new Map<string, Pick<DebtTransactionRecord, 'transactionType' | 'status'>>()
      : new Map(
          database
            .select({
              id: debtTransactions.id,
              transactionType: debtTransactions.transactionType,
              status: debtTransactions.status,
            })
            .from(debtTransactions)
            .all()
            .filter((transaction) => reversedTransactionIds.includes(transaction.id))
            .map((transaction) => [
              transaction.id,
              {
                transactionType: transaction.transactionType,
                status: transaction.status,
              },
            ]),
        );

  const balance = rows.reduce((total, row) => {
    const original = row.reversalOfTransactionId
      ? originalTypes.get(row.reversalOfTransactionId)
      : undefined;
    if (row.transactionType === 'reversal' && original?.status === 'superseded') {
      return total;
    }
    const effectiveTransactionType =
      row.transactionType === 'reversal' && row.reversalOfTransactionId
        ? (original?.transactionType ?? row.transactionType)
        : row.transactionType;

    if (effectiveTransactionType === 'payment') return total - row.amountCents;
    if (
      effectiveTransactionType === 'escrow_disbursement' ||
      effectiveTransactionType === 'escrow_refund'
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

const count = (items: readonly unknown[]): number => items.length;

const payoffScenariosReferencingDebt = (
  database: AppDatabase,
  debtId: string,
): readonly PayoffScenarioRecord[] =>
  database
    .select()
    .from(payoffScenarios)
    .all()
    .filter((scenario) =>
      [scenario.customPriorityJson, scenario.assumptionsJson, scenario.resultJson].some(
        (json) => json.includes(debtId),
      ),
    );

const permanentDeletionRelatedIds = (
  database: AppDatabase,
  debtId: string,
): {
  readonly transactionIds: readonly string[];
  readonly allocationIds: readonly string[];
  readonly snapshotIds: readonly string[];
  readonly reconciliationIds: readonly string[];
  readonly termIds: readonly string[];
  readonly refinanceEventIds: readonly string[];
  readonly payoffScenarioIds: readonly string[];
} => {
  const record = getDebtActivityRecord(database, debtId);
  if (!record) throw new RepositoryNotFoundError('Debt was not found.');
  const transactionIds = record.transactions.map(({ transaction }) => transaction.id);
  return {
    transactionIds,
    allocationIds: record.transactions.flatMap(({ allocations }) =>
      allocations.map((allocation) => allocation.id),
    ),
    snapshotIds: record.balanceSnapshots.map((snapshot) => snapshot.id),
    reconciliationIds: record.balanceReconciliations.map(
      (reconciliation) => reconciliation.id,
    ),
    termIds: record.terms.map((term) => term.id),
    refinanceEventIds: record.refinanceEvents.map((event) => event.id),
    payoffScenarioIds: payoffScenariosReferencingDebt(database, debtId).map(
      (scenario) => scenario.id,
    ),
  };
};

const permanentDeletionImportPostingIds = (
  database: AppDatabase,
  debtId: string,
  related: ReturnType<typeof permanentDeletionRelatedIds>,
): readonly string[] => {
  const importEntityPairs = [
    ['debt', debtId],
    ...related.termIds.map((id) => ['debt_term', id]),
    ...related.transactionIds.map((id) => ['debt_transaction', id]),
    ...related.allocationIds.map((id) => ['transaction_allocation', id]),
    ...related.snapshotIds.map((id) => ['balance_snapshot', id]),
    ...related.refinanceEventIds.map((id) => ['refinance_event', id]),
  ] as const;

  return database
    .select()
    .from(importPostings)
    .all()
    .filter((posting) =>
      importEntityPairs.some(
        ([entityType, entityId]) =>
          posting.liveEntityType === entityType && posting.liveEntityId === entityId,
      ),
    )
    .map((posting) => posting.id);
};

const permanentDeletionTransactionDeleteOrder = (
  database: AppDatabase,
  transactionIds: readonly string[],
): readonly string[] => {
  if (transactionIds.length === 0) return [];

  const remaining = new Set(transactionIds);
  const rows = database
    .select()
    .from(debtTransactions)
    .where(inArray(debtTransactions.id, transactionIds))
    .all();
  const ordered: string[] = [];

  while (remaining.size > 0) {
    const leaves = [...remaining].filter(
      (id) =>
        !rows.some(
          (row) =>
            remaining.has(row.id) &&
            (row.reversalOfTransactionId === id || row.supersedesTransactionId === id),
        ),
    );

    if (leaves.length === 0) {
      throw new RepositoryConflictError(
        'Debt transaction history could not be ordered for deletion.',
      );
    }

    for (const id of leaves) {
      ordered.push(id);
      remaining.delete(id);
    }
  }

  return ordered;
};

export const previewPermanentDebtDeletion = (
  database: AppDatabase,
  debtId: string,
): PermanentDebtDeletionCounts => {
  const record = getDebtActivityRecord(database, debtId);
  if (!record) throw new RepositoryNotFoundError('Debt was not found.');
  const related = permanentDeletionRelatedIds(database, debtId);
  const relatedEntityPairs = [
    ['debt', debtId],
    ...related.termIds.map((id) => ['debt_term', id]),
    ...related.transactionIds.map((id) => ['debt_transaction', id]),
    ...related.allocationIds.map((id) => ['transaction_allocation', id]),
    ...related.snapshotIds.map((id) => ['balance_snapshot', id]),
    ...related.reconciliationIds.map((id) => ['balance_reconciliation', id]),
    ...related.refinanceEventIds.map((id) => ['refinance_event', id]),
    ...related.payoffScenarioIds.map((id) => ['payoff_scenario', id]),
  ] as const;
  const auditEventCount = database
    .select()
    .from(auditEvents)
    .all()
    .filter((event) =>
      relatedEntityPairs.some(
        ([entityType, entityId]) =>
          event.entityType === entityType && event.entityId === entityId,
      ),
    ).length;
  const importProvenanceCount = permanentDeletionImportPostingIds(
    database,
    debtId,
    related,
  ).length;
  const otherRelatedRecords =
    database
      .select()
      .from(debts)
      .where(
        or(
          eq(debts.refinancedFromDebtId, debtId),
          eq(debts.refinancedIntoDebtId, debtId),
        ),
      )
      .all().length + related.refinanceEventIds.length;

  return {
    debtTerms: count(record.terms),
    transactions: count(record.transactions),
    allocations: count(related.allocationIds),
    balanceSnapshots: count(record.balanceSnapshots),
    reconciliations: count(record.balanceReconciliations),
    auditEvents: auditEventCount,
    importProvenance: importProvenanceCount,
    payoffScenarioReferences: count(related.payoffScenarioIds),
    otherRelatedRecords,
  };
};

export const deleteDebtPermanentlyRecord = (
  database: AppDatabase,
  input: PermanentDebtDeletionRecordInput,
): void => {
  const audit = auditEventInsertSchema.parse(input.audit);
  const related = permanentDeletionRelatedIds(database, input.debtId);
  const importPostingIds = permanentDeletionImportPostingIds(
    database,
    input.debtId,
    related,
  );
  const transactionDeleteOrder = permanentDeletionTransactionDeleteOrder(
    database,
    related.transactionIds,
  );

  database.transaction((transaction) => {
    const existing = transaction
      .select()
      .from(debts)
      .where(eq(debts.id, input.debtId))
      .get();
    if (!existing) throw new RepositoryNotFoundError('Debt was not found.');
    if (existing.updatedAtUtc !== input.expectedUpdatedAtUtc) {
      throw new RepositoryConflictError('Debt changed before deletion was confirmed.');
    }

    transaction
      .update(debts)
      .set({
        refinancedFromDebtId: null,
        refinancedIntoDebtId: null,
        refinanceDate: null,
      })
      .where(
        or(
          eq(debts.refinancedFromDebtId, input.debtId),
          eq(debts.refinancedIntoDebtId, input.debtId),
        ),
      )
      .run();

    if (importPostingIds.length > 0) {
      transaction
        .delete(importPostings)
        .where(inArray(importPostings.id, importPostingIds))
        .run();
    }

    if (input.simulateFailure) {
      throw new RepositoryConflictError('Simulated permanent deletion failure.');
    }

    if (related.payoffScenarioIds.length > 0) {
      transaction
        .delete(payoffScenarios)
        .where(inArray(payoffScenarios.id, related.payoffScenarioIds))
        .run();
    }
    if (related.refinanceEventIds.length > 0) {
      transaction
        .delete(refinanceEvents)
        .where(inArray(refinanceEvents.id, related.refinanceEventIds))
        .run();
    }
    if (related.allocationIds.length > 0) {
      transaction
        .delete(transactionAllocations)
        .where(inArray(transactionAllocations.id, related.allocationIds))
        .run();
    }
    if (related.reconciliationIds.length > 0) {
      transaction
        .update(balanceReconciliations)
        .set({
          supersedesReconciliationId: null,
          supersededByReconciliationId: null,
        })
        .where(inArray(balanceReconciliations.id, related.reconciliationIds))
        .run();
      transaction
        .delete(balanceReconciliations)
        .where(inArray(balanceReconciliations.id, related.reconciliationIds))
        .run();
    }
    if (related.snapshotIds.length > 0) {
      transaction
        .delete(balanceSnapshots)
        .where(inArray(balanceSnapshots.id, related.snapshotIds))
        .run();
    }
    if (related.transactionIds.length > 0) {
      for (const transactionId of transactionDeleteOrder) {
        transaction
          .delete(debtTransactions)
          .where(eq(debtTransactions.id, transactionId))
          .run();
      }
    }
    if (related.termIds.length > 0) {
      transaction.delete(debtTerms).where(inArray(debtTerms.id, related.termIds)).run();
    }

    const relatedEntityPairs = [
      ['debt', input.debtId],
      ...related.termIds.map((id) => ['debt_term', id]),
      ...related.transactionIds.map((id) => ['debt_transaction', id]),
      ...related.allocationIds.map((id) => ['transaction_allocation', id]),
      ...related.snapshotIds.map((id) => ['balance_snapshot', id]),
      ...related.reconciliationIds.map((id) => ['balance_reconciliation', id]),
      ...related.refinanceEventIds.map((id) => ['refinance_event', id]),
      ...related.payoffScenarioIds.map((id) => ['payoff_scenario', id]),
    ] as const;
    const auditIds = transaction
      .select()
      .from(auditEvents)
      .all()
      .filter((event) =>
        relatedEntityPairs.some(
          ([entityType, entityId]) =>
            event.entityType === entityType && event.entityId === entityId,
        ),
      )
      .map((event) => event.id);
    if (auditIds.length > 0) {
      transaction.delete(auditEvents).where(inArray(auditEvents.id, auditIds)).run();
    }

    const result = transaction.delete(debts).where(eq(debts.id, input.debtId)).run();
    if (result.changes !== 1) {
      throw new RepositoryNotFoundError('Debt was not found.');
    }

    transaction.insert(auditEvents).values(audit).run();
  });
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

const parsePostedTransactionInput = (
  input: PostedTransactionInput | undefined,
): PostedTransactionInput | undefined => {
  if (!input) return undefined;

  const transaction = debtTransactionInsertSchema.parse(input.transaction);
  const allocations = input.allocations.map((allocation) =>
    transactionAllocationInsertSchema.parse(allocation),
  );

  if (allocations.some((allocation) => allocation.transactionId !== transaction.id)) {
    throw new Error('Every allocation must reference its transaction.');
  }

  const errors = validateTransactionSignConvention(transaction, allocations);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return { transaction, allocations };
};

export const recordInPlaceRefinanceRecord = (
  database: AppDatabase,
  input: RecordInPlaceRefinanceRecordInput,
): void => {
  const newTerm = debtTermInsertSchema.parse(input.newTerm);
  const principalAdjustment = parsePostedTransactionInput(input.principalAdjustment);
  const cashFeeTransaction = parsePostedTransactionInput(input.cashFeeTransaction);
  const escrowTransaction = parsePostedTransactionInput(input.escrowTransaction);
  const refinanceEvent = refinanceEventInsertSchema.parse(input.refinanceEvent);
  const audit = input.auditInputs.map((event) => auditEventInsertSchema.parse(event));

  if (newTerm.debtId !== input.debtId) {
    throw new Error('The new refinance term must reference the refinanced debt.');
  }

  for (const postedTransaction of [
    principalAdjustment,
    cashFeeTransaction,
    escrowTransaction,
  ]) {
    if (postedTransaction && postedTransaction.transaction.debtId !== input.debtId) {
      throw new Error('Refinance transactions must reference the refinanced debt.');
    }
  }

  if (
    refinanceEvent.debtId !== input.debtId ||
    refinanceEvent.priorTermId !== input.priorTermId ||
    refinanceEvent.newTermId !== newTerm.id ||
    refinanceEvent.principalTransactionId !==
      (principalAdjustment?.transaction.id ?? null) ||
    refinanceEvent.cashFeeTransactionId !==
      (cashFeeTransaction?.transaction.id ?? null) ||
    refinanceEvent.escrowTransactionId !== (escrowTransaction?.transaction.id ?? null)
  ) {
    throw new Error('Refinance event links must match the atomic ledger records.');
  }

  database.transaction((transactionDb) => {
    const debtUpdate = transactionDb
      .update(debts)
      .set({
        maturityDate: input.debtUpdate.maturityDate,
        minimumPaymentCents: input.debtUpdate.minimumPaymentCents,
        paymentFrequency: input.debtUpdate.paymentFrequency,
        updatedAtUtc: input.debtUpdate.updatedAtUtc,
      })
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
        'Debt changed or was archived before the refinance was saved.',
      );
    }

    const priorTermCondition =
      input.expectedPriorEndDate === null
        ? isNull(debtTerms.effectiveEndDate)
        : eq(debtTerms.effectiveEndDate, input.expectedPriorEndDate);
    const priorTermUpdate = transactionDb
      .update(debtTerms)
      .set({
        effectiveEndDate: input.priorEndDate,
        updatedAtUtc: input.debtUpdate.updatedAtUtc,
      })
      .where(
        and(
          eq(debtTerms.id, input.priorTermId),
          eq(debtTerms.debtId, input.debtId),
          priorTermCondition,
        ),
      )
      .run();

    if (priorTermUpdate.changes !== 1) {
      throw new RepositoryConflictError(
        'Debt terms changed before the refinance was saved.',
      );
    }

    transactionDb.insert(debtTerms).values(newTerm).run();
    for (const postedTransaction of [
      principalAdjustment,
      cashFeeTransaction,
      escrowTransaction,
    ]) {
      if (!postedTransaction) continue;
      transactionDb
        .insert(debtTransactions)
        .values(postedTransaction.transaction)
        .run();
      transactionDb
        .insert(transactionAllocations)
        .values([...postedTransaction.allocations])
        .run();
    }
    transactionDb.insert(refinanceEvents).values(refinanceEvent).run();
    transactionDb.insert(auditEvents).values(audit).run();
  });
};

export const editPostedTransactionRecord = (
  database: AppDatabase,
  input: EditPostedTransactionRecordInput,
): void => {
  const reversal = debtTransactionInsertSchema.parse(input.reversal.transaction);
  const reversalAllocations = input.reversal.allocations.map((allocation) =>
    transactionAllocationInsertSchema.parse(allocation),
  );
  const replacement = debtTransactionInsertSchema.parse(input.replacement.transaction);
  const replacementAllocations = input.replacement.allocations.map((allocation) =>
    transactionAllocationInsertSchema.parse(allocation),
  );
  const audit = input.auditInputs.map((event) => auditEventInsertSchema.parse(event));

  if (
    reversal.transactionType !== 'reversal' ||
    reversal.reversalOfTransactionId !== input.originalTransactionId
  ) {
    throw new Error('Transaction edit must include a linked reversal.');
  }

  if (replacement.supersedesTransactionId !== input.originalTransactionId) {
    throw new Error('Transaction edit must include a linked replacement.');
  }

  if (
    reversalAllocations.some(
      (allocation) => allocation.transactionId !== reversal.id,
    ) ||
    replacementAllocations.some(
      (allocation) => allocation.transactionId !== replacement.id,
    )
  ) {
    throw new Error('Every allocation must reference its transaction.');
  }

  const signErrors = [
    ...validateTransactionSignConvention(reversal, reversalAllocations),
    ...validateTransactionSignConvention(replacement, replacementAllocations),
  ];

  if (signErrors.length > 0) {
    throw new Error(signErrors.join(' '));
  }

  database.transaction((transactionDb) => {
    const original = transactionDb
      .select()
      .from(debtTransactions)
      .where(eq(debtTransactions.id, input.originalTransactionId))
      .get();

    if (!original) {
      throw new RepositoryNotFoundError('Transaction was not found.');
    }

    if (original.status !== 'posted') {
      throw new RepositoryConflictError(
        'Only a currently posted transaction can be edited.',
      );
    }

    if (original.transactionType === 'reversal') {
      throw new RepositoryConflictError('Reversal transactions cannot be edited.');
    }

    if (original.updatedAtUtc !== input.expectedUpdatedAtUtc) {
      throw new RepositoryConflictError(
        'Transaction changed before the edit was saved.',
      );
    }

    const existingReplacement = transactionDb
      .select({ id: debtTransactions.id })
      .from(debtTransactions)
      .where(eq(debtTransactions.supersedesTransactionId, original.id))
      .get();

    if (existingReplacement) {
      throw new RepositoryConflictError(
        'This transaction already has a replacement transaction.',
      );
    }

    transactionDb.insert(debtTransactions).values(reversal).run();
    transactionDb.insert(transactionAllocations).values(reversalAllocations).run();
    transactionDb.insert(debtTransactions).values(replacement).run();
    transactionDb.insert(transactionAllocations).values(replacementAllocations).run();
    transactionDb
      .update(debtTransactions)
      .set({ status: 'superseded', updatedAtUtc: input.updatedAtUtc })
      .where(eq(debtTransactions.id, original.id))
      .run();

    transactionDb
      .update(balanceReconciliations)
      .set({
        reconciliationStatus: 'exception',
        explanation:
          'Prior posted activity was edited after this reconciliation; review the statement comparison.',
        updatedAtUtc: input.updatedAtUtc,
      })
      .where(
        and(
          eq(balanceReconciliations.debtId, original.debtId),
          eq(balanceReconciliations.lifecycleStatus, 'current'),
          gte(balanceReconciliations.statementDate, input.affectedReconciliationDate),
        ),
      )
      .run();

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
    if (input.supersedes) {
      const result = transactionDb
        .update(balanceReconciliations)
        .set({
          lifecycleStatus: 'superseded',
          supersededByReconciliationId: null,
          supersededAtUtc: input.supersedes.supersededAtUtc,
          updatedAtUtc: input.supersedes.supersededAtUtc,
        })
        .where(
          and(
            eq(balanceReconciliations.id, input.supersedes.id),
            eq(
              balanceReconciliations.updatedAtUtc,
              input.supersedes.expectedUpdatedAtUtc,
            ),
            eq(balanceReconciliations.lifecycleStatus, 'current'),
          ),
        )
        .run();

      if (result.changes !== 1) {
        throw new RepositoryConflictError(
          'Reconciliation changed or is no longer current.',
        );
      }
    }

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

    if (input.supersedes) {
      transactionDb
        .update(balanceReconciliations)
        .set({
          supersededByReconciliationId: reconciliation.id,
        })
        .where(eq(balanceReconciliations.id, input.supersedes.id))
        .run();
    }

    transactionDb.insert(auditEvents).values(audit).run();
  });
};

export const voidBalanceReconciliationRecord = (
  database: AppDatabase,
  input: {
    readonly id: string;
    readonly expectedUpdatedAtUtc: string;
    readonly voidedAtUtc: string;
    readonly audit: AuditEventInsert;
  },
): void => {
  const audit = auditEventInsertSchema.parse(input.audit);

  database.transaction((transactionDb) => {
    const result = transactionDb
      .update(balanceReconciliations)
      .set({
        lifecycleStatus: 'voided',
        voidedAtUtc: input.voidedAtUtc,
        updatedAtUtc: input.voidedAtUtc,
      })
      .where(
        and(
          eq(balanceReconciliations.id, input.id),
          eq(balanceReconciliations.updatedAtUtc, input.expectedUpdatedAtUtc),
          eq(balanceReconciliations.lifecycleStatus, 'current'),
        ),
      )
      .run();

    if (result.changes !== 1) {
      throw new RepositoryConflictError(
        'Reconciliation changed or is no longer current.',
      );
    }

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
