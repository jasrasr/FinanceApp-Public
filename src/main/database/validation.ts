import { z } from 'zod';
import {
  ALLOCATION_TYPES,
  AUDIT_SOURCES,
  DAY_COUNT_CONVENTIONS,
  DEBT_STATUSES,
  DEBT_TYPES,
  INTEREST_CALCULATION_CONVENTIONS,
  INTEREST_RATE_TYPES,
  PAYMENT_FREQUENCIES,
  POSTED_TRANSACTION_STATUSES,
  RECONCILIATION_STATUSES,
  SNAPSHOT_SOURCE_TYPES,
  TAX_CATEGORIES,
  TRANSACTION_SOURCE_TYPES,
  TRANSACTION_TYPES,
} from '../domain/accounting/constants';
import { isFinancialDate, isUtcTimestamp } from '../domain/accounting/financial-date';
import { calculateReconciliationDifference } from '../domain/accounting/reconciliation';
import { validateTransactionSignConvention } from '../domain/accounting/transaction-validation';

const optionalText = z.string().trim().max(4_000).nullable().optional();
const requiredText = z.string().trim().min(1).max(500);
const idSchema = z.uuid();
const financialDateSchema = z
  .string()
  .refine(isFinancialDate, 'Must be a valid ISO YYYY-MM-DD date.');
const utcTimestampSchema = z
  .string()
  .refine(isUtcTimestamp, 'Must be a valid UTC ISO timestamp ending in Z.');
const moneyCentsSchema = z.number().int().safe();
const nonnegativeMoneyCentsSchema = moneyCentsSchema.nonnegative();

export const debtInsertSchema = z
  .object({
    id: idSchema,
    name: requiredText,
    creditor: requiredText,
    ownerEntity: requiredText,
    debtType: z.enum(DEBT_TYPES),
    purpose: requiredText,
    status: z.enum(DEBT_STATUSES),
    originalPrincipalCents: nonnegativeMoneyCentsSchema,
    originationDate: financialDateSchema,
    maturityDate: financialDateSchema.nullable().optional(),
    minimumPaymentCents: nonnegativeMoneyCentsSchema,
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    creditLimitCents: nonnegativeMoneyCentsSchema.nullable().optional(),
    collateralDescription: optionalText,
    taxCategory: z.enum(TAX_CATEGORIES),
    deductiblePercentageBps: z.number().int().min(0).max(10_000),
    notes: optionalText,
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
    archivedAtUtc: utcTimestampSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.maturityDate && value.maturityDate < value.originationDate) {
      context.addIssue({
        code: 'custom',
        message: 'Maturity date cannot precede origination date.',
        path: ['maturityDate'],
      });
    }
  });

export const debtTermInsertSchema = z
  .object({
    id: idSchema,
    debtId: idSchema,
    effectiveStartDate: financialDateSchema,
    effectiveEndDate: financialDateSchema.nullable().optional(),
    interestRateType: z.enum(INTEREST_RATE_TYPES),
    interestRateMicros: z.number().int().safe().nonnegative(),
    dayCountConvention: z.enum(DAY_COUNT_CONVENTIONS),
    calculationConvention: z.enum(INTEREST_CALCULATION_CONVENTIONS),
    requiredPaymentCents: nonnegativeMoneyCentsSchema,
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    notes: optionalText,
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .superRefine((value, context) => {
    if (value.effectiveEndDate && value.effectiveEndDate < value.effectiveStartDate) {
      context.addIssue({
        code: 'custom',
        message: 'Effective end date cannot precede the start date.',
        path: ['effectiveEndDate'],
      });
    }

    if (value.interestRateType === 'zero' && value.interestRateMicros !== 0) {
      context.addIssue({
        code: 'custom',
        message: 'A zero-rate term must have a zero scaled interest rate.',
        path: ['interestRateMicros'],
      });
    }
  });

export const transactionAllocationInsertSchema = z.object({
  id: idSchema,
  transactionId: idSchema,
  allocationType: z.enum(ALLOCATION_TYPES),
  amountCents: moneyCentsSchema.refine((value) => value !== 0, {
    message: 'Allocation amount must be nonzero.',
  }),
  notes: optionalText,
  createdAtUtc: utcTimestampSchema,
  updatedAtUtc: utcTimestampSchema,
});

export const debtTransactionInsertSchema = z
  .object({
    id: idSchema,
    debtId: idSchema,
    transactionType: z.enum(TRANSACTION_TYPES),
    effectiveDate: financialDateSchema,
    postingDate: financialDateSchema,
    totalAmountCents: moneyCentsSchema.refine((value) => value !== 0, {
      message: 'Transaction total must be nonzero.',
    }),
    status: z.enum(POSTED_TRANSACTION_STATUSES),
    description: requiredText,
    sourceType: z.enum(TRANSACTION_SOURCE_TYPES),
    sourceReference: optionalText,
    reversalOfTransactionId: idSchema.nullable().optional(),
    supersedesTransactionId: idSchema.nullable().optional(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .superRefine((value, context) => {
    const errors = validateTransactionSignConvention(value, []);

    for (const message of errors.filter((error) => !error.includes('allocations'))) {
      context.addIssue({ code: 'custom', message });
    }

    if (
      value.reversalOfTransactionId === value.id ||
      value.supersedesTransactionId === value.id
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A transaction cannot reference itself.',
      });
    }
  });

export const balanceSnapshotInsertSchema = z.object({
  id: idSchema,
  debtId: idSchema,
  effectiveDate: financialDateSchema,
  confirmedBalanceCents: nonnegativeMoneyCentsSchema,
  sourceType: z.enum(SNAPSHOT_SOURCE_TYPES),
  sourceReference: optionalText,
  notes: optionalText,
  createdAtUtc: utcTimestampSchema,
  updatedAtUtc: utcTimestampSchema,
});

export const balanceReconciliationInputSchema = z.object({
  id: idSchema,
  debtId: idSchema,
  statementDate: financialDateSchema,
  statementEndingBalanceCents: nonnegativeMoneyCentsSchema,
  applicationCalculatedBalanceCents: nonnegativeMoneyCentsSchema,
  reconciliationStatus: z.enum(RECONCILIATION_STATUSES),
  explanation: optionalText,
  approvedAdjustmentTransactionId: idSchema.nullable().optional(),
  sourceReference: optionalText,
  supportingNotes: optionalText,
  createdAtUtc: utcTimestampSchema,
  updatedAtUtc: utcTimestampSchema,
});

export const balanceReconciliationRecordSchema = balanceReconciliationInputSchema
  .extend({
    calculatedDifferenceCents: moneyCentsSchema,
  })
  .superRefine((value, context) => {
    const calculated = calculateReconciliationDifference(
      value.statementEndingBalanceCents,
      value.applicationCalculatedBalanceCents,
    );

    if (value.calculatedDifferenceCents !== calculated) {
      context.addIssue({
        code: 'custom',
        message: 'Calculated difference does not match the two balances.',
        path: ['calculatedDifferenceCents'],
      });
    }

    const requiresAdjustment =
      value.reconciliationStatus === 'reconciled_with_adjustment';

    if (requiresAdjustment !== Boolean(value.approvedAdjustmentTransactionId)) {
      context.addIssue({
        code: 'custom',
        message:
          'Only reconciliations with an approved adjustment may reference an adjustment transaction.',
        path: ['approvedAdjustmentTransactionId'],
      });
    }
  });

export const auditEventInsertSchema = z.object({
  id: idSchema,
  eventType: requiredText,
  entityType: requiredText,
  entityId: requiredText,
  action: requiredText,
  occurredAtUtc: utcTimestampSchema,
  source: z.enum(AUDIT_SOURCES),
  summary: requiredText,
  beforeMetadataJson: optionalText,
  afterMetadataJson: optionalText,
});

export type DebtInsert = z.infer<typeof debtInsertSchema>;
export type DebtTermInsert = z.infer<typeof debtTermInsertSchema>;
export type DebtTransactionInsert = z.infer<typeof debtTransactionInsertSchema>;
export type TransactionAllocationInsert = z.infer<
  typeof transactionAllocationInsertSchema
>;
export type BalanceSnapshotInsert = z.infer<typeof balanceSnapshotInsertSchema>;
export type BalanceReconciliationInput = z.infer<
  typeof balanceReconciliationInputSchema
>;
export type AuditEventInsert = z.infer<typeof auditEventInsertSchema>;
