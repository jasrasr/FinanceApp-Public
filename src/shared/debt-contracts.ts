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
const optionalUuidInputSchema = uuidSchema.nullable().optional();
const paymentDueDayInputSchema = z.number().int().min(1).max(31).nullable();

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
const refinanceEscrowHandlingSchema = z.enum([
  'carry_forward',
  'reset_opening_balance',
  'refund',
  'new_deposit',
]);

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

const debtCoreInputBaseSchema = z
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
    paymentDueDay: paymentDueDayInputSchema.optional(),
    paymentScheduleStartDate: financialDateInputSchema.nullable().optional(),
    creditLimit: z.string().trim().max(100).nullable(),
    collateralDescription: optionalTextSchema,
    taxCategory: z.enum(TAX_CATEGORIES),
    deductiblePercentage: requiredTextSchema,
    financingChainName: optionalTextSchema,
    refinancedFromDebtId: optionalUuidInputSchema,
    refinancedIntoDebtId: optionalUuidInputSchema,
    refinanceDate: financialDateInputSchema.nullable().optional(),
    notes: optionalTextSchema,
  })
  .strict();

const preventSelfRefinanceLinks = <
  T extends {
    refinancedFromDebtId?: string | null;
    refinancedIntoDebtId?: string | null;
  },
>(
  value: T,
  context: z.RefinementCtx,
): void => {
  if (
    value.refinancedFromDebtId &&
    value.refinancedFromDebtId === value.refinancedIntoDebtId
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Prior and replacement refinance debts must be different.',
      path: ['refinancedIntoDebtId'],
    });
  }
};

export const debtCoreInputSchema = debtCoreInputBaseSchema.superRefine(
  preventSelfRefinanceLinks,
);

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
    changes: debtCoreInputBaseSchema
      .pick({
        name: true,
        creditor: true,
        ownerEntity: true,
        debtType: true,
        purpose: true,
        status: true,
        maturityDate: true,
        paymentDueDay: true,
        paymentScheduleStartDate: true,
        creditLimit: true,
        collateralDescription: true,
        taxCategory: true,
        deductiblePercentage: true,
        financingChainName: true,
        refinancedFromDebtId: true,
        refinancedIntoDebtId: true,
        refinanceDate: true,
        notes: true,
      })
      .strict()
      .superRefine(preventSelfRefinanceLinks),
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
export const getDataHealthRequestSchema = z.object({}).strict();

export const getMilestonesRequestSchema = z
  .object({ scenarioId: uuidSchema.nullable() })
  .strict();
export const acceptCurrentBalanceRequestSchema = z
  .object({
    debtId: uuidSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const getDataManagementStatusRequestSchema = z.object({}).strict();

export const createManualBackupRequestSchema = z.object({}).strict();

export const restoreBackupRequestSchema = z
  .object({
    backupId: z.string().trim().min(1).max(255),
    confirmed: z.literal(true),
  })
  .strict();

export const deleteBackupRequestSchema = restoreBackupRequestSchema;

export const exportDataRequestSchema = z
  .object({
    format: z.literal('csv'),
    includeReports: z.boolean(),
  })
  .strict();

export const setDataLocationsRequestSchema = z
  .object({
    backupDirectory: z.string().trim().min(1).max(4000),
    exportDirectory: z.string().trim().min(1).max(4000),
    moveExistingBackups: z.boolean(),
  })
  .strict();
export const chooseDataFolderRequestSchema = z
  .object({
    kind: z.enum(['backup', 'export']),
  })
  .strict();
export const chooseBackupFileRequestSchema = z.object({}).strict();
export const openBackupFolderRequestSchema = z.object({}).strict();
export const importBackupFileRequestSchema = z
  .object({
    sourcePath: z.string().trim().min(1).max(4000),
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
    lumpSum: moneyInputSchema.optional(),
    lumpSumDate: financialDateInputSchema.optional(),
    initialLumpSumAllocations: z.record(uuidSchema, moneyInputSchema).optional(),
  })
  .strict();

const extraCashStrategySchema = z.enum([
  'highest_rate',
  'lowest_balance',
  'selected_debt',
  'custom_priority',
  'custom_split',
  'baseline',
]);

export const extraCashAllocationRequestSchema = z
  .object({
    analysisDate: financialDateInputSchema,
    lumpSum: moneyInputSchema,
    extraMonthlyPayment: moneyInputSchema,
    excludedDebtIds: z.array(uuidSchema),
    selectedDebtId: uuidSchema.nullable(),
    customPriority: z.array(uuidSchema),
    customSplit: z.record(uuidSchema, moneyInputSchema),
    maxProjectionMonths: z.number().int().min(1).max(600),
  })
  .strict();

export const listPayoffScenariosRequestSchema = z
  .object({ includeArchived: z.boolean() })
  .strict();

export const calculatePayoffBaselineRequestSchema = z
  .object({
    scenarioStartDate: financialDateInputSchema,
    maxProjectionMonths: z.number().int().positive().max(600),
  })
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

export const renamePayoffScenarioRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export const getDebtRequestSchema = z.object({ id: uuidSchema }).strict();

export const archiveDebtRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const recordRefinanceRequestSchema = z
  .object({
    debtId: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    refinanceDate: financialDateInputSchema,
    newRefinancedPrincipal: moneyInputSchema,
    newAnnualInterestRatePercent: requiredTextSchema,
    newRequiredPayment: moneyInputSchema,
    newPaymentFrequency: z.enum(PAYMENT_FREQUENCIES),
    newPaymentDueDay: paymentDueDayInputSchema.optional(),
    newMaturityDate: financialDateInputSchema,
    interestRateType: z.enum(INTEREST_RATE_TYPES),
    dayCountConvention: z.enum(DAY_COUNT_CONVENTIONS),
    calculationConvention: z.enum(INTEREST_CALCULATION_CONVENTIONS),
    financedFees: moneyInputSchema,
    cashFees: moneyInputSchema,
    escrowHandling: refinanceEscrowHandlingSchema,
    escrowAmount: z.string().trim().max(100).nullable(),
    lenderPayoffBalance: z.string().trim().max(100).nullable(),
    payoffDifferenceAcknowledged: z.boolean(),
    notes: optionalTextSchema,
  })
  .strict();

export const restoreDebtRequestSchema = archiveDebtRequestSchema;

export const deleteDebtPermanentlyRequestSchema = z
  .object({
    id: uuidSchema,
    expectedUpdatedAtUtc: utcTimestampSchema,
    typedDebtName: z.string().trim().min(1).max(500),
    confirmed: z.literal(true),
    secondConfirmed: z.literal(true),
  })
  .strict();

export const schedulingOverrideReasonSchema = z.enum([
  'historical_payment_not_entered',
  'lender_treated_prior_payment_as_satisfying',
  'starting_schedule_after_historical_data',
  'other',
]);

export const confirmScheduledPaymentRequestSchema = z
  .object({
    debtId: uuidSchema,
    dueDate: financialDateInputSchema,
    reason: schedulingOverrideReasonSchema,
    confirmed: z.literal(true),
  })
  .strict();

export const removeScheduledPaymentConfirmationRequestSchema = z
  .object({
    debtId: uuidSchema,
    dueDate: financialDateInputSchema,
    confirmed: z.literal(true),
  })
  .strict();

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
    paymentDueDay: paymentDueDayInputSchema,
    paymentScheduleStartDate: financialDateInputSchema.nullable().optional(),
    nextDueDate: financialDateInputSchema.nullable(),
    archivedAtUtc: utcTimestampSchema.nullable(),
    financingChainName: z.string().nullable(),
    refinancedFromDebtId: uuidSchema.nullable(),
    refinancedFromDebtName: z.string().nullable(),
    refinancedIntoDebtId: uuidSchema.nullable(),
    refinancedIntoDebtName: z.string().nullable(),
    refinanceDate: financialDateInputSchema.nullable(),
  })
  .strict();

const permanentDebtDeletionPreviewDtoSchema = z
  .object({
    debtTerms: z.number().int().nonnegative(),
    transactions: z.number().int().nonnegative(),
    allocations: z.number().int().nonnegative(),
    balanceSnapshots: z.number().int().nonnegative(),
    reconciliations: z.number().int().nonnegative(),
    auditEvents: z.number().int().nonnegative(),
    importProvenance: z.number().int().nonnegative(),
    payoffScenarioReferences: z.number().int().nonnegative(),
    otherRelatedRecords: z.number().int().nonnegative(),
  })
  .strict();

export const scheduledPaymentStatusSchema = z.enum([
  'upcoming',
  'due_today',
  'past_due',
  'satisfied',
  'missing_due_day',
  'missing_schedule_start',
  'unsupported_frequency',
  'not_required',
]);

const scheduledPaymentDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    creditor: z.string(),
    dueDate: financialDateInputSchema.nullable(),
    priorDueDate: financialDateInputSchema.nullable(),
    nextDueDate: financialDateInputSchema.nullable(),
    status: scheduledPaymentStatusSchema,
    earliestPastDueDate: financialDateInputSchema.nullable(),
    reviewMessage: z.string().nullable(),
    schedulingStartDate: financialDateInputSchema.nullable().optional(),
    manualConfirmation: z
      .object({
        dueDate: financialDateInputSchema,
        reason: z.enum([
          'historical_payment_not_entered',
          'lender_treated_prior_payment_as_satisfying',
          'starting_schedule_after_historical_data',
          'other',
        ]),
        confirmedAtUtc: utcTimestampSchema,
      })
      .nullable()
      .optional(),
  })
  .strict();

export const refinanceEventDtoSchema = z
  .object({
    id: uuidSchema,
    debtId: uuidSchema,
    refinanceDate: financialDateInputSchema,
    preRefinancePrincipal: z.string(),
    lenderPayoffBalance: z.string().nullable(),
    newRefinancedPrincipal: z.string(),
    principalChange: z.string(),
    financedFees: z.string(),
    cashFees: z.string(),
    escrowHandling: refinanceEscrowHandlingSchema,
    escrowAmount: z.string().nullable(),
    priorTermId: uuidSchema,
    newTermId: uuidSchema,
    principalTransactionId: uuidSchema.nullable(),
    cashFeeTransactionId: uuidSchema.nullable(),
    escrowTransactionId: uuidSchema.nullable(),
    notes: z.string().nullable(),
    createdAtUtc: utcTimestampSchema,
    updatedAtUtc: utcTimestampSchema,
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
    paymentSchedule: scheduledPaymentDtoSchema,
    terms: z.array(debtTermDtoSchema).min(1),
    refinanceEvents: z.array(refinanceEventDtoSchema),
    permanentDeletionPreview: permanentDebtDeletionPreviewDtoSchema,
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

const dashboardCreditCardDetailDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    creditor: z.string(),
    currentBalance: z.string(),
    creditLimit: z.string().nullable(),
    availableCredit: z.string().nullable(),
    utilizationPercent: z.string().nullable(),
    reviewFlag: z.string().nullable(),
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
        creditCardBalances: z.string(),
        availableCredit: z.string(),
        creditUtilizationPercent: z.string().nullable(),
        creditCardOverLimit: z.string(),
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
        creditCardBalances: z.string(),
        availableCredit: z.string(),
        creditUtilizationPercent: z.string(),
        creditCardOverLimit: z.string(),
      })
      .strict(),
    creditCardPortfolio: z
      .object({
        details: z.array(dashboardCreditCardDetailDtoSchema),
        reviewItems: z.array(z.string()),
      })
      .strict(),
    upcomingPayments: z.array(scheduledPaymentDtoSchema),
    schedulingReviewItems: z.array(scheduledPaymentDtoSchema),
    upcomingMaturities: z.array(dashboardDebtMetricDtoSchema),
    escrowBalances: z.array(dashboardDebtMetricDtoSchema),
    attentionItems: z.array(dashboardAttentionItemDtoSchema),
    activeDebtCount: z.number().int().nonnegative(),
  })
  .strict();

const dataHealthReasonSchema = z
  .object({
    code: z.enum([
      'never_reconciled',
      'activity_since_reconciliation',
      'missing_due_day',
      'missing_schedule_start',
      'missing_credit_limit',
      'edited_or_voided_activity',
      'refinance_activity',
      'expected_payment_missing',
      'data_integrity',
      'stale_reconciliation',
      'reconciliation_exception',
    ]),
    label: z.string(),
  })
  .strict();
export const dataHealthRowDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    creditor: z.string(),
    debtType: z.enum(DEBT_TYPES),
    status: z.enum(['current', 'review', 'attention']),
    currentBalance: z.string(),
    effectiveDate: financialDateInputSchema,
    lastReconciliationDate: financialDateInputSchema.nullable(),
    daysSinceReconciliation: z.number().int().nonnegative().nullable(),
    activitySinceLastReconciliation: z.string(),
    reasons: z.array(dataHealthReasonSchema),
  })
  .strict();
export const dataHealthDtoSchema = z
  .object({
    effectiveDate: financialDateInputSchema,
    counts: z
      .object({
        current: z.number().int().nonnegative(),
        review: z.number().int().nonnegative(),
        attention: z.number().int().nonnegative(),
      })
      .strict(),
    rows: z.array(dataHealthRowDtoSchema),
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
    liveDatabaseDisplayPath: z.string().optional(),
    backupDirectoryDisplayPath: z.string(),
    exportDirectoryDisplayPath: z.string().optional(),
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
    refinanceDate: financialDateInputSchema.nullable(),
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

export const payoffMonthlyAllocationDtoSchema = z
  .object({
    month: financialDateInputSchema,
    debtId: uuidSchema.nullable(),
    debtName: z.string().nullable(),
    requiredPayment: z.string(),
    extraPayment: z.string(),
    totalPayment: z.string(),
    endingProjectedBalance: z.string(),
    totalProjectedBalance: z.string(),
    paidOffDebtName: z.string().nullable(),
    nextPriorityDebtName: z.string().nullable(),
  })
  .strict();

export const payoffOrderSummaryDtoSchema = z
  .object({
    debtId: uuidSchema,
    debtName: z.string(),
    priority: z.number().int().positive(),
    projectedPayoffDate: financialDateInputSchema.nullable(),
    monthsToPayoff: z.number().int().nullable(),
    projectedInterest: z.string().nullable(),
    interestSaved: z.string().nullable(),
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
    monthlySchedule: z.array(payoffMonthlyAllocationDtoSchema),
    payoffOrder: z.array(payoffOrderSummaryDtoSchema),
    monthsSaved: z.number().int().nullable(),
    warnings: z.array(z.string()),
  })
  .strict();

export const extraCashAllocationResultDtoSchema = z
  .object({
    strategy: extraCashStrategySchema,
    status: z.enum(['reliable', 'partial', 'not_configured']),
    configurationMessage: z.string().nullable(),
    strategyName: z.string(),
    initialDebtName: z.string().nullable(),
    lumpSumApplied: z.string().nullable(),
    unusedLumpSum: z.string().nullable(),
    extraMonthlyPayment: z.string(),
    projectedPayoffDate: financialDateInputSchema.nullable(),
    projectionHorizonDate: financialDateInputSchema.nullable(),
    projectionHorizonMonths: z.number().int().positive().nullable(),
    incompleteDebtNames: z.array(z.string()),
    monthsSaved: z.number().int().nullable(),
    projectedTotalInterest: z.string().nullable(),
    directInterestSaved: z.string().nullable(),
    rolloverInterestSaved: z.string().nullable(),
    interestSaved: z.string().nullable(),
    totalProjectedCashPaid: z.string().nullable(),
    firstDebtName: z.string().nullable(),
    firstDebtPayoffDate: financialDateInputSchema.nullable(),
    finalDebtName: z.string().nullable(),
    includedDebtCount: z.number().int().nonnegative(),
    assumptions: z.array(z.string()),
    warnings: z.array(z.string()),
    debts: z.array(
      z
        .object({
          debtId: uuidSchema,
          debtName: z.string(),
          currentBalance: z.string(),
          rate: z.string(),
          lumpSumApplied: z.string(),
          requiredPaymentRolloverReceived: z.string(),
          baselineProjectedInterest: z.string().nullable(),
          extraMonthlyPaymentAllocation: z.string(),
          projectedPayoffDate: financialDateInputSchema.nullable(),
          monthsSaved: z.number().int().nullable(),
          projectedInterest: z.string().nullable(),
          interestSaved: z.string().nullable(),
          baselinePayoffDate: financialDateInputSchema.nullable(),
          priority: z.number().int().positive().nullable(),
        })
        .strict(),
    ),
    monthlySchedule: z.array(
      z
        .object({
          date: financialDateInputSchema,
          totalProjectedBalance: z.string(),
          debtName: z.string().nullable(),
          requiredPayment: z.string(),
          lumpSumApplied: z.string(),
          extraMonthlyPayment: z.string(),
          freedPaymentRollover: z.string(),
          totalPayment: z.string(),
          endingBalance: z.string(),
          interest: z.string(),
          payoffEvent: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const extraCashAllocationResponseSchema = z
  .object({
    analysisDate: financialDateInputSchema,
    baseline: extraCashAllocationResultDtoSchema,
    comparisons: z.array(extraCashAllocationResultDtoSchema),
    eligibleDebts: z.array(
      z
        .object({
          debtName: z.string(),
          included: z.boolean(),
          reason: z.string().nullable(),
        })
        .strict(),
    ),
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
    lumpSum: z.string(),
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

export const payoffBaselineDtoSchema = z
  .object({
    id: z.literal('generated-required-payments-baseline'),
    name: z.literal('Required payments only'),
    strategy: z.literal('baseline'),
    scenarioStartDate: financialDateInputSchema,
    extraMonthlyPayment: z.literal('0.00'),
    lumpSum: z.literal('0.00'),
    maxProjectionMonths: z.number().int().positive(),
    result: payoffScenarioResultDtoSchema,
    calculationEngineVersion: z.string(),
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

export const extraCashAllocationResultSchema = applicationResultSchema(
  extraCashAllocationResponseSchema,
);

export const debtSummaryListSchema = z.array(debtSummaryDtoSchema);
export const debtListResultSchema = applicationResultSchema(debtSummaryListSchema);
export const debtDetailResultSchema = applicationResultSchema(debtDetailDtoSchema);
export const permanentDebtDeletionDtoSchema = z
  .object({
    deletedDebtId: uuidSchema,
    deletedDebtName: z.string(),
    backupId: z.string(),
  })
  .strict();
export const permanentDebtDeletionResultSchema = applicationResultSchema(
  permanentDebtDeletionDtoSchema,
);
export const dashboardResultSchema = applicationResultSchema(dashboardDtoSchema);
export const dataHealthResultSchema = applicationResultSchema(dataHealthDtoSchema);
const milestoneBalancePointDtoSchema = z
  .object({
    date: financialDateInputSchema,
    totalPrincipalBalance: z.string(),
    mortgagePrincipalBalance: z.string(),
    nonmortgagePrincipalBalance: z.string(),
  })
  .strict();
const milestoneAnnualPointDtoSchema = z
  .object({ year: z.string(), amount: z.string() })
  .strict();
const milestoneScenarioPointDtoSchema = z
  .object({
    date: financialDateInputSchema,
    actualPrincipalBalance: z.string().nullable(),
    projectedPrincipalBalance: z.string().nullable(),
  })
  .strict();
export const milestonesDtoSchema = z
  .object({
    effectiveDate: financialDateInputSchema,
    trackingStartDate: financialDateInputSchema,
    totalDebtReducedSinceTracking: z.string(),
    debtReducedYtd: z.string(),
    startingDebt: z.string(),
    currentDebt: z.string(),
    percentageStartingDebtRemaining: z.string(),
    mortgageDebtReduced: z.string(),
    nonmortgageDebtReduced: z.string(),
    nextProjectedDebtPayoff: z
      .object({
        debtId: uuidSchema,
        debtName: z.string(),
        projectedPayoffDate: financialDateInputSchema,
      })
      .strict()
      .nullable(),
    nextDebtReductionMilestone: z.string(),
    nextDebtReductionMilestoneDate: financialDateInputSchema.nullable(),
    interestPaidYtd: z.string(),
    interestSavedFromSelectedScenario: z.string().nullable(),
    currentCreditUtilization: z.string().nullable(),
    priorYearCreditUtilization: z.string().nullable(),
    creditUtilizationChange: z.string().nullable(),
    selectedScenario: z
      .object({ id: uuidSchema, name: z.string() })
      .strict()
      .nullable(),
    balanceHistory: z.array(milestoneBalancePointDtoSchema),
    annualPrincipalReduction: z.array(milestoneAnnualPointDtoSchema),
    annualInterestPaid: z.array(milestoneAnnualPointDtoSchema),
    scenarioComparison: z.array(milestoneScenarioPointDtoSchema),
  })
  .strict();
export const dataManagementStatusResultSchema = applicationResultSchema(
  dataManagementStatusDtoSchema,
);
export const dataExportResultSchema = applicationResultSchema(dataExportDtoSchema);
export const debtReportsResultSchema = applicationResultSchema(debtReportsDtoSchema);
export const milestonesResultSchema = applicationResultSchema(milestonesDtoSchema);
export const payoffScenarioResultSchema = applicationResultSchema(
  payoffScenarioDtoSchema,
);
export const payoffBaselineResultSchema = applicationResultSchema(
  payoffBaselineDtoSchema,
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
export type GetDataHealthRequest = z.infer<typeof getDataHealthRequestSchema>;
export type GetMilestonesRequest = z.infer<typeof getMilestonesRequestSchema>;
export type AcceptCurrentBalanceRequest = z.infer<
  typeof acceptCurrentBalanceRequestSchema
>;
export type GetDataManagementStatusRequest = z.infer<
  typeof getDataManagementStatusRequestSchema
>;
export type CreateManualBackupRequest = z.infer<typeof createManualBackupRequestSchema>;
export type RestoreBackupRequest = z.infer<typeof restoreBackupRequestSchema>;
export type DeleteBackupRequest = z.infer<typeof deleteBackupRequestSchema>;
export type ExportDataRequest = z.infer<typeof exportDataRequestSchema>;
export type SetDataLocationsRequest = z.infer<typeof setDataLocationsRequestSchema>;
export type ChooseDataFolderRequest = z.infer<typeof chooseDataFolderRequestSchema>;
export type ChooseBackupFileRequest = z.infer<typeof chooseBackupFileRequestSchema>;
export type ImportBackupFileRequest = z.infer<typeof importBackupFileRequestSchema>;
export type GetDebtReportsRequest = z.infer<typeof getDebtReportsRequestSchema>;
export type CreatePayoffScenarioRequest = z.infer<
  typeof createPayoffScenarioRequestSchema
>;
export type ExtraCashAllocationRequest = z.infer<
  typeof extraCashAllocationRequestSchema
>;
export type ListPayoffScenariosRequest = z.infer<
  typeof listPayoffScenariosRequestSchema
>;
export type CalculatePayoffBaselineRequest = z.infer<
  typeof calculatePayoffBaselineRequestSchema
>;
export type GetPayoffScenarioRequest = z.infer<typeof getPayoffScenarioRequestSchema>;
export type RerunPayoffScenarioRequest = z.infer<
  typeof rerunPayoffScenarioRequestSchema
>;
export type ArchivePayoffScenarioRequest = z.infer<
  typeof archivePayoffScenarioRequestSchema
>;
export type RenamePayoffScenarioRequest = z.infer<
  typeof renamePayoffScenarioRequestSchema
>;
export type GetDebtRequest = z.infer<typeof getDebtRequestSchema>;
export type ArchiveDebtRequest = z.infer<typeof archiveDebtRequestSchema>;
export type RestoreDebtRequest = z.infer<typeof restoreDebtRequestSchema>;
export type RecordRefinanceRequest = z.infer<typeof recordRefinanceRequestSchema>;
export type DeleteDebtPermanentlyRequest = z.infer<
  typeof deleteDebtPermanentlyRequestSchema
>;
export type ConfirmScheduledPaymentRequest = z.infer<
  typeof confirmScheduledPaymentRequestSchema
>;
export type RemoveScheduledPaymentConfirmationRequest = z.infer<
  typeof removeScheduledPaymentConfirmationRequestSchema
>;
export type DebtTermDto = z.infer<typeof debtTermDtoSchema>;
export type TransactionAllocationDto = z.infer<typeof transactionAllocationDtoSchema>;
export type DebtTransactionDto = z.infer<typeof debtTransactionDtoSchema>;
export type BalanceSnapshotDto = z.infer<typeof balanceSnapshotDtoSchema>;
export type BalanceReconciliationDto = z.infer<typeof balanceReconciliationDtoSchema>;
export type DebtSummaryDto = z.infer<typeof debtSummaryDtoSchema>;
export type DebtDetailDto = z.infer<typeof debtDetailDtoSchema>;
export type ScheduledPaymentDto = z.infer<typeof scheduledPaymentDtoSchema>;
export type PermanentDebtDeletionDto = z.infer<typeof permanentDebtDeletionDtoSchema>;
export type RefinanceEventDto = z.infer<typeof refinanceEventDtoSchema>;
export type DashboardDto = z.infer<typeof dashboardDtoSchema>;
export type DataHealthDto = z.infer<typeof dataHealthDtoSchema>;
export type MilestonesDto = z.infer<typeof milestonesDtoSchema>;
export type DataManagementStatusDto = z.infer<typeof dataManagementStatusDtoSchema>;
export type DataExportDto = z.infer<typeof dataExportDtoSchema>;
export type DebtReportsDto = z.infer<typeof debtReportsDtoSchema>;
export type AppMetadataDto = z.infer<typeof appMetadataDtoSchema>;
export type PayoffScenarioDto = z.infer<typeof payoffScenarioDtoSchema>;
export type PayoffBaselineDto = z.infer<typeof payoffBaselineDtoSchema>;
export type PayoffScenarioResultDto = z.infer<typeof payoffScenarioResultDtoSchema>;
export type ExtraCashAllocationResponse = z.infer<
  typeof extraCashAllocationResponseSchema
>;
export type ApplicationError = z.infer<typeof applicationErrorSchema>;
export type ApplicationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApplicationError };
