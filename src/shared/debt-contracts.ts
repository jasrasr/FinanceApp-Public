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
  PAYOFF_SCENARIO_STATUSES,
  PAYOFF_STRATEGIES,
  POSTED_ACTIVITY_TRANSACTION_TYPES,
  RECONCILIATION_LIFECYCLE_STATUSES,
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
        description: optionalTextSchema,
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
    reversalDate: financialDateInputSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const voidDebtTransactionRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    voidDate: financialDateInputSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const editDebtTransactionRequestSchema = createDebtTransactionRequestSchema
  .extend({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
  })
  .strict();

export const voidBalanceReconciliationRequestSchema = z
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
        reconciliationStatus: reconciliationStatusSchema.optional(),
        explanation: optionalTextSchema.optional(),
        approvedAdjustment: z
          .object({
            totalAmount: moneyInputSchema,
            description: optionalTextSchema,
            allocations: transactionAllocationInputSchema,
          })
          .strict()
          .nullable()
          .optional(),
        supersedesReconciliationId: uuidSchema.nullable().optional(),
        sourceReference: optionalTextSchema.optional(),
        supportingNotes: optionalTextSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const listDebtsRequestSchema = z
  .object({
    includeArchived: z.boolean(),
  })
  .strict();

export const getDashboardRequestSchema = z.object({}).strict();

export const getDataManagementStatusRequestSchema = z.object({}).strict();

export const createManualBackupRequestSchema = z.object({}).strict();

export const restoreBackupRequestSchema = z
  .object({
    backupId: z.string().trim().min(1).max(255),
    confirmed: z.literal(true),
  })
  .strict();

export const exportDataRequestSchema = z
  .object({
    format: z.literal('csv'),
    includeReports: z.boolean(),
  })
  .strict();

export const getDebtReportsRequestSchema = z
  .object({
    startDate: financialDateInputSchema.nullable(),
    endDate: financialDateInputSchema.nullable(),
    debtId: uuidSchema.nullable(),
    ownerEntity: z.string().trim().max(500).nullable(),
    debtType: z.enum(DEBT_TYPES).nullable(),
    status: z.enum(DEBT_STATUSES).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'Start date cannot be after end date.',
        path: ['startDate'],
      });
    }
  });

export const selectWorkbookForImportRequestSchema = z.object({}).strict();

export const listImportBatchesRequestSchema = z.object({}).strict();

export const getImportBatchRequestSchema = z.object({ id: uuidSchema }).strict();
export const previewImportBatchPostingRequestSchema = z
  .object({ batchId: uuidSchema })
  .strict();
export const postImportBatchRequestSchema = z
  .object({ batchId: uuidSchema, confirmed: z.literal(true) })
  .strict();

const payoffStrategySchema = z.enum(PAYOFF_STRATEGIES);

export const createPayoffScenarioRequestSchema = z
  .object({
    name: requiredTextSchema,
    scenarioStartDate: financialDateInputSchema,
    strategy: payoffStrategySchema,
    extraMonthlyPayment: moneyInputSchema,
    customPriority: z.array(uuidSchema),
    variableRateOverrides: z.record(uuidSchema, requiredTextSchema),
    maxProjectionMonths: z.number().int().min(1).max(600),
  })
  .strict();

export const listPayoffScenariosRequestSchema = z
  .object({ includeArchived: z.boolean() })
  .strict();

export const getPayoffScenarioRequestSchema = z.object({ id: uuidSchema }).strict();

export const rerunPayoffScenarioRequestSchema = z.object({ id: uuidSchema }).strict();

export const archivePayoffScenarioRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    confirmed: z.literal(true),
  })
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
      'escrow_disbursement',
      'escrow_adjustment',
      'escrow_refund',
      'approved_reconciliation_adjustment',
      'reversal',
      'other',
    ]),
    effectiveDate: financialDateInputSchema,
    postingDate: financialDateInputSchema,
    totalAmount: z.string(),
    status: z.enum(['posted', 'reversed', 'superseded', 'voided']),
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
    lifecycleStatus: z.enum(RECONCILIATION_LIFECYCLE_STATUSES),
    supersedesReconciliationId: uuidSchema.nullable(),
    supersededByReconciliationId: uuidSchema.nullable(),
    voidedAtUtc: utcTimestampSchema.nullable(),
    supersededAtUtc: utcTimestampSchema.nullable(),
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
    currentBalance: z.string(),
    currentBalanceEffectiveDate: financialDateInputSchema,
    calculatedEscrowBalance: z.string(),
    originationDate: financialDateInputSchema,
    maturityDate: financialDateInputSchema.nullable(),
    initialTerm: debtTermDtoSchema,
    currentTerm: debtTermDtoSchema,
    archivedAtUtc: utcTimestampSchema.nullable(),
  })
  .strict();

