import { z } from 'zod';
import {
  ALLOCATION_TYPES,
  BALANCE_SNAPSHOT_SOURCE_TYPES,
  DAY_COUNT_CONVENTIONS,
  DEBT_STATUSES,
  DEBT_TYPES,
  INTEREST_CALCULATION_CONVENTIONS,
  INTEREST_RATE_TYPES,
  MANUAL_ENTRY_SOURCE_TYPES,
  PAYMENT_FREQUENCIES,
  POSTED_ACTIVITY_TRANSACTION_TYPES,
  RECONCILIATION_STATUSES,
  TAX_CATEGORIES,
} from './debt-options';

const requiredTextSchema = z.string().trim().min(1).max(500);
const optionalTextSchema = z.string().trim().max(4_000).nullable();
const financialDateInputSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = z.uuid();
const utcTimestampSchema = z.iso.datetime({ offset: false });
const moneyInputSchema = z.string().trim().min(1).max(100);
const optionalMoneyInputSchema = z.string().trim().max(100).nullable().optional();

const transactionAllocationInputSchema = z
  .object({
    principal: optionalMoneyInputSchema,
    interest: optionalMoneyInputSchema,
    escrow: optionalMoneyInputSchema,
    fee: optionalMoneyInputSchema,
    penalty: optionalMoneyInputSchema,
    extraPrincipal: optionalMoneyInputSchema,
    other: optionalMoneyInputSchema,
  })
  .strict();

const reconciliationStatusSchema = z.enum(RECONCILIATION_STATUSES);
const importRecordTypeSchema = z.enum([
  'debt',
  'transaction',
  'term',
  'balance_snapshot',
  'unknown',
]);
const importReviewStatusSchema = z.enum([
  'needs_review',
  'approved',
  'rejected',
  'deferred',
]);
const importActivityClassificationSchema = z.enum(['actual', 'projected', 'ambiguous']);

export const debtTermInputSchema = z
  .object({
    effectiveStartDate: financialDateInputSchema,
    interestRateType: z.enum(INTEREST_RATE_TYPES),
    annualInterestRatePercent: requiredTextSchema,
    dayCountConvention: z.enum(DAY_COUNT_CONVENTIONS),
    calculationConvention: z.enum(INTEREST_CALCULATION_CONVENTIONS),
    requiredPayment: requiredTextSchema,
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    notes: optionalTextSchema,
  })
  .strict();

export const debtCoreInputSchema = z
  .object({
    name: requiredTextSchema,
    creditor: requiredTextSchema,
    ownerEntity: requiredTextSchema,
    debtType: z.enum(DEBT_TYPES),
    purpose: requiredTextSchema,
    status: z.enum(DEBT_STATUSES),
    originalPrincipal: requiredTextSchema,
    originationDate: financialDateInputSchema,
    maturityDate: financialDateInputSchema.nullable(),
    minimumPayment: requiredTextSchema,
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    creditLimit: z.string().trim().max(100).nullable(),
    collateralDescription: optionalTextSchema,
    taxCategory: z.enum(TAX_CATEGORIES),
    deductiblePercentage: requiredTextSchema,
    notes: optionalTextSchema,
  })
  .strict();

export const createDebtRequestSchema = z
  .object({
    debt: debtCoreInputSchema,
    initialTerm: debtTermInputSchema,
  })
  .strict();

export const updateDebtRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    changes: debtCoreInputSchema
      .pick({
        name: true,
        creditor: true,
        ownerEntity: true,
        debtType: true,
        purpose: true,
        status: true,
        maturityDate: true,
        creditLimit: true,
        collateralDescription: true,
        taxCategory: true,
        deductiblePercentage: true,
        notes: true,
      })
      .strict(),
  })
  .strict();

export const addDebtTermRequestSchema = z
  .object({
    debtId: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    term: debtTermInputSchema,
  })
  .strict();

export const createDebtTransactionRequestSchema = z
  .object({
    debtId: uuidSchema,
    transaction: z
      .object({
        transactionType: z.enum(POSTED_ACTIVITY_TRANSACTION_TYPES),
        effectiveDate: financialDateInputSchema,
        postingDate: financialDateInputSchema,
        status: z.literal('posted'),
        totalAmount: moneyInputSchema,
        description: requiredTextSchema,
        sourceType: z.enum(MANUAL_ENTRY_SOURCE_TYPES),
        sourceReference: optionalTextSchema,
        allocations: transactionAllocationInputSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.transaction.postingDate < value.transaction.effectiveDate) {
      context.addIssue({
        code: 'custom',
        message: 'Posting date cannot precede the effective date.',
        path: ['transaction', 'postingDate'],
      });
    }
  });

export const reverseDebtTransactionRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const createBalanceSnapshotRequestSchema = z
  .object({
    debtId: uuidSchema,
    snapshot: z
      .object({
        effectiveDate: financialDateInputSchema,
        confirmedBalance: moneyInputSchema,
        sourceType: z.enum(BALANCE_SNAPSHOT_SOURCE_TYPES),
        sourceReference: optionalTextSchema,
        notes: optionalTextSchema,
      })
      .strict(),
  })
  .strict();

export const createBalanceReconciliationRequestSchema = z
  .object({
    debtId: uuidSchema,
    reconciliation: z
      .object({
        statementDate: financialDateInputSchema,
        statementEndingBalance: moneyInputSchema,
        reconciliationStatus: reconciliationStatusSchema,
        explanation: optionalTextSchema,
        approvedAdjustment: z
          .object({
            totalAmount: moneyInputSchema,
            description: requiredTextSchema,
            allocations: transactionAllocationInputSchema,
          })
          .strict()
          .nullable()
          .optional(),
        sourceReference: optionalTextSchema,
        supportingNotes: optionalTextSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasAdjustment = Boolean(value.reconciliation.approvedAdjustment);

    if (
      value.reconciliation.reconciliationStatus === 'reconciled_with_adjustment' &&
      !hasAdjustment
    ) {
      context.addIssue({
        code: 'custom',
        message: 'An approved adjustment is required for this status.',
        path: ['reconciliation', 'approvedAdjustment'],
      });
    }

    if (
      value.reconciliation.reconciliationStatus !== 'reconciled_with_adjustment' &&
      hasAdjustment
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Approved adjustments are allowed only for reconciled-with-adjustment status.',
        path: ['reconciliation', 'approvedAdjustment'],
      });
    }
  });

export const listDebtsRequestSchema = z
  .object({
    includeArchived: z.boolean(),
  })
  .strict();

export const getDashboardRequestSchema = z.object({}).strict();

export const selectWorkbookForImportRequestSchema = z.object({}).strict();

export const listImportBatchesRequestSchema = z.object({}).strict();

export const getImportBatchRequestSchema = z.object({ id: uuidSchema }).strict();
export const previewImportBatchPostingRequestSchema = z
  .object({ batchId: uuidSchema })
  .strict();
export const postImportBatchRequestSchema = z
  .object({ batchId: uuidSchema, confirmed: z.literal(true) })
  .strict();

export const updateImportSheetMappingRequestSchema = z
  .object({
    batchId: uuidSchema,
    mappingId: uuidSchema,
    proposedRecordType: importRecordTypeSchema,
    reviewStatus: importReviewStatusSchema,
    fieldMapping: z.record(z.string(), z.string().trim().max(200)),
    notes: optionalTextSchema,
  })
  .strict();

export const updateStagedImportRowReviewRequestSchema = z
  .object({
    batchId: uuidSchema,
    rowId: uuidSchema,
    proposedRecordType: importRecordTypeSchema,
    activityClassification: importActivityClassificationSchema,
    reviewStatus: importReviewStatusSchema,
    normalizedValues: z.record(z.string(), z.string().trim().max(500).nullable()),
    reviewNotes: optionalTextSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.reviewStatus === 'approved' &&
      value.activityClassification === 'ambiguous'
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Ambiguous actual-versus-projected rows must be classified before approval.',
        path: ['activityClassification'],
      });
    }
  });

export const getDebtRequestSchema = z.object({ id: uuidSchema }).strict();

export const archiveDebtRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const restoreDebtRequestSchema = archiveDebtRequestSchema;

export const debtTermDtoSchema = z
  .object({
    id: uuidSchema,
    effectiveStartDate: financialDateInputSchema,
    effectiveEndDate: financialDateInputSchema.nullable(),
    interestRateType: z.enum(INTEREST_RATE_TYPES),
    annualInterestRatePercent: z.string(),
    dayCountConvention: z.enum(DAY_COUNT_CONVENTIONS),
    calculationConvention: z.enum(INTEREST_CALCULATION_CONVENTIONS),
    requiredPayment: z.string(),
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    notes: z.string().nullable(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const transactionAllocationDtoSchema = z
  .object({
    id: uuidSchema,
    allocationType: z.enum(ALLOCATION_TYPES),
    amount: z.string(),
    notes: z.string().nullable(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const debtTransactionDtoSchema = z
  .object({
    id: uuidSchema,
    debtId: uuidSchema,
    transactionType: z.enum([
      'payment',
      'borrowing_draw',
      'fee',
      'penalty',
      'interest_charge',
      'principal_adjustment',
      'approved_reconciliation_adjustment',
      'reversal',
      'other',
    ]),
    effectiveDate: financialDateInputSchema,
    postingDate: financialDateInputSchema,
    totalAmount: z.string(),
    status: z.enum(['posted', 'reversed', 'superseded']),
    description: z.string(),
    sourceType: z.enum(['manual', 'import', 'statement', 'system', 'reconciliation']),
    sourceReference: z.string().nullable(),
    reversalOfTransactionId: uuidSchema.nullable(),
    supersedesTransactionId: uuidSchema.nullable(),
    allocations: z.array(transactionAllocationDtoSchema),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const balanceSnapshotDtoSchema = z
  .object({
    id: uuidSchema,
    debtId: uuidSchema,
    effectiveDate: financialDateInputSchema,
    confirmedBalance: z.string(),
    sourceType: z.enum(['manual', 'statement', 'import']),
    sourceReference: z.string().nullable(),
    notes: z.string().nullable(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const balanceReconciliationDtoSchema = z
  .object({
    id: uuidSchema,
    debtId: uuidSchema,
    statementDate: financialDateInputSchema,
    statementEndingBalance: z.string(),
    applicationCalculatedBalance: z.string(),
    calculatedDifference: z.string(),
    reconciliationStatus: reconciliationStatusSchema,
    explanation: z.string().nullable(),
    approvedAdjustmentTransactionId: uuidSchema.nullable(),
    sourceReference: z.string().nullable(),
    supportingNotes: z.string().nullable(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const debtSummaryDtoSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    creditor: z.string(),
    ownerEntity: z.string(),
    debtType: z.enum(DEBT_TYPES),
    status: z.enum(DEBT_STATUSES),
    originalPrincipal: z.string(),
    originationDate: financialDateInputSchema,
    maturityDate: financialDateInputSchema.nullable(),
    initialTerm: debtTermDtoSchema,
    archivedAtUtc: utcTimestampSchema.nullable(),
  })
  .strict();

export const debtDetailDtoSchema = debtSummaryDtoSchema
  .omit({ initialTerm: true })
  .extend({
    purpose: z.string(),
    minimumPayment: z.string(),
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    creditLimit: z.string().nullable(),
    collateralDescription: z.string().nullable(),
    taxCategory: z.enum(TAX_CATEGORIES),
    deductiblePercentage: z.string(),
    notes: z.string().nullable(),
    terms: z.array(debtTermDtoSchema).min(1),
    transactions: z.array(debtTransactionDtoSchema),
    balanceSnapshots: z.array(balanceSnapshotDtoSchema),
    balanceReconciliations: z.array(balanceReconciliationDtoSchema),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const dashboardDebtMetricDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    creditor: z.string(),
    amount: z.string(),
    effectiveDate: financialDateInputSchema,
    basis: z.string(),
  })
  .strict();

export const dashboardAttentionItemDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    creditor: z.string(),
    statementDate: financialDateInputSchema,
    status: reconciliationStatusSchema,
    difference: z.string(),
    sourceReference: z.string().nullable(),
    basis: z.string(),
  })
  .strict();

export const dashboardDtoSchema = z
  .object({
    effectiveDate: financialDateInputSchema,
    yearToDateStartDate: financialDateInputSchema,
    totals: z
      .object({
        activeDebt: z.string(),
        principalReductionYtd: z.string(),
        newBorrowingsYtd: z.string(),
        interestActivityYtd: z.string(),
        requiredMonthlyPayments: z.string(),
        weightedAverageInterestRate: z.string().nullable(),
      })
      .strict(),
    metricBasis: z
      .object({
        activeDebt: z.string(),
        principalReductionYtd: z.string(),
        newBorrowingsYtd: z.string(),
        interestActivityYtd: z.string(),
        requiredMonthlyPayments: z.string(),
        weightedAverageInterestRate: z.string(),
      })
      .strict(),
    upcomingMaturities: z.array(dashboardDebtMetricDtoSchema),
    attentionItems: z.array(dashboardAttentionItemDtoSchema),
    activeDebtCount: z.number().int().nonnegative(),
  })
  .strict();

export const appMetadataDtoSchema = z
  .object({
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
    lastChangedAtUtc: utcTimestampSchema,
  })
  .strict();

export const importSheetMappingDtoSchema = z
  .object({
    id: uuidSchema,
    batchId: uuidSchema,
    sourceSheetName: z.string(),
    proposedRecordType: importRecordTypeSchema,
    reviewStatus: importReviewStatusSchema,
    fieldMapping: z.record(z.string(), z.string()),
    notes: z.string().nullable(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const stagedImportRowDtoSchema = z
  .object({
    id: uuidSchema,
    batchId: uuidSchema,
    sheetMappingId: uuidSchema,
    sourceSheetName: z.string(),
    sourceRowNumber: z.number().int().positive(),
    sourceCellReferences: z.record(z.string(), z.string()),
    sourceDisplayedValues: z.record(z.string(), z.string()),
    sourceFormulas: z.record(z.string(), z.string()),
    proposedRecordType: importRecordTypeSchema,
    activityClassification: importActivityClassificationSchema,
    normalizedValues: z.record(z.string(), z.string().nullable()),
    validationMessages: z.array(z.string()),
    duplicateCandidate: z.string().nullable(),
    reconciliationException: z.string().nullable(),
    reviewStatus: importReviewStatusSchema,
    reviewNotes: z.string().nullable(),
    reviewedAtUtc: utcTimestampSchema.nullable(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const importControlTotalsDtoSchema = z
  .object({
    totalRows: z.number().int().nonnegative(),
    needsReviewRows: z.number().int().nonnegative(),
    approvedRows: z.number().int().nonnegative(),
    rejectedRows: z.number().int().nonnegative(),
    deferredRows: z.number().int().nonnegative(),
    ambiguousRows: z.number().int().nonnegative(),
    duplicateCandidateRows: z.number().int().nonnegative(),
    invalidRows: z.number().int().nonnegative(),
    reconciliationExceptionRows: z.number().int().nonnegative(),
    candidateTotalsByType: z.record(
      importRecordTypeSchema,
      z.number().int().nonnegative(),
    ),
  })
  .strict();

export const importBatchSummaryDtoSchema = z
  .object({
    id: uuidSchema,
    sourceWorkbookName: z.string(),
    sourceWorkbookFingerprint: z.string(),
    sourceWorkbookModifiedAtUtc: utcTimestampSchema.nullable(),
    status: z.enum(['open', 'reviewed', 'closed']),
    importedAtUtc: utcTimestampSchema,
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const importBatchDtoSchema = importBatchSummaryDtoSchema
  .extend({
    sheetMappings: z.array(importSheetMappingDtoSchema),
    stagedRows: z.array(stagedImportRowDtoSchema),
    controlTotals: importControlTotalsDtoSchema,
  })
  .strict();

export const importPostingLiveRecordDtoSchema = z
  .object({
    entityType: z.enum([
      'debt',
      'debt_term',
      'debt_transaction',
      'transaction_allocation',
      'balance_snapshot',
    ]),
    entityId: uuidSchema,
    label: z.string(),
  })
  .strict();

export const importPostingRowResultDtoSchema = z
  .object({
    stagedRowId: uuidSchema,
    sourceSheetName: z.string(),
    sourceRowNumber: z.number().int().positive(),
    proposedRecordType: importRecordTypeSchema,
    reviewStatus: importReviewStatusSchema,
    canPost: z.boolean(),
    validationMessages: z.array(z.string()),
    createdRecords: z.array(importPostingLiveRecordDtoSchema),
  })
  .strict();

export const importPostingPreviewDtoSchema = z
  .object({
    batchId: uuidSchema,
    batchStatus: z.enum(['open', 'reviewed', 'closed']),
    approvedMappings: z.number().int().nonnegative(),
    unapprovedMappings: z.number().int().nonnegative(),
    approvedRows: z.number().int().nonnegative(),
    rejectedRows: z.number().int().nonnegative(),
    deferredRows: z.number().int().nonnegative(),
    postableRows: z.number().int().nonnegative(),
    exceptionRows: z.number().int().nonnegative(),
    alreadyPosted: z.boolean(),
    rowResults: z.array(importPostingRowResultDtoSchema),
  })
  .strict();

export const importPostingResultDtoSchema = importPostingPreviewDtoSchema
  .extend({
    postedAtUtc: utcTimestampSchema.nullable(),
    createdRecordCount: z.number().int().nonnegative(),
  })
  .strict();

export const applicationErrorSchema = z
  .object({
    code: z.enum([
      'validation',
      'not_found',
      'conflict',
      'database_unavailable',
      'forbidden',
      'internal',
    ]),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .strict();

export const applicationResultSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: valueSchema }).strict(),
    z.object({ ok: z.literal(false), error: applicationErrorSchema }).strict(),
  ]);

export const debtSummaryListSchema = z.array(debtSummaryDtoSchema);
export const debtListResultSchema = applicationResultSchema(debtSummaryListSchema);
export const debtDetailResultSchema = applicationResultSchema(debtDetailDtoSchema);
export const dashboardResultSchema = applicationResultSchema(dashboardDtoSchema);
export const importBatchResultSchema = applicationResultSchema(importBatchDtoSchema);
export const importBatchOrNullResultSchema = applicationResultSchema(
  importBatchDtoSchema.nullable(),
);
export const importBatchSummaryListResultSchema = applicationResultSchema(
  z.array(importBatchSummaryDtoSchema),
);
export const importPostingPreviewResultSchema = applicationResultSchema(
  importPostingPreviewDtoSchema,
);
export const importPostingResultSchema = applicationResultSchema(
  importPostingResultDtoSchema,
);

export type CreateDebtRequest = z.infer<typeof createDebtRequestSchema>;
export type DebtCoreInput = z.infer<typeof debtCoreInputSchema>;
export type DebtTermInput = z.infer<typeof debtTermInputSchema>;
export type UpdateDebtRequest = z.infer<typeof updateDebtRequestSchema>;
export type AddDebtTermRequest = z.infer<typeof addDebtTermRequestSchema>;
export type CreateDebtTransactionRequest = z.infer<
  typeof createDebtTransactionRequestSchema
>;
export type ReverseDebtTransactionRequest = z.infer<
  typeof reverseDebtTransactionRequestSchema
>;
export type CreateBalanceSnapshotRequest = z.infer<
  typeof createBalanceSnapshotRequestSchema
>;
export type CreateBalanceReconciliationRequest = z.infer<
  typeof createBalanceReconciliationRequestSchema
>;
export type ListDebtsRequest = z.infer<typeof listDebtsRequestSchema>;
export type GetDashboardRequest = z.infer<typeof getDashboardRequestSchema>;
export type SelectWorkbookForImportRequest = z.infer<
  typeof selectWorkbookForImportRequestSchema
>;
export type ListImportBatchesRequest = z.infer<typeof listImportBatchesRequestSchema>;
export type GetImportBatchRequest = z.infer<typeof getImportBatchRequestSchema>;
export type PreviewImportBatchPostingRequest = z.infer<
  typeof previewImportBatchPostingRequestSchema
>;
export type PostImportBatchRequest = z.infer<typeof postImportBatchRequestSchema>;
export type UpdateImportSheetMappingRequest = z.infer<
  typeof updateImportSheetMappingRequestSchema
>;
export type UpdateStagedImportRowReviewRequest = z.infer<
  typeof updateStagedImportRowReviewRequestSchema
>;
export type GetDebtRequest = z.infer<typeof getDebtRequestSchema>;
export type ArchiveDebtRequest = z.infer<typeof archiveDebtRequestSchema>;
export type RestoreDebtRequest = z.infer<typeof restoreDebtRequestSchema>;
export type DebtTermDto = z.infer<typeof debtTermDtoSchema>;
export type TransactionAllocationDto = z.infer<typeof transactionAllocationDtoSchema>;
export type DebtTransactionDto = z.infer<typeof debtTransactionDtoSchema>;
export type BalanceSnapshotDto = z.infer<typeof balanceSnapshotDtoSchema>;
export type BalanceReconciliationDto = z.infer<typeof balanceReconciliationDtoSchema>;
export type DebtSummaryDto = z.infer<typeof debtSummaryDtoSchema>;
export type DebtDetailDto = z.infer<typeof debtDetailDtoSchema>;
export type DashboardDto = z.infer<typeof dashboardDtoSchema>;
export type AppMetadataDto = z.infer<typeof appMetadataDtoSchema>;
export type ImportBatchSummaryDto = z.infer<typeof importBatchSummaryDtoSchema>;
export type ImportBatchDto = z.infer<typeof importBatchDtoSchema>;
export type ImportSheetMappingDto = z.infer<typeof importSheetMappingDtoSchema>;
export type StagedImportRowDto = z.infer<typeof stagedImportRowDtoSchema>;
export type ImportPostingPreviewDto = z.infer<typeof importPostingPreviewDtoSchema>;
export type ImportPostingResultDto = z.infer<typeof importPostingResultDtoSchema>;
export type ApplicationError = z.infer<typeof applicationErrorSchema>;
export type ApplicationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApplicationError };
