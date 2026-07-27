import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { calculateReconciliationDifference } from '../domain/accounting/reconciliation';
import { validateTransactionSignConvention } from '../domain/accounting/transaction-validation';
import type { AppDatabase } from './connection';
import {
  auditEvents,
  balanceReconciliations,
  balanceSnapshots,
  debtTerms,
  debtTransactions,
  debts,
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
  transactionAllocationInsertSchema,
  type AuditEventInsert,
  type BalanceReconciliationInput,
  type BalanceSnapshotInsert,
  type DebtInsert,
  type DebtTermInsert,
  type DebtTransactionInsert,
  type TransactionAllocationInsert,
} from './validation';

export interface PostedTransactionInput {
  readonly transaction: DebtTransactionInsert;
  readonly allocations: readonly TransactionAllocationInsert[];
}

export interface ReverseTransactionInput {
  readonly originalTransactionId: string;
  readonly effectiveDate: string;
  readonly postingDate: string;
  readonly description: string;
  readonly occurredAtUtc: string;
}

export const insertDebt = (database: AppDatabase, input: DebtInsert): void => {
  const debt = debtInsertSchema.parse(input);
  database.insert(debts).values(debt).run();
};

export const insertDebtTerm = (database: AppDatabase, input: DebtTermInsert): void => {
  const term = debtTermInsertSchema.parse(input);
  const proposedEnd = term.effectiveEndDate ?? '9999-12-31';
  const overlapping = database
    .select({ id: debtTerms.id })
    .from(debtTerms)
    .where(
      and(
        eq(debtTerms.debtId, term.debtId),
        lte(debtTerms.effectiveStartDate, proposedEnd),
        or(
          isNull(debtTerms.effectiveEndDate),
          gte(debtTerms.effectiveEndDate, term.effectiveStartDate),
        ),
      ),
    )
    .limit(1)
    .all();

  if (overlapping.length > 0) {
    throw new Error('Debt term effective periods cannot overlap.');
  }

  database.insert(debtTerms).values(term).run();
};

export const insertPostedTransaction = (
  database: AppDatabase,
  input: PostedTransactionInput,
): void => {
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

  database.transaction((databaseTransaction) => {
    databaseTransaction.insert(debtTransactions).values(transaction).run();
    databaseTransaction.insert(transactionAllocations).values(allocations).run();
  });
};

export const insertBalanceSnapshot = (
  database: AppDatabase,
  input: BalanceSnapshotInsert,
): void => {
  const snapshot = balanceSnapshotInsertSchema.parse(input);
  database.insert(balanceSnapshots).values(snapshot).run();
};

export const insertBalanceReconciliation = (
  database: AppDatabase,
  input: BalanceReconciliationInput,
): void => {
  const reconciliationInput = balanceReconciliationInputSchema.parse(input);
  const reconciliation = balanceReconciliationRecordSchema.parse({
    ...reconciliationInput,
    calculatedDifferenceCents: calculateReconciliationDifference(
      reconciliationInput.statementEndingBalanceCents,
      reconciliationInput.applicationCalculatedBalanceCents,
    ),
  });

  if (reconciliation.approvedAdjustmentTransactionId) {
    const adjustment = database
      .select({
        debtId: debtTransactions.debtId,
        status: debtTransactions.status,
        transactionType: debtTransactions.transactionType,
      })
      .from(debtTransactions)
      .where(eq(debtTransactions.id, reconciliation.approvedAdjustmentTransactionId))
      .get();

    if (
      !adjustment ||
      adjustment.debtId !== reconciliation.debtId ||
      adjustment.status !== 'posted' ||
      adjustment.transactionType !== 'approved_reconciliation_adjustment'
    ) {
      throw new Error(
        'Approved adjustment must be a posted reconciliation adjustment for the same debt.',
      );
    }
  }

  database.insert(balanceReconciliations).values(reconciliation).run();
};

export const insertAuditEvent = (
  database: AppDatabase,
  input: AuditEventInsert,
): void => {
  const event = auditEventInsertSchema.parse(input);
  database.insert(auditEvents).values(event).run();
};

export const reversePostedTransaction = (
  database: AppDatabase,
  input: ReverseTransactionInput,
): string => {
  const original = database
    .select()
    .from(debtTransactions)
    .where(eq(debtTransactions.id, input.originalTransactionId))
    .get();

  if (!original || original.status !== 'posted') {
    throw new Error('Only an existing posted transaction can be reversed.');
  }

  const originalAllocations = database
    .select()
    .from(transactionAllocations)
    .where(eq(transactionAllocations.transactionId, input.originalTransactionId))
    .all();

  const reversalId = randomUUID();
  const timestamp = input.occurredAtUtc;
  const reversalTransaction = debtTransactionInsertSchema.parse({
    id: reversalId,
    debtId: original.debtId,
    transactionType: 'reversal',
    effectiveDate: input.effectiveDate,
    postingDate: input.postingDate,
    totalAmountCents: -original.totalAmountCents,
    status: 'posted',
    description: input.description,
    sourceType: 'system',
    sourceReference: original.id,
    reversalOfTransactionId: original.id,
    supersedesTransactionId: null,
    createdAtUtc: timestamp,
    updatedAtUtc: timestamp,
  });
  const reversalAllocations = originalAllocations.map((allocation) =>
    transactionAllocationInsertSchema.parse({
      id: randomUUID(),
      transactionId: reversalId,
      allocationType: allocation.allocationType,
      amountCents: -allocation.amountCents,
      notes: 'Reversal of original allocation.',
      createdAtUtc: timestamp,
      updatedAtUtc: timestamp,
    }),
  );
  const errors = validateTransactionSignConvention(
    reversalTransaction,
    reversalAllocations,
  );

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  database.transaction((databaseTransaction) => {
    databaseTransaction.insert(debtTransactions).values(reversalTransaction).run();
    databaseTransaction
      .insert(transactionAllocations)
      .values(reversalAllocations)
      .run();
    databaseTransaction
      .update(debtTransactions)
      .set({ status: 'reversed', updatedAtUtc: timestamp })
      .where(eq(debtTransactions.id, original.id))
      .run();
    databaseTransaction
      .insert(auditEvents)
      .values(
        auditEventInsertSchema.parse({
          id: randomUUID(),
          eventType: 'transaction_reversed',
          entityType: 'debt_transaction',
          entityId: original.id,
          action: 'reverse',
          occurredAtUtc: timestamp,
          source: 'system',
          summary: 'Posted transaction was reversed by a linked transaction.',
          beforeMetadataJson: null,
          afterMetadataJson: JSON.stringify({
            reversalTransactionId: reversalId,
          }),
        }),
      )
      .run();
  });

  return reversalId;
};