export const debtDetailDtoSchema = debtSummaryDtoSchema
  .omit({ initialTerm: true, currentTerm: true })
  .extend({
    purpose: z.string(),
    minimumPayment: z.string(),
    paymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    creditLimit: z.string().nullable(),
    collateralDescription: z.string().nullable(),
    taxCategory: z.enum(TAX_CATEGORIES),
    deductiblePercentage: z.string(),
    notes: z.string().nullable(),
    currentTerm: debtTermDtoSchema,
    terms: z.array(debtTermDtoSchema).min(1),
    transactions: z.array(debtTransactionDtoSchema),
    balanceSnapshots: z.array(balanceSnapshotDtoSchema),
    balanceReconciliations: z.array(balanceReconciliationDtoSchema),
    calculatedEscrowBalance: z.string(),
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
        escrowBalance: z.string(),
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
        escrowBalance: z.string(),
        requiredMonthlyPayments: z.string(),
        weightedAverageInterestRate: z.string(),
      })
      .strict(),
    upcomingMaturities: z.array(dashboardDebtMetricDtoSchema),
    escrowBalances: z.array(dashboardDebtMetricDtoSchema),
    attentionItems: z.array(dashboardAttentionItemDtoSchema),
    activeDebtCount: z.number().int().nonnegative(),
  })
  .strict();

const backupSummaryDtoSchema = z
  .object({
    id: z.string(),
    fileName: z.string(),
    kind: z.enum(['manual', 'automatic', 'pre_restore']),
    createdAtUtc: utcTimestampSchema,
    sizeBytes: z.number().int().nonnegative(),
    integrityStatus: z.enum(['valid', 'invalid', 'not_checked']),
  })
  .strict();

const backupOperationDtoSchema = z
  .object({
    status: z.enum(['succeeded', 'failed', 'not_run']),
    message: z.string(),
    completedAtUtc: utcTimestampSchema.nullable(),
    backup: backupSummaryDtoSchema.nullable(),
  })
  .strict();

export const dataManagementStatusDtoSchema = z
  .object({
    backupDirectoryDisplayPath: z.string(),
    lastSuccessfulBackupAtUtc: utcTimestampSchema.nullable(),
    availableBackups: z.array(backupSummaryDtoSchema),
    lastBackup: backupOperationDtoSchema,
    lastRestore: backupOperationDtoSchema,
  })
  .strict();

export const dataExportDtoSchema = z
  .object({
    status: z.enum(['succeeded', 'cancelled']),
    exportedAtUtc: utcTimestampSchema.nullable(),
    exportDirectoryDisplayPath: z.string().nullable(),
    fileCount: z.number().int().nonnegative(),
    format: z.literal('csv'),
    message: z.string(),
  })
  .strict();

const debtReportFilterDtoSchema = z
  .object({
    startDate: financialDateInputSchema,
    endDate: financialDateInputSchema,
    effectiveDate: financialDateInputSchema,
    debtId: uuidSchema.nullable(),
    ownerEntity: z.string().nullable(),
    debtType: z.enum(DEBT_TYPES).nullable(),
    status: z.enum(DEBT_STATUSES).nullable(),
  })
  .strict();

const reportBasisDtoSchema = z
  .object({
    title: z.string(),
    dateRange: z.string(),
    effectiveDate: financialDateInputSchema,
    balanceBasis: z.string(),
    assumptions: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

const rollforwardRowDtoSchema = z
  .object({
    period: z.string(),
    beginningBalance: z.string(),
    borrowings: z.string(),
    payments: z.string(),
    principalReduction: z.string(),
    interestActivity: z.string(),
    adjustmentsAndOther: z.string(),
    rollforwardCheck: z.string(),
    endingBalance: z.string(),
  })
  .strict();

const balanceHistoryRowDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    creditor: z.string(),
    effectiveDate: financialDateInputSchema,
    calculatedBalance: z.string(),
    confirmedBalance: z.string().nullable(),
    basis: z.string(),
  })
  .strict();

const trendRowDtoSchema = z
  .object({
    period: z.string(),
    principalReduction: z.string(),
    interestActivity: z.string(),
    borrowings: z.string(),
    payments: z.string(),
  })
  .strict();

const annualInterestByDebtRowDtoSchema = z
  .object({
    year: z.string(),
    debtId: uuidSchema,
    debtName: z.string(),
    interestExpense: z.string(),
  })
  .strict();

const balanceTrendRowDtoSchema = z
  .object({
    period: z.string(),
    periodEndDate: financialDateInputSchema,
    grouping: z.string(),
    endingBalance: z.string(),
    changeFromPriorPeriod: z.string().nullable(),
  })
  .strict();

const scheduleRowDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    creditor: z.string(),
    ownerEntity: z.string(),
    debtType: z.enum(DEBT_TYPES),
    status: z.enum(DEBT_STATUSES),
    maturityDate: financialDateInputSchema.nullable(),
    requiredMonthlyPayment: z.string(),
    currentInterestRate: z.string(),
    calculatedBalance: z.string(),
    basis: z.string(),
  })
  .strict();

const sensitivityRowDtoSchema = z
  .object({
    scenarioLabel: z.string(),
    assumption: z.string(),
    baselineRate: z.string().nullable(),
    rateChange: z.string().nullable(),
    projectedPayoffDate: financialDateInputSchema.nullable(),
    payoffTimingChangeMonths: z.number().int().nullable(),
    totalProjectedInterest: z.string(),
    changeFromBaselineInterest: z.string().nullable(),
    interestSaved: z.string().nullable(),
    monthlyCashRequirement: z.string(),
    warnings: z.array(z.string()),
  })
  .strict();

const varianceRowDtoSchema = z
  .object({
    scenarioId: uuidSchema,
    scenarioName: z.string(),
    debtId: uuidSchema,
    debtName: z.string(),
    actualPrincipalReduction: z.string(),
    plannedPrincipalReduction: z.string().nullable(),
    variance: z.string().nullable(),
    basis: z.string(),
    warnings: z.array(z.string()),
  })
  .strict();

const exceptionRowDtoSchema = z
  .object({
    severity: z.enum(['info', 'warning', 'exception']),
    category: z.string(),
    debtId: uuidSchema.nullable(),
    debtName: z.string().nullable(),
    effectiveDate: financialDateInputSchema.nullable(),
    message: z.string(),
    sourceId: z.string().nullable(),
  })
  .strict();

export const debtReportsDtoSchema = z
  .object({
    filters: debtReportFilterDtoSchema,
    monthlyRollforward: z
      .object({ basis: reportBasisDtoSchema, rows: z.array(rollforwardRowDtoSchema) })
      .strict(),
    annualRollforward: z
      .object({ basis: reportBasisDtoSchema, rows: z.array(rollforwardRowDtoSchema) })
      .strict(),
    balanceHistory: z
      .object({
        basis: reportBasisDtoSchema,
        rows: z.array(balanceHistoryRowDtoSchema),
      })
      .strict(),
    activityTrends: z
      .object({
        basis: reportBasisDtoSchema,
        rows: z.array(trendRowDtoSchema),
        annualInterestByDebt: z.array(annualInterestByDebtRowDtoSchema).default([]),
      })
      .strict(),
    balanceTrends: z
      .object({ basis: reportBasisDtoSchema, rows: z.array(balanceTrendRowDtoSchema) })
      .strict(),
    maturitySchedule: z
      .object({ basis: reportBasisDtoSchema, rows: z.array(scheduleRowDtoSchema) })
      .strict(),
    interestRateSensitivity: z
      .object({ basis: reportBasisDtoSchema, rows: z.array(sensitivityRowDtoSchema) })
      .strict(),
    extraPaymentSensitivity: z
      .object({ basis: reportBasisDtoSchema, rows: z.array(sensitivityRowDtoSchema) })
      .strict(),
    actualVersusPlanVariance: z
      .object({ basis: reportBasisDtoSchema, rows: z.array(varianceRowDtoSchema) })
      .strict(),
    reconciliationAndDataQuality: z
      .object({ basis: reportBasisDtoSchema, rows: z.array(exceptionRowDtoSchema) })
      .strict(),
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

export const payoffScenarioDebtResultDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    creditor: z.string(),
    startingBalance: z.string(),
    projectionStatus: z.enum(['projected', 'unsupported']),
    projectedPayoffDate: financialDateInputSchema.nullable(),
    projectedInterest: z.string().nullable(),
    requiredMonthlyPayment: z.string(),
    warnings: z.array(z.string()),
  })
  .strict();

export const payoffScenarioResultDtoSchema = z
  .object({
    calculationEngineVersion: z.string(),
    scenarioStartDate: financialDateInputSchema,
    projectedPayoffDate: financialDateInputSchema.nullable(),
    totalProjectedInterest: z.string(),
    monthlyCashRequirement: z.string(),
    baselineInterest: z.string(),
    interestSavings: z.string(),
    assumptions: z.array(z.string()),
    debts: z.array(payoffScenarioDebtResultDtoSchema),
    warnings: z.array(z.string()),
  })
  .strict();

export const payoffScenarioDtoSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    strategy: payoffStrategySchema,
    status: z.enum(PAYOFF_SCENARIO_STATUSES),
    scenarioStartDate: financialDateInputSchema,
    extraMonthlyPayment: z.string(),
    customPriority: z.array(uuidSchema),
    variableRateOverrides: z.record(uuidSchema, z.string()),
    maxProjectionMonths: z.number().int().positive(),
    result: payoffScenarioResultDtoSchema,
    calculationEngineVersion: z.string(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
    archivedAtUtc: utcTimestampSchema.nullable(),
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
export const dataManagementStatusResultSchema = applicationResultSchema(
  dataManagementStatusDtoSchema,
);
export const dataExportResultSchema = applicationResultSchema(dataExportDtoSchema);
export const debtReportsResultSchema = applicationResultSchema(debtReportsDtoSchema);
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
export const payoffScenarioResultSchema = applicationResultSchema(
  payoffScenarioDtoSchema,
);
export const payoffScenarioListResultSchema = applicationResultSchema(
  z.array(payoffScenarioDtoSchema),
);

export type CreateDebtRequest = z.infer<typeof createDebtRequestSchema>;
export type DebtCoreInput = z.infer<typeof debtCoreInputSchema>;
export type DebtTermInput = z.infer<typeof debtTermInputSchema>;
export type UpdateDebtRequest = z.infer<typeof updateDebtRequestSchema>;
export type AddDebtTermRequest = z.infer<typeof addDebtTermRequestSchema>;
export type CreateDebtTransactionRequest = z.infer<
  typeof createDebtTransactionRequestSchema
>;
export type EditDebtTransactionRequest = z.infer<
  typeof editDebtTransactionRequestSchema
>;
export type ReverseDebtTransactionRequest = z.infer<
  typeof reverseDebtTransactionRequestSchema
>;
export type VoidDebtTransactionRequest = z.infer<
  typeof voidDebtTransactionRequestSchema
>;
export type VoidBalanceReconciliationRequest = z.infer<
  typeof voidBalanceReconciliationRequestSchema
>;
export type CreateBalanceSnapshotRequest = z.infer<
  typeof createBalanceSnapshotRequestSchema
>;
export type CreateBalanceReconciliationRequest = z.infer<
  typeof createBalanceReconciliationRequestSchema
>;
export type ListDebtsRequest = z.infer<typeof listDebtsRequestSchema>;
export type GetDashboardRequest = z.infer<typeof getDashboardRequestSchema>;
export type GetDataManagementStatusRequest = z.infer<
  typeof getDataManagementStatusRequestSchema
>;
export type CreateManualBackupRequest = z.infer<typeof createManualBackupRequestSchema>;
export type RestoreBackupRequest = z.infer<typeof restoreBackupRequestSchema>;
export type ExportDataRequest = z.infer<typeof exportDataRequestSchema>;
export type GetDebtReportsRequest = z.infer<typeof getDebtReportsRequestSchema>;
export type SelectWorkbookForImportRequest = z.infer<
  typeof selectWorkbookForImportRequestSchema
>;
export type ListImportBatchesRequest = z.infer<typeof listImportBatchesRequestSchema>;
export type GetImportBatchRequest = z.infer<typeof getImportBatchRequestSchema>;
export type PreviewImportBatchPostingRequest = z.infer<
  typeof previewImportBatchPostingRequestSchema
>;
export type PostImportBatchRequest = z.infer<typeof postImportBatchRequestSchema>;
export type CreatePayoffScenarioRequest = z.infer<
  typeof createPayoffScenarioRequestSchema
>;
export type ListPayoffScenariosRequest = z.infer<
  typeof listPayoffScenariosRequestSchema
>;
export type GetPayoffScenarioRequest = z.infer<typeof getPayoffScenarioRequestSchema>;
export type RerunPayoffScenarioRequest = z.infer<
  typeof rerunPayoffScenarioRequestSchema
>;
export type ArchivePayoffScenarioRequest = z.infer<
  typeof archivePayoffScenarioRequestSchema
>;
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
export type DataManagementStatusDto = z.infer<typeof dataManagementStatusDtoSchema>;
export type DataExportDto = z.infer<typeof dataExportDtoSchema>;
export type DebtReportsDto = z.infer<typeof debtReportsDtoSchema>;
export type AppMetadataDto = z.infer<typeof appMetadataDtoSchema>;
export type ImportBatchSummaryDto = z.infer<typeof importBatchSummaryDtoSchema>;
export type ImportBatchDto = z.infer<typeof importBatchDtoSchema>;
export type ImportSheetMappingDto = z.infer<typeof importSheetMappingDtoSchema>;
export type StagedImportRowDto = z.infer<typeof stagedImportRowDtoSchema>;
export type ImportPostingPreviewDto = z.infer<typeof importPostingPreviewDtoSchema>;
export type ImportPostingResultDto = z.infer<typeof importPostingResultDtoSchema>;
export type PayoffScenarioDto = z.infer<typeof payoffScenarioDtoSchema>;
export type PayoffScenarioResultDto = z.infer<typeof payoffScenarioResultDtoSchema>;
export type ApplicationError = z.infer<typeof applicationErrorSchema>;
export type ApplicationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApplicationError };
