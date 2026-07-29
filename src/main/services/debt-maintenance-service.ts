import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type {
  AddDebtTermRequest,
  ArchivePayoffScenarioRequest,
  CreateBalanceReconciliationRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  ArchiveDebtRequest,
  CreateDebtRequest,
  CreatePayoffScenarioRequest,
  DashboardDto,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  GetDashboardRequest,
  GetDebtReportsRequest,
  GetDebtRequest,
  GetImportBatchRequest,
  GetPayoffScenarioRequest,
  ImportBatchDto,
  ImportBatchSummaryDto,
  ImportPostingPreviewDto,
  ImportPostingResultDto,
  ListDebtsRequest,
  ListPayoffScenariosRequest,
  PayoffScenarioDto,
  PostImportBatchRequest,
  PreviewImportBatchPostingRequest,
  RerunPayoffScenarioRequest,
  ReverseDebtTransactionRequest,
  RestoreDebtRequest,
  SelectWorkbookForImportRequest,
  UpdateImportSheetMappingRequest,
  UpdateStagedImportRowReviewRequest,
  UpdateDebtRequest,
  VoidBalanceReconciliationRequest,
} from '../../shared/debt-contracts';
import {
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  archivePayoffScenarioRequestSchema,
  createBalanceReconciliationRequestSchema,
  createBalanceSnapshotRequestSchema,
  createDebtTransactionRequestSchema,
  createDebtRequestSchema,
  createPayoffScenarioRequestSchema,
  getDashboardRequestSchema,
  getDebtReportsRequestSchema,
  getDebtRequestSchema,
  getImportBatchRequestSchema,
  getPayoffScenarioRequestSchema,
  listImportBatchesRequestSchema,
  listPayoffScenariosRequestSchema,
  listDebtsRequestSchema,
  rerunPayoffScenarioRequestSchema,
  reverseDebtTransactionRequestSchema,
  restoreDebtRequestSchema,
  selectWorkbookForImportRequestSchema,
  updateImportSheetMappingRequestSchema,
  updateStagedImportRowReviewRequestSchema,
  postImportBatchRequestSchema,
  previewImportBatchPostingRequestSchema,
  updateDebtRequestSchema,
  voidBalanceReconciliationRequestSchema,
} from '../../shared/debt-contracts';
import {
  ALLOCATION_TYPES,
  DAY_COUNT_CONVENTIONS,
  DEBT_STATUSES,
  DEBT_TYPES,
  INTEREST_CALCULATION_CONVENTIONS,
  INTEREST_RATE_TYPES,
  PAYMENT_FREQUENCIES,
  POSTED_ACTIVITY_TRANSACTION_TYPES,
  TAX_CATEGORIES,
} from '../../shared/debt-options';
import type { AppDatabase } from '../database/connection';
import {
  calculateEscrowBalanceThroughDate,
  calculateLedgerBalanceThroughDate,
  createPayoffScenarioRecord,
  createBalanceReconciliationRecord,
  createBalanceSnapshotRecord,
  createImportBatchRecord,
  createPostedTransactionRecord,
  appendDebtTermRecord,
  getDebtActivityRecord,
  getDebtTransactionRecord,
  getImportBatchRecord,
  getPayoffScenarioRecord,
  createDebtAndInitialTerm,
  listImportBatchRecords,
  listActiveDebtActivityRecords,
  listDebtActivityRecords,
  listDebtRecords,
  listPayoffScenarioRecords,
  postImportBatchRecord,
  RepositoryConflictError,
  RepositoryNotFoundError,
  setDebtArchivedState,
  updatePayoffScenarioArchiveState,
  updatePayoffScenarioResultRecord,
  updateImportSheetMappingReview,
  updateStagedImportRowReview,
  updateDebtDescriptiveRecord,
  voidBalanceReconciliationRecord,
  type DebtRecord,
  type BalanceReconciliationRecord,
  type DebtTransactionWithAllocationsRecord,
  type DebtTermRecord,
  type DebtWithTermsRecord,
  type DebtWithActivityRecord,
  type ImportBatchRecord,
  type ImportBatchWithRowsRecord,
  type ImportPostingRecord,
  type ImportSheetMappingRecord,
  type PayoffScenarioRecord,
  type StagedImportRowRecord,
} from '../database/debt-maintenance-repository';
import { reversePostedTransaction } from '../database/repository';
import type {
  AuditEventInsert,
  BalanceReconciliationInput,
  BalanceSnapshotInsert,
  DebtInsert,
  DebtTermInsert,
  DebtTransactionInsert,
  ImportPostingInsert,
  ImportSheetMappingInsert,
  PayoffScenarioInsert,
  StagedImportRowInsert,
  TransactionAllocationInsert,
} from '../database/validation';
import {
  currencyInputToCents,
  percentageInputToBasisPoints,
  percentageInputToRateMicros,
  previousFinancialDate,
  signedCurrencyInputToCents,
} from '../domain/accounting/entry-input';
import {
  assertFinancialDate,
  currentUtcTimestamp,
} from '../domain/accounting/financial-date';
import {
  basisPointsToPercentString,
  rateMicrosToPercentString,
} from '../domain/accounting/interest-rate';
import { centsToDollars } from '../domain/accounting/money';
import {
  PAYOFF_ENGINE_VERSION,
  projectPayoffScenario,
  type PayoffAssumptions,
  type PayoffDebtInput,
  type PayoffProjectionResult,
} from '../domain/accounting/payoff-engine';
import { validateTransactionSignConvention } from '../domain/accounting/transaction-validation';
import { ApplicationServiceError } from './application-error';
import { parseWorkbookForImport } from './workbook-import-parser';

export interface DebtMaintenanceService {
  listDebts(request: ListDebtsRequest): readonly DebtSummaryDto[];
  getDashboard(request: GetDashboardRequest): DashboardDto;
  getDebtReports(request: GetDebtReportsRequest): DebtReportsDto;
  selectWorkbookForImport(
    request: SelectWorkbookForImportRequest,
  ): ImportBatchDto | null;
  listImportBatches(): readonly ImportBatchSummaryDto[];
  getImportBatch(request: GetImportBatchRequest): ImportBatchDto;
  updateImportSheetMapping(request: UpdateImportSheetMappingRequest): ImportBatchDto;
  updateStagedImportRowReview(
    request: UpdateStagedImportRowReviewRequest,
  ): ImportBatchDto;
  previewImportBatchPosting(
    request: PreviewImportBatchPostingRequest,
  ): ImportPostingPreviewDto;
  postImportBatch(request: PostImportBatchRequest): ImportPostingResultDto;
  listPayoffScenarios(
    request: ListPayoffScenariosRequest,
  ): readonly PayoffScenarioDto[];
  getPayoffScenario(request: GetPayoffScenarioRequest): PayoffScenarioDto;
  createPayoffScenario(request: CreatePayoffScenarioRequest): PayoffScenarioDto;
  rerunPayoffScenario(request: RerunPayoffScenarioRequest): PayoffScenarioDto;
  archivePayoffScenario(request: ArchivePayoffScenarioRequest): PayoffScenarioDto;
  getDebt(request: GetDebtRequest): DebtDetailDto;
  createDebt(request: CreateDebtRequest): DebtDetailDto;
  updateDebt(request: UpdateDebtRequest): DebtDetailDto;
  addDebtTerm(request: AddDebtTermRequest): DebtDetailDto;
  createDebtTransaction(request: CreateDebtTransactionRequest): DebtDetailDto;
  reverseDebtTransaction(request: ReverseDebtTransactionRequest): DebtDetailDto;
  createBalanceSnapshot(request: CreateBalanceSnapshotRequest): DebtDetailDto;
  createBalanceReconciliation(
    request: CreateBalanceReconciliationRequest,
  ): DebtDetailDto;
  voidBalanceReconciliation(request: VoidBalanceReconciliationRequest): DebtDetailDto;
  archiveDebt(request: ArchiveDebtRequest): DebtDetailDto;
  restoreDebt(request: RestoreDebtRequest): DebtDetailDto;
}

export interface DebtMaintenanceServiceDependencies {
  readonly database: AppDatabase;
  readonly createId?: () => string;
  readonly now?: () => string;
  readonly selectWorkbookPath?: () => string | null;
}

const nullableText = (value: string | null): string | null => {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
};

const toFieldError = (field: string, error: unknown): never => {
  const message = error instanceof Error ? error.message : 'Value is invalid.';
  throw new ApplicationServiceError('validation', 'Review the highlighted fields.', {
    [field]: [message],
  });
};

const convertMoney = (field: string, value: string): number => {
  try {
    return currencyInputToCents(value);
  } catch (error) {
    return toFieldError(field, error);
  }
};

const convertSignedMoney = (field: string, value: string): number => {
  try {
    return signedCurrencyInputToCents(value);
  } catch (error) {
    return toFieldError(field, error);
  }
};

const manualTransactionDirection = (
  transactionType: CreateDebtTransactionRequest['transaction']['transactionType'],
): 1 | -1 => (transactionType === 'payment' ? -1 : 1);

const convertManualTransactionAmount = (
  field: string,
  value: string,
  direction: 1 | -1,
): number => convertMoney(field, value) * direction;

const convertRate = (field: string, value: string): number => {
  try {
    return percentageInputToRateMicros(value);
  } catch (error) {
    return toFieldError(field, error);
  }
};

const convertPercentage = (field: string, value: string): number => {
  try {
    const basisPoints = percentageInputToBasisPoints(value);

    if (basisPoints > 10_000) {
      throw new RangeError('Percentage must be between 0 and 100.');
    }

    return basisPoints;
  } catch (error) {
    return toFieldError(field, error);
  }
};

const ensureCalendarDate = (field: string, value: string): string => {
  try {
    return assertFinancialDate(value);
  } catch (error) {
    return toFieldError(field, error);
  }
};

const ensureNotBefore = (field: string, value: string, minimum: string): string => {
  if (value < minimum) {
    return toFieldError(
      field,
      new RangeError('Date cannot precede the debt origination date.'),
    );
  }

  return value;
};

const nextTimestamp = (now: () => string, previous?: string): string => {
  const candidate = currentUtcTimestampSchema(now());

  if (!previous || candidate > previous) {
    return candidate;
  }

  return new Date(Date.parse(previous) + 1).toISOString();
};

const currentUtcTimestampSchema = (value: string): string => {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new ApplicationServiceError(
      'internal',
      'The system clock returned an invalid timestamp.',
    );
  }

  return value;
};

const validateCreditLimit = (
  debtType: DebtRecord['debtType'],
  creditLimit: string | null,
): number | null => {
  const normalized = nullableText(creditLimit);

  if ((debtType === 'heloc' || debtType === 'credit_card') && !normalized) {
    throw new ApplicationServiceError('validation', 'A credit limit is required.', {
      'debt.creditLimit': [
        'Credit limit is required for HELOC and credit-card obligations.',
      ],
    });
  }

  return normalized ? convertMoney('debt.creditLimit', normalized) : null;
};

const createAudit = (
  id: string,
  entityType: string,
  entityId: string,
  eventType: string,
  action: string,
  timestamp: string,
  summary: string,
  changedFields?: readonly string[],
): AuditEventInsert => ({
  id,
  eventType,
  entityType,
  entityId,
  action,
  occurredAtUtc: timestamp,
  source: 'user',
  summary,
  beforeMetadataJson: null,
  afterMetadataJson: changedFields ? JSON.stringify({ changedFields }) : null,
});

const createDebtAudit = (
  id: string,
  debtId: string,
  eventType: string,
  action: string,
  timestamp: string,
  summary: string,
  changedFields?: readonly string[],
): AuditEventInsert =>
  createAudit(id, 'debt', debtId, eventType, action, timestamp, summary, changedFields);

const createTransactionAudit = (
  id: string,
  transactionId: string,
  eventType: string,
  action: string,
  timestamp: string,
  summary: string,
  afterMetadata?: Record<string, unknown>,
): AuditEventInsert => ({
  id,
  eventType,
  entityType: 'debt_transaction',
  entityId: transactionId,
  action,
  occurredAtUtc: timestamp,
  source: 'user',
  summary,
  beforeMetadataJson: null,
  afterMetadataJson: afterMetadata ? JSON.stringify(afterMetadata) : null,
});

const createSnapshotAudit = (
  id: string,
  snapshotId: string,
  eventType: string,
  action: string,
  timestamp: string,
  summary: string,
  afterMetadata?: Record<string, unknown>,
): AuditEventInsert => ({
  id,
  eventType,
  entityType: 'balance_snapshot',
  entityId: snapshotId,
  action,
  occurredAtUtc: timestamp,
  source: 'user',
  summary,
  beforeMetadataJson: null,
  afterMetadataJson: afterMetadata ? JSON.stringify(afterMetadata) : null,
});

const createReconciliationAudit = (
  id: string,
  reconciliationId: string,
  eventType: string,
  action: string,
  timestamp: string,
  summary: string,
  afterMetadata?: Record<string, unknown>,
): AuditEventInsert => ({
  id,
  eventType,
  entityType: 'balance_reconciliation',
  entityId: reconciliationId,
  action,
  occurredAtUtc: timestamp,
  source: 'user',
  summary,
  beforeMetadataJson: null,
  afterMetadataJson: afterMetadata ? JSON.stringify(afterMetadata) : null,
});

const createImportAudit = (
  id: string,
  entityId: string,
  eventType: string,
  action: string,
  timestamp: string,
  summary: string,
  afterMetadata?: Record<string, unknown>,
): AuditEventInsert => ({
  id,
  eventType,
  entityType: 'import_batch',
  entityId,
  action,
  occurredAtUtc: timestamp,
  source: 'import',
  summary,
  beforeMetadataJson: null,
  afterMetadataJson: afterMetadata ? JSON.stringify(afterMetadata) : null,
});

const createPayoffScenarioAudit = (
  id: string,
  scenarioId: string,
  eventType: string,
  action: string,
  timestamp: string,
  summary: string,
  afterMetadata?: Record<string, unknown>,
): AuditEventInsert => ({
  id,
  eventType,
  entityType: 'payoff_scenario',
  entityId: scenarioId,
  action,
  occurredAtUtc: timestamp,
  source: 'user',
  summary,
  beforeMetadataJson: null,
  afterMetadataJson: afterMetadata ? JSON.stringify(afterMetadata) : null,
});

const allocationInputs = (
  allocations: CreateDebtTransactionRequest['transaction']['allocations'],
) =>
  [
    ['principal', allocations.principal],
    ['interest', allocations.interest],
    ['escrow', allocations.escrow],
    ['fee', allocations.fee],
    ['penalty', allocations.penalty],
    ['extra_principal', allocations.extraPrincipal],
    ['other', allocations.other],
  ] as const;

const buildAllocations = (
  createId: () => string,
  transactionId: string,
  timestamp: string,
  fieldPrefix: string,
  allocationsInput: CreateDebtTransactionRequest['transaction']['allocations'],
): TransactionAllocationInsert[] => {
  const allocations: TransactionAllocationInsert[] = [];

  for (const [allocationType, amount] of allocationInputs(allocationsInput)) {
    if (amount == null || amount.trim() === '') {
      continue;
    }

    const formField = `${fieldPrefix}.${allocationType === 'extra_principal' ? 'extraPrincipal' : allocationType}`;
    const amountCents = convertSignedMoney(formField, amount);

    if (amountCents === 0) {
      throw new ApplicationServiceError(
        'validation',
        'Review the highlighted fields.',
        {
          [formField]: ['Allocation amount must be nonzero.'],
        },
      );
    }

    allocations.push({
      id: createId(),
      transactionId,
      allocationType,
      amountCents,
      notes: null,
      createdAtUtc: timestamp,
      updatedAtUtc: timestamp,
    });
  }

  if (allocations.length === 0) {
    throw new ApplicationServiceError('validation', 'Review the highlighted fields.', {
      [fieldPrefix]: ['Enter at least one allocation amount.'],
    });
  }

  return allocations;
};

const buildManualTransactionAllocations = (
  createId: () => string,
  transactionId: string,
  timestamp: string,
  fieldPrefix: string,
  allocationsInput: CreateDebtTransactionRequest['transaction']['allocations'],
  direction: 1 | -1,
): TransactionAllocationInsert[] => {
  const allocations: TransactionAllocationInsert[] = [];

  for (const [allocationType, amount] of allocationInputs(allocationsInput)) {
    if (amount == null || amount.trim() === '') {
      continue;
    }

    const formField = `${fieldPrefix}.${allocationType === 'extra_principal' ? 'extraPrincipal' : allocationType}`;
    const amountCents = convertManualTransactionAmount(formField, amount, direction);

    if (amountCents === 0) {
      throw new ApplicationServiceError(
        'validation',
        'Review the highlighted fields.',
        {
          [formField]: ['Allocation amount must be nonzero.'],
        },
      );
    }

    allocations.push({
      id: createId(),
      transactionId,
      allocationType,
      amountCents,
      notes: null,
      createdAtUtc: timestamp,
      updatedAtUtc: timestamp,
    });
  }

  if (allocations.length === 0) {
    throw new ApplicationServiceError('validation', 'Review the highlighted fields.', {
      [`${fieldPrefix}.principal`]: [
        'Enter at least one allocation amount for this transaction.',
      ],
    });
  }

  return allocations;
};

const mapTransactionAllocation = (
  allocation: DebtTransactionWithAllocationsRecord['allocations'][number],
): DebtDetailDto['transactions'][number]['allocations'][number] => ({
  id: allocation.id,
  allocationType: allocation.allocationType,
  amount: centsToDollars(allocation.amountCents),
  notes: allocation.notes,
  createdAtUtc: allocation.createdAtUtc,
  updatedAtUtc: allocation.updatedAtUtc,
});

const mapTransaction = (
  record: DebtTransactionWithAllocationsRecord,
): DebtDetailDto['transactions'][number] => ({
  id: record.transaction.id,
  debtId: record.transaction.debtId,
  transactionType: record.transaction.transactionType,
  effectiveDate: record.transaction.effectiveDate,
  postingDate: record.transaction.postingDate,
  totalAmount: centsToDollars(record.transaction.totalAmountCents),
  status: record.transaction.status,
  description: record.transaction.description,
  sourceType: record.transaction.sourceType,
  sourceReference: record.transaction.sourceReference,
  reversalOfTransactionId: record.transaction.reversalOfTransactionId,
  supersedesTransactionId: record.transaction.supersedesTransactionId,
  allocations: record.allocations.map(mapTransactionAllocation),
  createdAtUtc: record.transaction.createdAtUtc,
  updatedAtUtc: record.transaction.updatedAtUtc,
});

const mapBalanceSnapshot = (
  snapshot: DebtWithActivityRecord['balanceSnapshots'][number],
): DebtDetailDto['balanceSnapshots'][number] => ({
  id: snapshot.id,
  debtId: snapshot.debtId,
  effectiveDate: snapshot.effectiveDate,
  confirmedBalance: centsToDollars(snapshot.confirmedBalanceCents),
  sourceType: snapshot.sourceType,
  sourceReference: snapshot.sourceReference,
  notes: snapshot.notes,
  createdAtUtc: snapshot.createdAtUtc,
  updatedAtUtc: snapshot.updatedAtUtc,
});

const mapBalanceReconciliation = (
  reconciliation: BalanceReconciliationRecord,
): DebtDetailDto['balanceReconciliations'][number] => ({
  id: reconciliation.id,
  debtId: reconciliation.debtId,
  statementDate: reconciliation.statementDate,
  statementEndingBalance: centsToDollars(reconciliation.statementEndingBalanceCents),
  applicationCalculatedBalance: centsToDollars(
    reconciliation.applicationCalculatedBalanceCents,
  ),
  calculatedDifference: centsToDollars(reconciliation.calculatedDifferenceCents),
  reconciliationStatus: reconciliation.reconciliationStatus,
  lifecycleStatus: reconciliation.lifecycleStatus,
  supersedesReconciliationId: reconciliation.supersedesReconciliationId,
  supersededByReconciliationId: reconciliation.supersededByReconciliationId,
  voidedAtUtc: reconciliation.voidedAtUtc,
  supersededAtUtc: reconciliation.supersededAtUtc,
  explanation: reconciliation.explanation,
  approvedAdjustmentTransactionId: reconciliation.approvedAdjustmentTransactionId,
  sourceReference: reconciliation.sourceReference,
  supportingNotes: reconciliation.supportingNotes,
  createdAtUtc: reconciliation.createdAtUtc,
  updatedAtUtc: reconciliation.updatedAtUtc,
});

const calculateEscrowBalanceFromActivity = (record: DebtWithActivityRecord): number => {
  const transactionTypes = new Map(
    record.transactions.map((entry) => [
      entry.transaction.id,
      entry.transaction.transactionType,
    ]),
  );
  const escrowImpact = (
    transaction: DebtWithActivityRecord['transactions'][number]['transaction'],
    amountCents: number,
  ): number => {
    const effectiveTransactionType =
      transaction.transactionType === 'reversal' && transaction.reversalOfTransactionId
        ? (transactionTypes.get(transaction.reversalOfTransactionId) ??
          transaction.transactionType)
        : transaction.transactionType;

    if (
      effectiveTransactionType === 'payment' ||
      effectiveTransactionType === 'escrow_disbursement' ||
      effectiveTransactionType === 'escrow_refund'
    ) {
      return -amountCents;
    }

    return amountCents;
  };

  const balance = record.transactions.reduce((total, entry) => {
    if (entry.transaction.status === 'superseded') return total;

    return (
      total +
      entry.allocations
        .filter((allocation) => allocation.allocationType === 'escrow')
        .reduce(
          (allocationTotal, allocation) =>
            allocationTotal + escrowImpact(entry.transaction, allocation.amountCents),
          0,
        )
    );
  }, 0);

  if (!Number.isSafeInteger(balance)) {
    throw new ApplicationServiceError(
      'internal',
      'Calculated escrow balance exceeds the safe-integer range.',
    );
  }

  return balance;
};

interface ReversalIntegrityIssue {
  readonly debtId: string;
  readonly debtName: string;
  readonly creditor: string;
  readonly originalTransactionId: string | null;
  readonly reversalTransactionId: string;
  readonly effectiveDate: string;
  readonly unmatchedTotalCents: number;
  readonly unmatchedAllocations: readonly {
    readonly allocationType: string;
    readonly amountCents: number;
  }[];
}

const formatAllocationType = (allocationType: string): string =>
  allocationType.replaceAll('_', ' ');

const summarizeReversalIssue = (issue: ReversalIntegrityIssue): string => {
  const allocationSummary =
    issue.unmatchedAllocations.length === 0
      ? 'no allocation detail'
      : issue.unmatchedAllocations
          .map(
            (allocation) =>
              `${formatAllocationType(allocation.allocationType)} ${centsToDollars(allocation.amountCents)}`,
          )
          .join(', ');

  return `Malformed reversal detected; original and reversal activity do not fully offset (${allocationSummary}; total ${centsToDollars(issue.unmatchedTotalCents)}). Calculated debt, escrow, and YTD amounts for this obligation require review.`;
};

const findMalformedReversalIssues = (
  record: DebtWithActivityRecord,
): readonly ReversalIntegrityIssue[] => {
  const transactionsById = new Map(
    record.transactions.map((entry) => [entry.transaction.id, entry]),
  );
  const issues: ReversalIntegrityIssue[] = [];

  for (const reversalEntry of record.transactions) {
    const { transaction: reversal } = reversalEntry;

    if (
      reversal.transactionType !== 'reversal' ||
      reversal.status === 'superseded' ||
      !reversal.reversalOfTransactionId
    ) {
      continue;
    }

    const originalEntry = transactionsById.get(reversal.reversalOfTransactionId);

    if (!originalEntry) {
      issues.push({
        debtId: record.debt.id,
        debtName: record.debt.name,
        creditor: record.debt.creditor,
        originalTransactionId: reversal.reversalOfTransactionId,
        reversalTransactionId: reversal.id,
        effectiveDate: reversal.effectiveDate,
        unmatchedTotalCents: reversal.totalAmountCents,
        unmatchedAllocations: reversalEntry.allocations.map((allocation) => ({
          allocationType: allocation.allocationType,
          amountCents: allocation.amountCents,
        })),
      });
      continue;
    }

    const unmatchedAllocations = ALLOCATION_TYPES.map((allocationType) => {
      const originalAmount = originalEntry.allocations
        .filter((allocation) => allocation.allocationType === allocationType)
        .reduce((total, allocation) => total + allocation.amountCents, 0);
      const reversalAmount = reversalEntry.allocations
        .filter((allocation) => allocation.allocationType === allocationType)
        .reduce((total, allocation) => total + allocation.amountCents, 0);

      return {
        allocationType,
        amountCents: originalAmount + reversalAmount,
      };
    }).filter((allocation) => allocation.amountCents !== 0);
    const unmatchedTotalCents =
      originalEntry.transaction.totalAmountCents + reversal.totalAmountCents;

    if (unmatchedTotalCents !== 0 || unmatchedAllocations.length > 0) {
      issues.push({
        debtId: record.debt.id,
        debtName: record.debt.name,
        creditor: record.debt.creditor,
        originalTransactionId: originalEntry.transaction.id,
        reversalTransactionId: reversal.id,
        effectiveDate: reversal.effectiveDate,
        unmatchedTotalCents,
        unmatchedAllocations,
      });
    }
  }

  return issues;
};

const postedTransactionFieldErrors = (
  errors: readonly string[],
): Readonly<Record<string, readonly string[]>> => {
  const fieldErrors: Record<string, string[]> = {};

  for (const error of errors) {
    if (
      error === 'Transaction total must be nonzero safe-integer cents.' ||
      error === 'Payments must have a negative transaction total.' ||
      error.endsWith('transactions must have a positive total.')
    ) {
      (fieldErrors['transaction.totalAmount'] ??= []).push(error);
      continue;
    }

    if (
      error === 'Allocation signs must match the transaction total sign.' ||
      error === 'Transaction allocations must equal the transaction total.'
    ) {
      (fieldErrors['transaction.allocations'] ??= []).push(error);
      continue;
    }

    if (error.includes('reversalOfTransactionId')) {
      (fieldErrors['transaction.transactionType'] ??= []).push(error);
      continue;
    }

    (fieldErrors.request ??= []).push(error);
  }

  return fieldErrors;
};

const reconciliationAdjustmentFieldErrors = (
  errors: readonly string[],
): Readonly<Record<string, readonly string[]>> => {
  const transactionErrors = postedTransactionFieldErrors(errors);
  const fieldErrors: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(transactionErrors)) {
    const reconciliationField =
      field === 'transaction.totalAmount'
        ? 'reconciliation.approvedAdjustment.totalAmount'
        : field === 'transaction.allocations'
          ? 'reconciliation.approvedAdjustment.allocations'
          : field;
    fieldErrors[reconciliationField] = [...messages];
  }

  return fieldErrors;
};

const mapTerm = (term: DebtTermRecord): DebtDetailDto['terms'][number] => ({
  id: term.id,
  effectiveStartDate: term.effectiveStartDate,
  effectiveEndDate: term.effectiveEndDate,
  interestRateType: term.interestRateType,
  annualInterestRatePercent: rateMicrosToPercentString(term.interestRateMicros),
  dayCountConvention: term.dayCountConvention,
  calculationConvention: term.calculationConvention,
  requiredPayment: centsToDollars(term.requiredPaymentCents),
  paymentFrequency: term.paymentFrequency,
  notes: term.notes,
  createdAtUtc: term.createdAtUtc,
  updatedAtUtc: term.updatedAtUtc,
});

const requireInitialTerm = (record: DebtWithTermsRecord): DebtTermRecord => {
  const initialTerm = record.terms[0];

  if (!initialTerm) {
    throw new ApplicationServiceError(
      'internal',
      'This debt is missing its required initial terms record.',
    );
  }

  return initialTerm;
};

const currentTermForDate = (
  terms: readonly DebtTermRecord[],
  effectiveDate: string,
): DebtTermRecord => {
  const currentTerm = terms.find(
    (term) =>
      term.effectiveStartDate <= effectiveDate &&
      (term.effectiveEndDate === null || term.effectiveEndDate >= effectiveDate),
  );

  if (currentTerm) return currentTerm;

  const priorTerms = terms.filter((term) => term.effectiveStartDate <= effectiveDate);
  const fallbackTerm = priorTerms.at(-1) ?? terms[0];

  if (!fallbackTerm) {
    throw new ApplicationServiceError(
      'internal',
      'This debt is missing its required initial terms record.',
    );
  }

  return fallbackTerm;
};

const mapSummary = (
  database: AppDatabase,
  record: DebtWithActivityRecord,
  effectiveDate: string,
): DebtSummaryDto => {
  const debt = record.debt;

  return {
    id: debt.id,
    name: debt.name,
    creditor: debt.creditor,
    ownerEntity: debt.ownerEntity,
    debtType: debt.debtType,
    status: debt.status,
    originalPrincipal: centsToDollars(debt.originalPrincipalCents),
    currentBalance: centsToDollars(
      calculateLedgerBalanceThroughDate(database, debt.id, effectiveDate),
    ),
    currentBalanceEffectiveDate: effectiveDate,
    calculatedEscrowBalance: centsToDollars(calculateEscrowBalanceFromActivity(record)),
    originationDate: debt.originationDate,
    maturityDate: debt.maturityDate,
    initialTerm: mapTerm(requireInitialTerm(record)),
    currentTerm: mapTerm(currentTermForDate(record.terms, effectiveDate)),
    archivedAtUtc: debt.archivedAtUtc,
  };
};

const mapDetail = (
  database: AppDatabase,
  record: DebtWithActivityRecord,
  effectiveDate: string,
): DebtDetailDto => {
  const debt = record.debt;

  requireInitialTerm(record);
  const currentTerm = currentTermForDate(record.terms, effectiveDate);

  return {
    id: debt.id,
    name: debt.name,
    creditor: debt.creditor,
    ownerEntity: debt.ownerEntity,
    debtType: debt.debtType,
    purpose: debt.purpose,
    status: debt.status,
    originalPrincipal: centsToDollars(debt.originalPrincipalCents),
    currentBalance: centsToDollars(
      calculateLedgerBalanceThroughDate(database, debt.id, effectiveDate),
    ),
    currentBalanceEffectiveDate: effectiveDate,
    originationDate: debt.originationDate,
    maturityDate: debt.maturityDate,
    minimumPayment: centsToDollars(debt.minimumPaymentCents),
    paymentFrequency: debt.paymentFrequency,
    creditLimit:
      debt.creditLimitCents === null ? null : centsToDollars(debt.creditLimitCents),
    collateralDescription: debt.collateralDescription,
    taxCategory: debt.taxCategory,
    deductiblePercentage: basisPointsToPercentString(debt.deductiblePercentageBps),
    notes: debt.notes,
    currentTerm: mapTerm(currentTerm),
    terms: record.terms.map(mapTerm),
    transactions: record.transactions.map(mapTransaction),
    balanceSnapshots: record.balanceSnapshots.map(mapBalanceSnapshot),
    balanceReconciliations: record.balanceReconciliations.map(mapBalanceReconciliation),
    calculatedEscrowBalance: centsToDollars(calculateEscrowBalanceFromActivity(record)),
    archivedAtUtc: debt.archivedAtUtc,
    createdAtUtc: debt.createdAtUtc,
    updatedAtUtc: debt.updatedAtUtc,
  };
};

const currentFinancialDate = (now: () => string): string =>
  currentUtcTimestampSchema(now()).slice(0, 10);

const yearStartDate = (effectiveDate: string): string =>
  `${effectiveDate.slice(0, 4)}-01-01`;

const addMonths = (financialDate: string, months: number): string => {
  const [yearText, monthText, dayText] = financialDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
};

const isWithinDateRange = (date: string, startDate: string, endDate: string): boolean =>
  date >= startDate && date <= endDate;

const roundRatio = (numerator: bigint, denominator: bigint): number => {
  if (denominator === 0n) return 0;

  const sign = numerator < 0n ? -1n : 1n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const rounded = (absoluteNumerator * 2n + denominator) / (denominator * 2n);
  return Number(rounded * sign);
};

const monthlyEquivalentCents = (
  requiredPaymentCents: number,
  paymentFrequency: DebtTermRecord['paymentFrequency'],
): number => {
  switch (paymentFrequency) {
    case 'weekly':
      return roundRatio(BigInt(requiredPaymentCents) * 52n, 12n);
    case 'biweekly':
      return roundRatio(BigInt(requiredPaymentCents) * 26n, 12n);
    case 'semimonthly':
      return requiredPaymentCents * 2;
    case 'monthly':
      return requiredPaymentCents;
    case 'quarterly':
      return roundRatio(BigInt(requiredPaymentCents), 3n);
    case 'annually':
      return roundRatio(BigInt(requiredPaymentCents), 12n);
    case 'irregular':
    case 'other':
      return 0;
  }
};

const postedActualTransactionsThrough = (
  record: DebtWithActivityRecord,
  startDate: string,
  endDate: string,
): readonly DebtTransactionWithAllocationsRecord[] =>
  record.transactions.filter(
    ({ transaction }) =>
      transaction.status !== 'superseded' &&
      isWithinDateRange(transaction.effectiveDate, startDate, endDate),
  );

const createDashboard = (
  database: AppDatabase,
  records: readonly DebtWithActivityRecord[],
  effectiveDate: string,
): DashboardDto => {
  const ytdStart = yearStartDate(effectiveDate);
  const upcomingMaturityEndDate = addMonths(effectiveDate, 12);
  let activeDebtCents = 0;
  let escrowBalanceCents = 0;
  let principalReductionYtdCents = 0;
  let newBorrowingsYtdCents = 0;
  let interestActivityYtdCents = 0;
  let requiredMonthlyPaymentsCents = 0;
  let weightedRateNumerator = 0n;
  let weightedRateDenominator = 0n;

  const upcomingMaturities: DashboardDto['upcomingMaturities'] = [];
  const escrowBalances: DashboardDto['escrowBalances'] = [];
  const attentionItems: DashboardDto['attentionItems'] = [];
  let hasDataIntegrityExceptions = false;

  for (const record of records) {
    const reversalIssues = findMalformedReversalIssues(record);
    hasDataIntegrityExceptions ||= reversalIssues.length > 0;
    const currentTerm = currentTermForDate(record.terms, effectiveDate);
    const ledgerBalanceCents = calculateLedgerBalanceThroughDate(
      database,
      record.debt.id,
      effectiveDate,
    );

    activeDebtCents += ledgerBalanceCents;
    const debtEscrowBalanceCents = calculateEscrowBalanceThroughDate(
      database,
      record.debt.id,
      effectiveDate,
    );
    escrowBalanceCents += debtEscrowBalanceCents;
    if (debtEscrowBalanceCents !== 0) {
      escrowBalances.push({
        debtId: record.debt.id,
        debtName: record.debt.name,
        creditor: record.debt.creditor,
        amount: centsToDollars(debtEscrowBalanceCents),
        effectiveDate,
        basis: `Application-calculated escrow balance from posted escrow allocations as of ${effectiveDate}; excluded from debt principal balance.`,
      });
    }
    requiredMonthlyPaymentsCents += monthlyEquivalentCents(
      currentTerm.requiredPaymentCents,
      currentTerm.paymentFrequency,
    );

    if (ledgerBalanceCents > 0) {
      weightedRateNumerator +=
        BigInt(ledgerBalanceCents) * BigInt(currentTerm.interestRateMicros);
      weightedRateDenominator += BigInt(ledgerBalanceCents);
    }

    const transactionTypes = new Map(
      record.transactions.map((entry) => [
        entry.transaction.id,
        entry.transaction.transactionType,
      ]),
    );

    for (const { transaction, allocations } of postedActualTransactionsThrough(
      record,
      ytdStart,
      effectiveDate,
    )) {
      const effectiveTransactionType =
        transaction.transactionType === 'reversal' &&
        transaction.reversalOfTransactionId
          ? (transactionTypes.get(transaction.reversalOfTransactionId) ??
            transaction.transactionType)
          : transaction.transactionType;

      if (effectiveTransactionType === 'borrowing_draw') {
        newBorrowingsYtdCents += transaction.totalAmountCents;
      }

      for (const allocation of allocations) {
        if (
          effectiveTransactionType === 'payment' &&
          (allocation.allocationType === 'principal' ||
            allocation.allocationType === 'extra_principal')
        ) {
          principalReductionYtdCents -= allocation.amountCents;
        }

        if (allocation.allocationType === 'interest') {
          interestActivityYtdCents += allocation.amountCents;
        }
      }
    }

    if (
      record.debt.maturityDate &&
      isWithinDateRange(
        record.debt.maturityDate,
        effectiveDate,
        upcomingMaturityEndDate,
      )
    ) {
      upcomingMaturities.push({
        debtId: record.debt.id,
        debtName: record.debt.name,
        creditor: record.debt.creditor,
        amount: centsToDollars(ledgerBalanceCents),
        effectiveDate: record.debt.maturityDate,
        basis: `Matures within 12 months of dashboard effective date ${effectiveDate}; amount is application-calculated ledger balance as of ${effectiveDate}.`,
      });
    }

    for (const reconciliation of record.balanceReconciliations) {
      if (
        reconciliation.lifecycleStatus === 'current' &&
        (reconciliation.reconciliationStatus === 'unreconciled' ||
          reconciliation.reconciliationStatus === 'in_progress' ||
          reconciliation.reconciliationStatus === 'exception')
      ) {
        attentionItems.push({
          debtId: record.debt.id,
          debtName: record.debt.name,
          creditor: record.debt.creditor,
          statementDate: reconciliation.statementDate,
          status: reconciliation.reconciliationStatus,
          difference: centsToDollars(reconciliation.calculatedDifferenceCents),
          sourceReference: reconciliation.sourceReference,
          basis:
            'Open reconciliation item; difference is statement ending balance less application-calculated ledger balance for the statement date.',
        });
      }
    }

    for (const issue of reversalIssues) {
      attentionItems.push({
        debtId: issue.debtId,
        debtName: issue.debtName,
        creditor: issue.creditor,
        statementDate: issue.effectiveDate,
        status: 'exception',
        difference: centsToDollars(issue.unmatchedTotalCents),
        sourceReference: issue.reversalTransactionId,
        basis: summarizeReversalIssue(issue),
      });
    }
  }

  upcomingMaturities.sort((left, right) =>
    left.effectiveDate.localeCompare(right.effectiveDate),
  );
  attentionItems.sort((left, right) =>
    right.statementDate.localeCompare(left.statementDate),
  );
  escrowBalances.sort((left, right) => right.amount.localeCompare(left.amount));

  const weightedAverageInterestRateMicros =
    weightedRateDenominator === 0n
      ? null
      : roundRatio(weightedRateNumerator, weightedRateDenominator);

  return {
    effectiveDate,
    yearToDateStartDate: ytdStart,
    activeDebtCount: records.length,
    totals: {
      activeDebt: centsToDollars(activeDebtCents),
      principalReductionYtd: centsToDollars(principalReductionYtdCents),
      newBorrowingsYtd: centsToDollars(newBorrowingsYtdCents),
      interestActivityYtd: centsToDollars(Math.abs(interestActivityYtdCents)),
      escrowBalance: centsToDollars(escrowBalanceCents),
      requiredMonthlyPayments: centsToDollars(requiredMonthlyPaymentsCents),
      weightedAverageInterestRate:
        weightedAverageInterestRateMicros === null
          ? null
          : rateMicrosToPercentString(weightedAverageInterestRateMicros),
    },
    metricBasis: {
      activeDebt: `Application-calculated ledger balances for active debts as of ${effectiveDate}; not confirmed snapshots or original principal.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected balances require review.' : ''}`,
      principalReductionYtd: `Net principal and extra-principal allocations from posted non-superseded activity dated ${ytdStart} through ${effectiveDate}.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected YTD amounts require review.' : ''}`,
      newBorrowingsYtd: `Posted non-superseded borrowing or draw transaction totals dated ${ytdStart} through ${effectiveDate}.`,
      interestActivityYtd: `Positive display of interest allocations from posted non-superseded activity dated ${ytdStart} through ${effectiveDate}; internal payment allocations are stored as negative values.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected YTD amounts require review.' : ''}`,
      escrowBalance: `Application-calculated escrow balances for active debts as of ${effectiveDate}; excluded from debt principal balance.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected escrow balances require review.' : ''}`,
      requiredMonthlyPayments: `Current effective debt terms as of ${effectiveDate}, normalized to monthly equivalents; irregular and other frequencies are excluded from the amount.`,
      weightedAverageInterestRate: `Current effective annual rates as of ${effectiveDate}, weighted by application-calculated ledger balances for active debts.`,
    },
    upcomingMaturities: upcomingMaturities.slice(0, 10),
    escrowBalances: escrowBalances.slice(0, 10),
    attentionItems: attentionItems.slice(0, 10),
  };
};

const mapPayoffResult = (
  result: PayoffProjectionResult,
): PayoffScenarioDto['result'] => ({
  calculationEngineVersion: result.calculationEngineVersion,
  scenarioStartDate: result.scenarioStartDate,
  projectedPayoffDate: result.projectedPayoffDate,
  totalProjectedInterest: centsToDollars(result.totalProjectedInterestCents),
  monthlyCashRequirement: centsToDollars(result.monthlyCashRequirementCents),
  baselineInterest: centsToDollars(result.baselineInterestCents),
  interestSavings: centsToDollars(result.interestSavingsCents),
  assumptions: [...result.assumptions],
  debts: result.debts.map((debt) => ({
    debtId: debt.debtId,
    debtName: debt.debtName,
    creditor: debt.creditor,
    startingBalance: centsToDollars(debt.startingBalanceCents),
    projectionStatus: debt.projectionStatus,
    projectedPayoffDate: debt.projectedPayoffDate,
    projectedInterest:
      debt.projectedInterestCents === null
        ? null
        : centsToDollars(debt.projectedInterestCents),
    requiredMonthlyPayment: centsToDollars(debt.requiredMonthlyPaymentCents),
    warnings: [...debt.warnings],
  })),
  warnings: [...result.warnings],
});

const parsePayoffAssumptions = (text: string): PayoffAssumptions => {
  const parsed = JSON.parse(text) as PayoffAssumptions;
  return parsed;
};

const parsePayoffResult = (text: string): PayoffProjectionResult => {
  const parsed = JSON.parse(text) as PayoffProjectionResult;
  return parsed;
};

const mapPayoffScenario = (record: PayoffScenarioRecord): PayoffScenarioDto => {
  const assumptions = parsePayoffAssumptions(record.assumptionsJson);
  return {
    id: record.id,
    name: record.name,
    strategy: record.strategy,
    status: record.status,
    scenarioStartDate: record.scenarioStartDate,
    extraMonthlyPayment: centsToDollars(record.extraMonthlyPaymentCents),
    customPriority: JSON.parse(record.customPriorityJson) as string[],
    variableRateOverrides: Object.fromEntries(
      Object.entries(assumptions.variableRateOverrides).map(([debtId, rateMicros]) => [
        debtId,
        rateMicrosToPercentString(rateMicros),
      ]),
    ),
    maxProjectionMonths: assumptions.maxProjectionMonths,
    result: mapPayoffResult(parsePayoffResult(record.resultJson)),
    calculationEngineVersion: record.calculationEngineVersion,
    createdAtUtc: record.createdAtUtc,
    updatedAtUtc: record.updatedAtUtc,
    archivedAtUtc: record.archivedAtUtc,
  };
};

const buildPayoffDebtInputs = (
  database: AppDatabase,
  scenarioStartDate: string,
): readonly PayoffDebtInput[] => {
  const records = listActiveDebtActivityRecords(database);
  const inputs = records
    .map((record): PayoffDebtInput => ({
      debtId: record.debt.id,
      debtName: record.debt.name,
      creditor: record.debt.creditor,
      debtType: record.debt.debtType,
      startingBalanceCents: calculateLedgerBalanceThroughDate(
        database,
        record.debt.id,
        scenarioStartDate,
      ),
      maturityDate: record.debt.maturityDate,
      terms: record.terms.map((term) => ({
        effectiveStartDate: term.effectiveStartDate,
        effectiveEndDate: term.effectiveEndDate,
        interestRateType: term.interestRateType,
        interestRateMicros: term.interestRateMicros,
        requiredPaymentCents: term.requiredPaymentCents,
        paymentFrequency: term.paymentFrequency,
        dayCountConvention: term.dayCountConvention,
        calculationConvention: term.calculationConvention,
      })),
    }))
    .filter((debt) => debt.startingBalanceCents > 0);

  if (inputs.length === 0) {
    throw new ApplicationServiceError(
      'validation',
      'No active debt balances are available to project.',
      {
        scenarioStartDate: [
          'Record posted balances for at least one active debt before creating a scenario.',
        ],
      },
    );
  }

  return inputs;
};

const buildPayoffAssumptions = (
  request: CreatePayoffScenarioRequest,
): PayoffAssumptions => ({
  scenarioStartDate: ensureCalendarDate('scenarioStartDate', request.scenarioStartDate),
  strategy: request.strategy,
  extraMonthlyPaymentCents: convertMoney(
    'extraMonthlyPayment',
    request.extraMonthlyPayment,
  ),
  customPriority: [...request.customPriority],
  variableRateOverrides: Object.fromEntries(
    Object.entries(request.variableRateOverrides).map(([debtId, rate]) => [
      debtId,
      convertRate(`variableRateOverrides.${debtId}`, rate),
    ]),
  ),
  maxProjectionMonths: request.maxProjectionMonths,
});

const monthKey = (financialDate: string): string => financialDate.slice(0, 7);

const yearKey = (financialDate: string): string => financialDate.slice(0, 4);

const lastDayOfMonth = (year: number, month: number): string =>
  new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

const periodKeys = (
  startDate: string,
  endDate: string,
  frequency: 'monthly' | 'annual',
): readonly string[] => {
  const keys: string[] = [];
  let cursor =
    frequency === 'monthly'
      ? `${startDate.slice(0, 7)}-01`
      : `${startDate.slice(0, 4)}-01-01`;

  while (cursor <= endDate) {
    keys.push(frequency === 'monthly' ? monthKey(cursor) : yearKey(cursor));
    cursor =
      frequency === 'monthly'
        ? addMonths(cursor, 1)
        : `${Number(cursor.slice(0, 4)) + 1}-01-01`;
  }

  return keys;
};

const periodStart = (period: string, frequency: 'monthly' | 'annual'): string =>
  frequency === 'monthly' ? `${period}-01` : `${period}-01-01`;

const periodEnd = (period: string, frequency: 'monthly' | 'annual'): string => {
  if (frequency === 'annual') return `${period}-12-31`;
  const [yearText, monthText] = period.split('-');
  return lastDayOfMonth(Number(yearText), Number(monthText));
};

const clampDate = (date: string, minimum: string, maximum: string): string =>
  date < minimum ? minimum : date > maximum ? maximum : date;

const reportBasis = (
  title: string,
  startDate: string,
  endDate: string,
  effectiveDate: string,
  assumptions: readonly string[] = [],
  warnings: readonly string[] = [],
): DebtReportsDto['monthlyRollforward']['basis'] => ({
  title,
  dateRange: `${startDate} through ${endDate}`,
  effectiveDate,
  balanceBasis:
    'Application-calculated ledger balances use original principal plus posted non-superseded actual activity through the stated date. Confirmed snapshots and scenario balances are labeled separately.',
  assumptions: [...assumptions],
  warnings: [...warnings],
});

const filterReportRecords = (
  records: readonly DebtWithActivityRecord[],
  filters: DebtReportsDto['filters'],
): readonly DebtWithActivityRecord[] =>
  records.filter(({ debt }) => {
    if (filters.debtId && debt.id !== filters.debtId) return false;
    if (filters.ownerEntity && debt.ownerEntity !== filters.ownerEntity) return false;
    if (filters.debtType && debt.debtType !== filters.debtType) return false;
    if (filters.status && debt.status !== filters.status) return false;
    return true;
  });

const calculateReportBalanceThroughDate = (
  database: AppDatabase,
  record: DebtWithActivityRecord,
  date: string,
): number =>
  date < record.debt.originationDate
    ? 0
    : calculateLedgerBalanceThroughDate(database, record.debt.id, date);

const allocationTotal = (
  allocations: readonly DebtTransactionWithAllocationsRecord['allocations'][number][],
  types: readonly string[],
): number =>
  allocations
    .filter((allocation) => types.includes(allocation.allocationType))
    .reduce((total, allocation) => total + allocation.amountCents, 0);

const createRollforward = (
  database: AppDatabase,
  records: readonly DebtWithActivityRecord[],
  startDate: string,
  endDate: string,
  frequency: 'monthly' | 'annual',
): DebtReportsDto['monthlyRollforward']['rows'] =>
  periodKeys(startDate, endDate, frequency).map((period) => {
    const start = clampDate(periodStart(period, frequency), startDate, endDate);
    const end = clampDate(periodEnd(period, frequency), startDate, endDate);
    const beginningDate = previousFinancialDate(start);
    let borrowings = 0;
    let payments = 0;
    let principalReduction = 0;
    let interestActivity = 0;
    let periodTransactionTotal = 0;

    for (const record of records) {
      const transactionTypes = new Map(
        record.transactions.map((entry) => [
          entry.transaction.id,
          entry.transaction.transactionType,
        ]),
      );
      for (const { transaction, allocations } of postedActualTransactionsThrough(
        record,
        start,
        end,
      )) {
        const effectiveTransactionType =
          transaction.transactionType === 'reversal' &&
          transaction.reversalOfTransactionId
            ? (transactionTypes.get(transaction.reversalOfTransactionId) ??
              transaction.transactionType)
            : transaction.transactionType;

        periodTransactionTotal += transaction.totalAmountCents;
        if (effectiveTransactionType === 'borrowing_draw')
          borrowings += transaction.totalAmountCents;
        if (effectiveTransactionType === 'payment')
          payments -= transaction.totalAmountCents;
        const principal = allocationTotal(allocations, [
          'principal',
          'extra_principal',
        ]);
        if (effectiveTransactionType === 'payment') {
          principalReduction -= principal;
        }
        interestActivity += allocationTotal(allocations, ['interest']);
      }
    }

    const beginningBalance = records.reduce(
      (total, record) =>
        total + calculateReportBalanceThroughDate(database, record, beginningDate),
      0,
    );
    const endingBalance = records.reduce(
      (total, record) =>
        total + calculateReportBalanceThroughDate(database, record, end),
      0,
    );
    const adjustmentsAndOther = periodTransactionTotal - borrowings + payments;

    return {
      period,
      beginningBalance: centsToDollars(beginningBalance),
      borrowings: centsToDollars(borrowings),
      payments: centsToDollars(payments),
      principalReduction: centsToDollars(principalReduction),
      interestActivity: centsToDollars(Math.abs(interestActivity)),
      adjustmentsAndOther: centsToDollars(adjustmentsAndOther),
      endingBalance: centsToDollars(endingBalance),
    };
  });

const createReportPayoffInputs = (
  database: AppDatabase,
  records: readonly DebtWithActivityRecord[],
  startDate: string,
): readonly PayoffDebtInput[] =>
  records
    .map((record): PayoffDebtInput => ({
      debtId: record.debt.id,
      debtName: record.debt.name,
      creditor: record.debt.creditor,
      debtType: record.debt.debtType,
      startingBalanceCents: calculateReportBalanceThroughDate(
        database,
        record,
        startDate,
      ),
      maturityDate: record.debt.maturityDate,
      terms: record.terms.map((term) => ({
        effectiveStartDate: term.effectiveStartDate,
        effectiveEndDate: term.effectiveEndDate,
        interestRateType: term.interestRateType,
        interestRateMicros: term.interestRateMicros,
        requiredPaymentCents: term.requiredPaymentCents,
        paymentFrequency: term.paymentFrequency,
        dayCountConvention: term.dayCountConvention,
        calculationConvention: term.calculationConvention,
      })),
    }))
    .filter((debt) => debt.startingBalanceCents > 0);

const reportVariableRateOverrides = (
  records: readonly DebtWithActivityRecord[],
  effectiveDate: string,
  rateAdjustmentMicros: number,
): Readonly<Record<string, number>> =>
  Object.fromEntries(
    records.flatMap((record) => {
      const term = currentTermForDate(record.terms, effectiveDate);
      if (term.interestRateType !== 'variable') return [];
      return [
        [record.debt.id, Math.max(0, term.interestRateMicros + rateAdjustmentMicros)],
      ];
    }),
  );

const createSensitivityRows = (
  inputs: readonly PayoffDebtInput[],
  records: readonly DebtWithActivityRecord[],
  startDate: string,
  kind: 'rate' | 'extra',
): DebtReportsDto['interestRateSensitivity']['rows'] => {
  if (inputs.length === 0) return [];

  const cases =
    kind === 'rate'
      ? [
          { label: 'Rates -1.00%', rateChange: -10_000, extra: 0 },
          { label: 'Current rates', rateChange: 0, extra: 0 },
          { label: 'Rates +1.00%', rateChange: 10_000, extra: 0 },
        ]
      : [
          { label: 'No extra payment', rateChange: 0, extra: 0 },
          { label: 'Extra $250/month', rateChange: 0, extra: 25_000 },
          { label: 'Extra $500/month', rateChange: 0, extra: 50_000 },
        ];

  return cases.map((item) => {
    const adjustedInputs = inputs.map((debt) => ({
      ...debt,
      terms: debt.terms.map((term) => ({
        ...term,
        interestRateMicros:
          term.interestRateType === 'variable'
            ? term.interestRateMicros
            : Math.max(0, term.interestRateMicros + item.rateChange),
      })),
    }));
    const result = projectPayoffScenario(adjustedInputs, {
      scenarioStartDate: startDate,
      strategy: 'avalanche',
      extraMonthlyPaymentCents: item.extra,
      customPriority: [],
      variableRateOverrides: reportVariableRateOverrides(
        records,
        startDate,
        item.rateChange,
      ),
      maxProjectionMonths: 360,
    });

    return {
      scenarioLabel: item.label,
      assumption:
        kind === 'rate'
          ? 'Rate sensitivity adjusts supported fixed/promotional rates and supplies explicit current-rate assumptions for variable-rate debts.'
          : 'Extra-payment sensitivity reuses the payoff engine with avalanche priority and the stated extra monthly payment.',
      projectedPayoffDate: result.projectedPayoffDate,
      totalProjectedInterest: centsToDollars(result.totalProjectedInterestCents),
      monthlyCashRequirement: centsToDollars(result.monthlyCashRequirementCents),
      warnings: [...result.warnings],
    };
  });
};

const createDebtReports = (
  database: AppDatabase,
  request: GetDebtReportsRequest,
  now: () => string,
): DebtReportsDto => {
  const parsed = getDebtReportsRequestSchema.parse(request);
  const effectiveDate = parsed.endDate ?? currentFinancialDate(now);
  const startDate = parsed.startDate ?? `${effectiveDate.slice(0, 4)}-01-01`;
  const endDate = parsed.endDate ?? effectiveDate;
  const filters: DebtReportsDto['filters'] = {
    startDate,
    endDate,
    effectiveDate,
    debtId: parsed.debtId,
    ownerEntity: nullableText(parsed.ownerEntity),
    debtType: parsed.debtType,
    status: parsed.status,
  };
  const records = filterReportRecords(listDebtActivityRecords(database, true), filters);
  const reportInputs = createReportPayoffInputs(database, records, effectiveDate);
  const baseAssumptions = [
    'Reports are read-only and do not edit posted financial records.',
    'Posted activity excludes superseded transactions.',
    'Projected and scenario data is labeled separately from actual ledger data.',
  ];

  const balanceHistoryRows = records.flatMap((record) => {
    const dates = [
      ...new Set([
        startDate,
        endDate,
        ...record.transactions
          .filter(({ transaction }) =>
            isWithinDateRange(transaction.effectiveDate, startDate, endDate),
          )
          .map(({ transaction }) => transaction.effectiveDate),
        ...record.balanceSnapshots
          .filter((snapshot) =>
            isWithinDateRange(snapshot.effectiveDate, startDate, endDate),
          )
          .map((snapshot) => snapshot.effectiveDate),
      ]),
    ].sort();

    return dates.map((date) => {
      const snapshot = record.balanceSnapshots
        .filter((candidate) => candidate.effectiveDate <= date)
        .at(-1);
      return {
        debtId: record.debt.id,
        debtName: record.debt.name,
        creditor: record.debt.creditor,
        effectiveDate: date,
        calculatedBalance: centsToDollars(
          calculateReportBalanceThroughDate(database, record, date),
        ),
        confirmedBalance: snapshot
          ? centsToDollars(snapshot.confirmedBalanceCents)
          : null,
        basis: `Calculated balance is ledger-based as of ${date}; confirmed balance is latest snapshot on or before ${date}, when available.`,
      };
    });
  });

  const monthlyRows = createRollforward(
    database,
    records,
    startDate,
    endDate,
    'monthly',
  );
  const trendRows = monthlyRows.map((row) => ({
    period: row.period,
    principalReduction: row.principalReduction,
    interestActivity: row.interestActivity,
    borrowings: row.borrowings,
    payments: row.payments,
  }));
  const scheduleRows = records.map((record) => {
    const term = currentTermForDate(record.terms, effectiveDate);
    return {
      debtId: record.debt.id,
      debtName: record.debt.name,
      creditor: record.debt.creditor,
      ownerEntity: record.debt.ownerEntity,
      debtType: record.debt.debtType,
      status: record.debt.status,
      maturityDate: record.debt.maturityDate,
      requiredMonthlyPayment: centsToDollars(
        monthlyEquivalentCents(term.requiredPaymentCents, term.paymentFrequency),
      ),
      currentInterestRate: rateMicrosToPercentString(term.interestRateMicros),
      calculatedBalance: centsToDollars(
        calculateLedgerBalanceThroughDate(database, record.debt.id, effectiveDate),
      ),
      basis: `Current effective term as of ${effectiveDate}; balance is application-calculated ledger balance.`,
    };
  });

  const scenarioRows = listPayoffScenarioRecords(database, true).flatMap((scenario) => {
    const result = parsePayoffResult(scenario.resultJson);
    return result.debts.map((debtResult) => {
      const record = records.find(
        (candidate) => candidate.debt.id === debtResult.debtId,
      );
      const currentBalance = record
        ? calculateLedgerBalanceThroughDate(database, record.debt.id, endDate)
        : debtResult.startingBalanceCents;
      const actualPrincipalReduction = Math.max(
        0,
        debtResult.startingBalanceCents - currentBalance,
      );
      const plannedPrincipalReduction =
        debtResult.projectedPayoffDate && debtResult.projectedPayoffDate <= endDate
          ? debtResult.startingBalanceCents
          : null;
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        debtId: debtResult.debtId,
        debtName: debtResult.debtName,
        actualPrincipalReduction: centsToDollars(actualPrincipalReduction),
        plannedPrincipalReduction:
          plannedPrincipalReduction === null
            ? null
            : centsToDollars(plannedPrincipalReduction),
        variance:
          plannedPrincipalReduction === null
            ? null
            : centsToDollars(actualPrincipalReduction - plannedPrincipalReduction),
        basis:
          'Actual reduction compares scenario starting balance to current calculated ledger balance. Planned reduction is available only when saved scenario payoff date falls within the report range.',
        warnings: [
          ...result.warnings,
          ...(plannedPrincipalReduction === null
            ? [
                'Saved scenario does not persist monthly plan balances, so planned principal reduction is unavailable for this date range.',
              ]
            : []),
        ],
      };
    });
  });

  const exceptionRows: DebtReportsDto['reconciliationAndDataQuality']['rows'] =
    records.flatMap((record) => [
      ...record.balanceReconciliations
        .filter(
          (reconciliation) =>
            reconciliation.lifecycleStatus === 'current' &&
            reconciliation.reconciliationStatus !== 'reconciled',
        )
        .map((reconciliation) => ({
          severity:
            reconciliation.reconciliationStatus === 'exception'
              ? ('exception' as const)
              : ('warning' as const),
          category: 'Reconciliation',
          debtId: record.debt.id,
          debtName: record.debt.name,
          effectiveDate: reconciliation.statementDate,
          message: `${reconciliation.reconciliationStatus} reconciliation; difference ${centsToDollars(reconciliation.calculatedDifferenceCents)}.`,
          sourceId: reconciliation.id,
        })),
      ...record.terms
        .filter(
          (term) =>
            term.paymentFrequency === 'irregular' || term.paymentFrequency === 'other',
        )
        .map((term) => ({
          severity: 'warning' as const,
          category: 'Projection support',
          debtId: record.debt.id,
          debtName: record.debt.name,
          effectiveDate: term.effectiveStartDate,
          message:
            'Irregular or other payment frequency is not supported for reliable payoff projection.',
          sourceId: term.id,
        })),
      ...findMalformedReversalIssues(record).map((issue) => ({
        severity: 'exception' as const,
        category: 'Data integrity',
        debtId: issue.debtId,
        debtName: issue.debtName,
        effectiveDate: issue.effectiveDate,
        message: summarizeReversalIssue(issue),
        sourceId: issue.reversalTransactionId,
      })),
    ]);

  return {
    filters,
    monthlyRollforward: {
      basis: reportBasis(
        'Monthly debt rollforward',
        startDate,
        endDate,
        effectiveDate,
        baseAssumptions,
      ),
      rows: monthlyRows,
    },
    annualRollforward: {
      basis: reportBasis(
        'Annual debt rollforward',
        startDate,
        endDate,
        effectiveDate,
        baseAssumptions,
      ),
      rows: createRollforward(database, records, startDate, endDate, 'annual'),
    },
    balanceHistory: {
      basis: reportBasis(
        'Debt balance history by obligation',
        startDate,
        endDate,
        effectiveDate,
        baseAssumptions,
      ),
      rows: balanceHistoryRows,
    },
    activityTrends: {
      basis: reportBasis(
        'Principal, interest, borrowing, and payment trends',
        startDate,
        endDate,
        effectiveDate,
        baseAssumptions,
      ),
      rows: trendRows,
    },
    maturitySchedule: {
      basis: reportBasis(
        'Maturity and required-payment schedule',
        startDate,
        endDate,
        effectiveDate,
        [
          ...baseAssumptions,
          'Required payments are normalized to monthly equivalents using current effective terms.',
        ],
      ),
      rows: scheduleRows,
    },
    interestRateSensitivity: {
      basis: reportBasis(
        'Interest-rate sensitivity',
        startDate,
        endDate,
        effectiveDate,
        [
          ...baseAssumptions,
          'Sensitivity reuses the payoff projection engine and does not post projected transactions.',
        ],
      ),
      rows: createSensitivityRows(reportInputs, records, effectiveDate, 'rate'),
    },
    extraPaymentSensitivity: {
      basis: reportBasis(
        'Extra-payment sensitivity',
        startDate,
        endDate,
        effectiveDate,
        [
          ...baseAssumptions,
          'Sensitivity reuses the payoff projection engine and does not post projected transactions.',
        ],
      ),
      rows: createSensitivityRows(reportInputs, records, effectiveDate, 'extra'),
    },
    actualVersusPlanVariance: {
      basis: reportBasis(
        'Actual-versus-plan variance using saved payoff scenarios',
        startDate,
        endDate,
        effectiveDate,
        [
          ...baseAssumptions,
          'Saved scenarios do not currently persist monthly projected balances; variance is limited to payoff-date-based planned reduction where available.',
        ],
      ),
      rows: scenarioRows,
    },
    reconciliationAndDataQuality: {
      basis: reportBasis(
        'Reconciliation and data-quality exceptions',
        startDate,
        endDate,
        effectiveDate,
        baseAssumptions,
      ),
      rows: exceptionRows,
    },
  };
};

const parseJsonRecord = (
  text: string,
): Readonly<Record<string, string | null | unknown>> => {
  const parsed = JSON.parse(text) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, string | null | unknown>)
    : {};
};

const parseStringRecord = (text: string): Readonly<Record<string, string>> => {
  const parsed = parseJsonRecord(text);
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  );
};

const parseNullableStringRecord = (
  text: string,
): Readonly<Record<string, string | null>> => {
  const parsed = parseJsonRecord(text);
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, value]) =>
      typeof value === 'string' || value === null ? [[key, value]] : [],
    ),
  );
};

const parseStringArray = (text: string): string[] => {
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((value): value is string => typeof value === 'string')
    : [];
};

const mapImportBatchSummary = (batch: ImportBatchRecord): ImportBatchSummaryDto => ({
  id: batch.id,
  sourceWorkbookName: batch.sourceWorkbookName,
  sourceWorkbookFingerprint: batch.sourceWorkbookFingerprint,
  sourceWorkbookModifiedAtUtc: batch.sourceWorkbookModifiedAtUtc,
  status: batch.status,
  importedAtUtc: batch.importedAtUtc,
  createdAtUtc: batch.createdAtUtc,
  updatedAtUtc: batch.updatedAtUtc,
});

const mapImportSheetMapping = (
  mapping: ImportSheetMappingRecord,
): ImportBatchDto['sheetMappings'][number] => ({
  id: mapping.id,
  batchId: mapping.batchId,
  sourceSheetName: mapping.sourceSheetName,
  proposedRecordType: mapping.proposedRecordType,
  reviewStatus: mapping.reviewStatus,
  fieldMapping: parseStringRecord(mapping.fieldMappingJson),
  notes: mapping.notes,
  createdAtUtc: mapping.createdAtUtc,
  updatedAtUtc: mapping.updatedAtUtc,
});

const mapStagedImportRow = (
  row: StagedImportRowRecord,
): ImportBatchDto['stagedRows'][number] => ({
  id: row.id,
  batchId: row.batchId,
  sheetMappingId: row.sheetMappingId,
  sourceSheetName: row.sourceSheetName,
  sourceRowNumber: row.sourceRowNumber,
  sourceCellReferences: parseStringRecord(row.sourceCellReferencesJson),
  sourceDisplayedValues: parseStringRecord(row.sourceDisplayedValuesJson),
  sourceFormulas: parseStringRecord(row.sourceFormulasJson),
  proposedRecordType: row.proposedRecordType,
  activityClassification: row.activityClassification,
  normalizedValues: parseNullableStringRecord(row.normalizedValuesJson),
  validationMessages: parseStringArray(row.validationMessagesJson),
  duplicateCandidate: row.duplicateCandidateJson,
  reconciliationException: row.reconciliationExceptionJson,
  reviewStatus: row.reviewStatus,
  reviewNotes: row.reviewNotes,
  reviewedAtUtc: row.reviewedAtUtc,
  createdAtUtc: row.createdAtUtc,
  updatedAtUtc: row.updatedAtUtc,
});

const createImportControlTotals = (
  rows: readonly StagedImportRowRecord[],
): ImportBatchDto['controlTotals'] => ({
  totalRows: rows.length,
  needsReviewRows: rows.filter((row) => row.reviewStatus === 'needs_review').length,
  approvedRows: rows.filter((row) => row.reviewStatus === 'approved').length,
  rejectedRows: rows.filter((row) => row.reviewStatus === 'rejected').length,
  deferredRows: rows.filter((row) => row.reviewStatus === 'deferred').length,
  ambiguousRows: rows.filter((row) => row.activityClassification === 'ambiguous')
    .length,
  duplicateCandidateRows: rows.filter((row) => row.duplicateCandidateJson !== null)
    .length,
  invalidRows: rows.filter(
    (row) => parseStringArray(row.validationMessagesJson).length > 0,
  ).length,
  reconciliationExceptionRows: rows.filter(
    (row) => row.reconciliationExceptionJson !== null,
  ).length,
  candidateTotalsByType: {
    debt: rows.filter((row) => row.proposedRecordType === 'debt').length,
    transaction: rows.filter((row) => row.proposedRecordType === 'transaction').length,
    term: rows.filter((row) => row.proposedRecordType === 'term').length,
    balance_snapshot: rows.filter(
      (row) => row.proposedRecordType === 'balance_snapshot',
    ).length,
    unknown: rows.filter((row) => row.proposedRecordType === 'unknown').length,
  },
});

const mapImportBatch = (record: ImportBatchWithRowsRecord): ImportBatchDto => ({
  ...mapImportBatchSummary(record.batch),
  sheetMappings: record.sheetMappings.map(mapImportSheetMapping),
  stagedRows: record.stagedRows.map(mapStagedImportRow),
  controlTotals: createImportControlTotals(record.stagedRows),
});

const getImportBatchOrThrow = (
  database: AppDatabase,
  id: string,
): ImportBatchWithRowsRecord => {
  const record = getImportBatchRecord(database, id);

  if (!record) {
    throw new ApplicationServiceError('not_found', 'Import batch was not found.');
  }

  return record;
};

const fieldValue = (
  values: Readonly<Record<string, string | null>>,
  names: readonly string[],
): string | null => {
  for (const name of names) {
    const value = values[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }

  return null;
};

const requiredFieldValue = (
  row: StagedImportRowRecord,
  values: Readonly<Record<string, string | null>>,
  names: readonly string[],
  label: string,
): string => {
  const value = fieldValue(values, names);

  if (!value) {
    throw new ApplicationServiceError('validation', 'Import row cannot be posted.', {
      [`row.${row.id}`]: [`Missing required ${label}.`],
    });
  }

  return value;
};

const enumValue = <T extends string>(
  row: StagedImportRowRecord,
  values: Readonly<Record<string, string | null>>,
  names: readonly string[],
  allowed: readonly T[],
  label: string,
): T => {
  const value = requiredFieldValue(row, values, names, label);
  if ((allowed as readonly string[]).includes(value)) return value as T;

  throw new ApplicationServiceError('validation', 'Import row cannot be posted.', {
    [`row.${row.id}`]: [
      `${label} must be one of: ${allowed.join(', ')}. Received ${value}.`,
    ],
  });
};

const optionalDate = (
  row: StagedImportRowRecord,
  values: Readonly<Record<string, string | null>>,
  names: readonly string[],
  label: string,
): string | null => {
  const value = fieldValue(values, names);
  return value ? ensureCalendarDate(`row.${row.id}.${label}`, value) : null;
};

const importSourceReference = (batchId: string, rowId: string): string =>
  `import:${batchId}:${rowId}`;

const liveRecordLabel = (
  entityType: ImportPostingInsert['liveEntityType'],
  entityId: string,
): string => `${entityType.replaceAll('_', ' ')} ${entityId}`;

const postingRecordDto = (
  posting: ImportPostingRecord,
): ImportPostingPreviewDto['rowResults'][number]['createdRecords'][number] => ({
  entityType: posting.liveEntityType,
  entityId: posting.liveEntityId,
  label: liveRecordLabel(posting.liveEntityType, posting.liveEntityId),
});

const mappingApprovedForRow = (
  batch: ImportBatchWithRowsRecord,
  row: StagedImportRowRecord,
): boolean =>
  batch.sheetMappings.some(
    (mapping) =>
      mapping.id === row.sheetMappingId &&
      mapping.reviewStatus === 'approved' &&
      mapping.proposedRecordType === row.proposedRecordType,
  );

const validateRowForPosting = (
  batch: ImportBatchWithRowsRecord,
  row: StagedImportRowRecord,
): string[] => {
  const messages: string[] = [];

  if (!mappingApprovedForRow(batch, row)) {
    messages.push('Sheet mapping must be approved for this row type.');
  }
  if (row.reviewStatus !== 'approved') {
    messages.push('Staged row must be explicitly approved before posting.');
  }
  if (row.proposedRecordType === 'unknown') {
    messages.push('Unknown rows cannot be posted.');
  }
  if (row.activityClassification !== 'actual') {
    messages.push('Only approved actual rows can be posted to live records.');
  }
  if (parseStringArray(row.validationMessagesJson).length > 0) {
    messages.push(...parseStringArray(row.validationMessagesJson));
  }
  if (row.duplicateCandidateJson) {
    messages.push('Duplicate candidate must be resolved before posting.');
  }
  if (row.reconciliationExceptionJson) {
    messages.push('Reconciliation exception must be resolved before posting.');
  }

  return messages;
};

const previewImportPosting = (
  batch: ImportBatchWithRowsRecord,
): ImportPostingPreviewDto => {
  const postingsByRow = new Map<string, ImportPostingRecord[]>();
  for (const posting of batch.postings) {
    const postings = postingsByRow.get(posting.stagedRowId) ?? [];
    postings.push(posting);
    postingsByRow.set(posting.stagedRowId, postings);
  }

  const rowResults = batch.stagedRows.map((row) => {
    const validationMessages =
      batch.batch.status === 'closed' ? [] : validateRowForPosting(batch, row);

    return {
      stagedRowId: row.id,
      sourceSheetName: row.sourceSheetName,
      sourceRowNumber: row.sourceRowNumber,
      proposedRecordType: row.proposedRecordType,
      reviewStatus: row.reviewStatus,
      canPost:
        batch.batch.status !== 'closed' &&
        row.reviewStatus === 'approved' &&
        validationMessages.length === 0,
      validationMessages,
      createdRecords: (postingsByRow.get(row.id) ?? []).map(postingRecordDto),
    };
  });

  const approvedMappings = batch.sheetMappings.filter(
    (mapping) => mapping.reviewStatus === 'approved',
  ).length;
  const unapprovedMappings = batch.sheetMappings.length - approvedMappings;

  return {
    batchId: batch.batch.id,
    batchStatus: batch.batch.status,
    approvedMappings,
    unapprovedMappings,
    approvedRows: batch.stagedRows.filter((row) => row.reviewStatus === 'approved')
      .length,
    rejectedRows: batch.stagedRows.filter((row) => row.reviewStatus === 'rejected')
      .length,
    deferredRows: batch.stagedRows.filter((row) => row.reviewStatus === 'deferred')
      .length,
    postableRows: rowResults.filter((row) => row.canPost).length,
    exceptionRows: rowResults.filter((row) => row.validationMessages.length > 0).length,
    alreadyPosted: batch.batch.status === 'closed' || batch.postings.length > 0,
    rowResults,
  };
};

interface ImportPostingBuildResult {
  readonly debts: readonly DebtInsert[];
  readonly terms: readonly DebtTermInsert[];
  readonly transactions: readonly DebtTransactionInsert[];
  readonly allocations: readonly TransactionAllocationInsert[];
  readonly snapshots: readonly BalanceSnapshotInsert[];
  readonly postings: readonly ImportPostingInsert[];
  readonly audits: readonly AuditEventInsert[];
  readonly createdRecordsByRow: ReadonlyMap<
    string,
    readonly ImportPostingPreviewDto['rowResults'][number]['createdRecords'][number][]
  >;
}

const buildImportPostingRecords = (
  batch: ImportBatchWithRowsRecord,
  createId: () => string,
  timestamp: string,
  existingDebts: readonly DebtWithTermsRecord[],
): ImportPostingBuildResult => {
  const debtsToInsert: DebtInsert[] = [];
  const termsToInsert: DebtTermInsert[] = [];
  const transactionsToInsert: DebtTransactionInsert[] = [];
  const allocationsToInsert: TransactionAllocationInsert[] = [];
  const snapshotsToInsert: BalanceSnapshotInsert[] = [];
  const postingsToInsert: ImportPostingInsert[] = [];
  const auditsToInsert: AuditEventInsert[] = [];
  const createdRecordsByRow = new Map<
    string,
    ImportPostingPreviewDto['rowResults'][number]['createdRecords'][number][]
  >();
  const debtIdsByName = new Map(
    existingDebts.map((record) => [record.debt.name, record.debt.id]),
  );
  const termPeriodsByDebt = new Map<
    string,
    { readonly start: string; readonly end: string | null }[]
  >(
    existingDebts.map((record) => [
      record.debt.id,
      record.terms.map((term) => ({
        start: term.effectiveStartDate,
        end: term.effectiveEndDate,
      })),
    ]),
  );

  const remember = (
    row: StagedImportRowRecord,
    entityType: ImportPostingInsert['liveEntityType'],
    entityId: string,
  ) => {
    postingsToInsert.push({
      id: createId(),
      batchId: batch.batch.id,
      stagedRowId: row.id,
      liveEntityType: entityType,
      liveEntityId: entityId,
      postedAtUtc: timestamp,
      createdAtUtc: timestamp,
    });
    const records = createdRecordsByRow.get(row.id) ?? [];
    records.push({
      entityType,
      entityId,
      label: liveRecordLabel(entityType, entityId),
    });
    createdRecordsByRow.set(row.id, records);
  };

  const debtIdForRow = (
    row: StagedImportRowRecord,
    values: Readonly<Record<string, string | null>>,
  ): string => {
    const debtId = fieldValue(values, ['debt_id']);
    if (debtId) return debtId;

    const debtName = requiredFieldValue(
      row,
      values,
      ['debt_name', 'name'],
      'debt name',
    );
    const resolved = debtIdsByName.get(debtName);
    if (!resolved) {
      throw new ApplicationServiceError('validation', 'Import row cannot be posted.', {
        [`row.${row.id}`]: [
          `No existing or imported debt named ${debtName} was found.`,
        ],
      });
    }

    return resolved;
  };

  const addTermPeriod = (row: StagedImportRowRecord, term: DebtTermInsert): void => {
    const periods = termPeriodsByDebt.get(term.debtId) ?? [];
    const newEnd = term.effectiveEndDate ?? '9999-12-31';

    const overlaps = periods.some((period) => {
      const existingEnd = period.end ?? '9999-12-31';
      return term.effectiveStartDate <= existingEnd && period.start <= newEnd;
    });

    if (overlaps) {
      throw new ApplicationServiceError('validation', 'Import row cannot be posted.', {
        [`row.${row.id}`]: ['Imported debt term overlaps an existing term period.'],
      });
    }

    periods.push({
      start: term.effectiveStartDate,
      end: term.effectiveEndDate ?? null,
    });
    termPeriodsByDebt.set(term.debtId, periods);
  };

  for (const row of batch.stagedRows.filter(
    (candidate) => candidate.reviewStatus === 'approved',
  )) {
    const rowMessages = validateRowForPosting(batch, row);
    if (rowMessages.length > 0) {
      throw new ApplicationServiceError(
        'validation',
        'Import batch is not ready to post.',
        {
          [`row.${row.id}`]: rowMessages,
        },
      );
    }

    const values = parseNullableStringRecord(row.normalizedValuesJson);
    const sourceReference = importSourceReference(batch.batch.id, row.id);

    if (row.proposedRecordType === 'debt') {
      const debtId = createId();
      const termId = createId();
      const originationDate = ensureCalendarDate(
        `row.${row.id}.origination_date`,
        requiredFieldValue(row, values, ['origination_date'], 'origination date'),
      );
      const debt: DebtInsert = {
        id: debtId,
        name: requiredFieldValue(row, values, ['name', 'debt_name'], 'debt name'),
        creditor: requiredFieldValue(row, values, ['creditor'], 'creditor'),
        ownerEntity: requiredFieldValue(
          row,
          values,
          ['owner_entity', 'owner'],
          'owner or entity',
        ),
        debtType: enumValue(row, values, ['debt_type'], DEBT_TYPES, 'debt type'),
        purpose: requiredFieldValue(row, values, ['purpose'], 'purpose'),
        status: enumValue(row, values, ['status'], DEBT_STATUSES, 'debt status'),
        originalPrincipalCents: convertMoney(
          `row.${row.id}.original_principal`,
          requiredFieldValue(
            row,
            values,
            ['original_principal', 'principal'],
            'original principal',
          ),
        ),
        originationDate,
        maturityDate: optionalDate(row, values, ['maturity_date'], 'maturity_date'),
        minimumPaymentCents: convertMoney(
          `row.${row.id}.minimum_payment`,
          requiredFieldValue(row, values, ['minimum_payment'], 'minimum payment'),
        ),
        paymentFrequency: enumValue(
          row,
          values,
          ['payment_frequency'],
          PAYMENT_FREQUENCIES,
          'payment frequency',
        ),
        creditLimitCents: fieldValue(values, ['credit_limit'])
          ? convertMoney(
              `row.${row.id}.credit_limit`,
              fieldValue(values, ['credit_limit'])!,
            )
          : null,
        collateralDescription: nullableText(
          fieldValue(values, ['collateral_description']),
        ),
        taxCategory: enumValue(
          row,
          values,
          ['tax_category'],
          TAX_CATEGORIES,
          'tax category',
        ),
        deductiblePercentageBps: convertPercentage(
          `row.${row.id}.deductible_percentage`,
          requiredFieldValue(
            row,
            values,
            ['deductible_percentage'],
            'deductible percentage',
          ),
        ),
        notes: nullableText(fieldValue(values, ['notes'])),
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp,
        archivedAtUtc: null,
      };
      const termRateType = enumValue(
        row,
        values,
        ['interest_rate_type'],
        INTEREST_RATE_TYPES,
        'interest rate type',
      );
      const term: DebtTermInsert = {
        id: termId,
        debtId,
        effectiveStartDate: ensureCalendarDate(
          `row.${row.id}.term_effective_start_date`,
          requiredFieldValue(
            row,
            values,
            ['term_effective_start_date', 'effective_start_date'],
            'initial term effective start date',
          ),
        ),
        effectiveEndDate: null,
        interestRateType: termRateType,
        interestRateMicros: convertRate(
          `row.${row.id}.annual_interest_rate`,
          requiredFieldValue(
            row,
            values,
            ['annual_interest_rate', 'interest_rate'],
            'annual interest rate',
          ),
        ),
        dayCountConvention: enumValue(
          row,
          values,
          ['day_count_convention'],
          DAY_COUNT_CONVENTIONS,
          'day-count convention',
        ),
        calculationConvention: enumValue(
          row,
          values,
          ['calculation_convention'],
          INTEREST_CALCULATION_CONVENTIONS,
          'calculation convention',
        ),
        requiredPaymentCents: convertMoney(
          `row.${row.id}.required_payment`,
          requiredFieldValue(row, values, ['required_payment'], 'required payment'),
        ),
        paymentFrequency: enumValue(
          row,
          values,
          ['term_payment_frequency', 'payment_frequency'],
          PAYMENT_FREQUENCIES,
          'term payment frequency',
        ),
        notes: nullableText(fieldValue(values, ['term_notes'])),
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp,
      };
      if (term.interestRateType === 'zero' && term.interestRateMicros !== 0) {
        throw new ApplicationServiceError(
          'validation',
          'Import row cannot be posted.',
          {
            [`row.${row.id}`]: ['Zero-rate debt terms must use 0% annual interest.'],
          },
        );
      }
      debtsToInsert.push(debt);
      termsToInsert.push(term);
      debtIdsByName.set(debt.name, debt.id);
      termPeriodsByDebt.set(debt.id, [
        { start: term.effectiveStartDate, end: term.effectiveEndDate ?? null },
      ]);
      remember(row, 'debt', debt.id);
      remember(row, 'debt_term', term.id);
      auditsToInsert.push(
        createDebtAudit(
          createId(),
          debt.id,
          'import_debt_posted',
          'import_post',
          timestamp,
          'Approved workbook debt row was posted.',
          ['importBatchId', 'stagedRowId'],
        ),
      );
      continue;
    }

    if (row.proposedRecordType === 'term') {
      const debtId = debtIdForRow(row, values);
      const rateType = enumValue(
        row,
        values,
        ['interest_rate_type'],
        INTEREST_RATE_TYPES,
        'interest rate type',
      );
      const term: DebtTermInsert = {
        id: createId(),
        debtId,
        effectiveStartDate: ensureCalendarDate(
          `row.${row.id}.effective_start_date`,
          requiredFieldValue(
            row,
            values,
            ['effective_start_date'],
            'effective start date',
          ),
        ),
        effectiveEndDate: optionalDate(
          row,
          values,
          ['effective_end_date'],
          'effective_end_date',
        ),
        interestRateType: rateType,
        interestRateMicros: convertRate(
          `row.${row.id}.annual_interest_rate`,
          requiredFieldValue(
            row,
            values,
            ['annual_interest_rate', 'interest_rate'],
            'annual interest rate',
          ),
        ),
        dayCountConvention: enumValue(
          row,
          values,
          ['day_count_convention'],
          DAY_COUNT_CONVENTIONS,
          'day-count convention',
        ),
        calculationConvention: enumValue(
          row,
          values,
          ['calculation_convention'],
          INTEREST_CALCULATION_CONVENTIONS,
          'calculation convention',
        ),
        requiredPaymentCents: convertMoney(
          `row.${row.id}.required_payment`,
          requiredFieldValue(row, values, ['required_payment'], 'required payment'),
        ),
        paymentFrequency: enumValue(
          row,
          values,
          ['payment_frequency'],
          PAYMENT_FREQUENCIES,
          'payment frequency',
        ),
        notes: nullableText(fieldValue(values, ['notes'])),
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp,
      };
      addTermPeriod(row, term);
      termsToInsert.push(term);
      remember(row, 'debt_term', term.id);
      auditsToInsert.push(
        createDebtAudit(
          createId(),
          debtId,
          'import_debt_term_posted',
          'import_post',
          timestamp,
          'Approved workbook debt-term row was posted.',
          ['importBatchId', 'stagedRowId'],
        ),
      );
      continue;
    }

    if (row.proposedRecordType === 'transaction') {
      const debtId = debtIdForRow(row, values);
      const transactionId = createId();
      const totalAmountCents = convertSignedMoney(
        `row.${row.id}.amount`,
        requiredFieldValue(row, values, ['amount', 'payment'], 'transaction amount'),
      );
      const transaction: DebtTransactionInsert = {
        id: transactionId,
        debtId,
        transactionType: enumValue(
          row,
          values,
          ['transaction_type'],
          POSTED_ACTIVITY_TRANSACTION_TYPES,
          'transaction type',
        ),
        effectiveDate: ensureCalendarDate(
          `row.${row.id}.effective_date`,
          requiredFieldValue(row, values, ['effective_date', 'date'], 'effective date'),
        ),
        postingDate: ensureCalendarDate(
          `row.${row.id}.posting_date`,
          fieldValue(values, ['posting_date']) ??
            requiredFieldValue(row, values, ['effective_date', 'date'], 'posting date'),
        ),
        totalAmountCents,
        status: 'posted',
        description: requiredFieldValue(row, values, ['description'], 'description'),
        sourceType: 'import',
        sourceReference,
        reversalOfTransactionId: null,
        supersedesTransactionId: null,
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp,
      };
      const allocationType = enumValue(
        row,
        values,
        ['allocation_type'],
        ALLOCATION_TYPES,
        'allocation type',
      );
      const allocation: TransactionAllocationInsert = {
        id: createId(),
        transactionId,
        allocationType,
        amountCents: totalAmountCents,
        notes: null,
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp,
      };
      const signErrors = validateTransactionSignConvention(transaction, [allocation]);
      if (signErrors.length > 0) {
        throw new ApplicationServiceError(
          'validation',
          'Import row cannot be posted.',
          {
            [`row.${row.id}`]: signErrors,
          },
        );
      }
      transactionsToInsert.push(transaction);
      allocationsToInsert.push(allocation);
      remember(row, 'debt_transaction', transaction.id);
      remember(row, 'transaction_allocation', allocation.id);
      auditsToInsert.push(
        createTransactionAudit(
          createId(),
          transaction.id,
          'import_transaction_posted',
          'import_post',
          timestamp,
          'Approved workbook transaction row was posted.',
          {
            importBatchId: batch.batch.id,
            stagedRowId: row.id,
            allocationTypes: [allocation.allocationType],
          },
        ),
      );
      continue;
    }

    if (row.proposedRecordType === 'balance_snapshot') {
      const debtId = debtIdForRow(row, values);
      const snapshot: BalanceSnapshotInsert = {
        id: createId(),
        debtId,
        effectiveDate: ensureCalendarDate(
          `row.${row.id}.effective_date`,
          requiredFieldValue(
            row,
            values,
            ['effective_date', 'statement_date', 'date'],
            'snapshot effective date',
          ),
        ),
        confirmedBalanceCents: convertMoney(
          `row.${row.id}.confirmed_balance`,
          requiredFieldValue(
            row,
            values,
            ['confirmed_balance', 'ending_balance', 'balance'],
            'confirmed balance',
          ),
        ),
        sourceType: 'import',
        sourceReference,
        notes: nullableText(fieldValue(values, ['notes'])),
        createdAtUtc: timestamp,
        updatedAtUtc: timestamp,
      };
      snapshotsToInsert.push(snapshot);
      remember(row, 'balance_snapshot', snapshot.id);
      auditsToInsert.push(
        createSnapshotAudit(
          createId(),
          snapshot.id,
          'import_balance_snapshot_posted',
          'import_post',
          timestamp,
          'Approved workbook balance-snapshot row was posted.',
          { importBatchId: batch.batch.id, stagedRowId: row.id },
        ),
      );
    }
  }

  auditsToInsert.push(
    createImportAudit(
      createId(),
      batch.batch.id,
      'workbook_import_posted',
      'import_post',
      timestamp,
      'Approved workbook import batch was posted transactionally.',
      {
        postedRowCount: createdRecordsByRow.size,
        createdRecordCount: postingsToInsert.length,
      },
    ),
  );

  return {
    debts: debtsToInsert,
    terms: termsToInsert,
    transactions: transactionsToInsert,
    allocations: allocationsToInsert,
    snapshots: snapshotsToInsert,
    postings: postingsToInsert,
    audits: auditsToInsert,
    createdRecordsByRow,
  };
};

const normalizeError = (error: unknown): never => {
  if (error instanceof ApplicationServiceError) {
    throw error;
  }

  if (error instanceof RepositoryNotFoundError) {
    throw new ApplicationServiceError('not_found', error.message);
  }

  if (error instanceof RepositoryConflictError) {
    throw new ApplicationServiceError('conflict', error.message);
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};

    for (const issue of error.issues) {
      const field = issue.path.join('.') || 'request';
      (fieldErrors[field] ??= []).push(issue.message);
    }

    throw new ApplicationServiceError(
      'validation',
      'Review the highlighted fields.',
      fieldErrors,
    );
  }

  throw error;
};

export const createDebtMaintenanceService = ({
  database,
  createId = randomUUID,
  now = currentUtcTimestamp,
  selectWorkbookPath,
}: DebtMaintenanceServiceDependencies): DebtMaintenanceService => {
  const getRecordOrThrow = (id: string): DebtWithActivityRecord => {
    const record = getDebtActivityRecord(database, id);

    if (!record) {
      throw new ApplicationServiceError('not_found', 'Debt was not found.');
    }

    return record;
  };

  const getScenarioOrThrow = (id: string): PayoffScenarioRecord => {
    const record = getPayoffScenarioRecord(database, id);

    if (!record) {
      throw new ApplicationServiceError('not_found', 'Payoff scenario was not found.');
    }

    return record;
  };

  const calculatePayoffResult = (
    assumptions: PayoffAssumptions,
  ): PayoffProjectionResult =>
    projectPayoffScenario(
      buildPayoffDebtInputs(database, assumptions.scenarioStartDate),
      assumptions,
    );

  const service: DebtMaintenanceService = {
    listDebts: (request) => {
      try {
        const parsed = listDebtsRequestSchema.parse(request);
        const effectiveDate = currentFinancialDate(now);
        return listDebtActivityRecords(database, parsed.includeArchived).map((record) =>
          mapSummary(database, record, effectiveDate),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    getDashboard: (request) => {
      try {
        getDashboardRequestSchema.parse(request);
        return createDashboard(
          database,
          listActiveDebtActivityRecords(database),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    getDebtReports: (request) => {
      try {
        return createDebtReports(database, request, now);
      } catch (error) {
        return normalizeError(error);
      }
    },

    selectWorkbookForImport: (request) => {
      try {
        selectWorkbookForImportRequestSchema.parse(request);

        if (!selectWorkbookPath) {
          throw new ApplicationServiceError(
            'database_unavailable',
            'Workbook selection is not available in this environment.',
          );
        }

        const workbookPath = selectWorkbookPath();

        if (!workbookPath) {
          return null;
        }

        const timestamp = currentUtcTimestampSchema(now());
        const parsedWorkbook = parseWorkbookForImport(workbookPath);
        const batchId = createId();
        const sheetMappings: ImportSheetMappingInsert[] = [];
        const stagedRows: StagedImportRowInsert[] = [];

        for (const sheet of parsedWorkbook.sheets) {
          const sheetMappingId = createId();
          sheetMappings.push({
            id: sheetMappingId,
            batchId,
            sourceSheetName: sheet.name,
            proposedRecordType: sheet.proposedRecordType,
            reviewStatus: 'needs_review',
            fieldMappingJson: JSON.stringify(sheet.fieldMapping),
            notes:
              sheet.proposedRecordType === 'unknown'
                ? 'Sheet type requires manual mapping review.'
                : null,
            createdAtUtc: timestamp,
            updatedAtUtc: timestamp,
          });

          for (const row of sheet.rows) {
            stagedRows.push({
              id: createId(),
              batchId,
              sheetMappingId,
              sourceSheetName: row.sheetName,
              sourceRowNumber: row.rowNumber,
              sourceCellReferencesJson: JSON.stringify(row.cellReferences),
              sourceDisplayedValuesJson: JSON.stringify(row.displayedValues),
              sourceFormulasJson: JSON.stringify(row.formulas),
              proposedRecordType: row.proposedRecordType,
              activityClassification: row.activityClassification,
              normalizedValuesJson: JSON.stringify(row.normalizedValues),
              validationMessagesJson: JSON.stringify(row.validationMessages),
              duplicateCandidateJson: row.duplicateCandidate,
              reconciliationExceptionJson: row.reconciliationException,
              reviewStatus: 'needs_review',
              reviewNotes: null,
              reviewedAtUtc: null,
              createdAtUtc: timestamp,
              updatedAtUtc: timestamp,
            });
          }
        }

        createImportBatchRecord(database, {
          batch: {
            id: batchId,
            sourceWorkbookName: parsedWorkbook.workbookName,
            sourceWorkbookFingerprint: parsedWorkbook.fingerprint,
            sourceWorkbookModifiedAtUtc: parsedWorkbook.modifiedAtUtc,
            status: 'open',
            importedAtUtc: timestamp,
            createdAtUtc: timestamp,
            updatedAtUtc: timestamp,
          },
          sheetMappings,
          stagedRows,
          audit: createImportAudit(
            createId(),
            batchId,
            'workbook_import_staged',
            'stage',
            timestamp,
            'Workbook rows were staged for review.',
            {
              workbookName: parsedWorkbook.workbookName,
              sheetCount: sheetMappings.length,
              stagedRowCount: stagedRows.length,
            },
          ),
        });

        return mapImportBatch(getImportBatchOrThrow(database, batchId));
      } catch (error) {
        return normalizeError(error);
      }
    },

    listImportBatches: () => {
      try {
        listImportBatchesRequestSchema.parse({});
        return listImportBatchRecords(database).map(mapImportBatchSummary);
      } catch (error) {
        return normalizeError(error);
      }
    },

    getImportBatch: (request) => {
      try {
        const parsed = getImportBatchRequestSchema.parse(request);
        return mapImportBatch(getImportBatchOrThrow(database, parsed.id));
      } catch (error) {
        return normalizeError(error);
      }
    },

    previewImportBatchPosting: (request) => {
      try {
        const parsed = previewImportBatchPostingRequestSchema.parse(request);
        return previewImportPosting(getImportBatchOrThrow(database, parsed.batchId));
      } catch (error) {
        return normalizeError(error);
      }
    },

    postImportBatch: (request) => {
      try {
        const parsed = postImportBatchRequestSchema.parse(request);
        const batch = getImportBatchOrThrow(database, parsed.batchId);
        const existingPreview = previewImportPosting(batch);

        if (existingPreview.alreadyPosted) {
          return {
            ...existingPreview,
            postedAtUtc:
              batch.postings[0]?.postedAtUtc ?? batch.batch.updatedAtUtc ?? null,
            createdRecordCount: batch.postings.length,
          };
        }

        if (existingPreview.exceptionRows > 0) {
          throw new ApplicationServiceError(
            'validation',
            'Resolve import posting exceptions before posting the batch.',
            Object.fromEntries(
              existingPreview.rowResults
                .filter((row) => row.validationMessages.length > 0)
                .map((row) => [`row.${row.stagedRowId}`, row.validationMessages]),
            ),
          );
        }

        if (existingPreview.postableRows === 0) {
          throw new ApplicationServiceError(
            'validation',
            'Approve at least one valid staged row before posting.',
          );
        }

        const timestamp = currentUtcTimestampSchema(now());
        const built = buildImportPostingRecords(
          batch,
          createId,
          timestamp,
          listDebtRecords(database, true),
        );

        postImportBatchRecord(database, {
          batchId: parsed.batchId,
          updatedAtUtc: timestamp,
          debts: built.debts,
          terms: built.terms,
          transactions: built.transactions,
          allocations: built.allocations,
          snapshots: built.snapshots,
          postings: built.postings,
          auditInputs: built.audits,
        });

        const postedBatch = getImportBatchOrThrow(database, parsed.batchId);
        const postedPreview = previewImportPosting(postedBatch);
        return {
          ...postedPreview,
          postedAtUtc: timestamp,
          createdRecordCount: built.postings.length,
        };
      } catch (error) {
        return normalizeError(error);
      }
    },

    updateImportSheetMapping: (request) => {
      try {
        const parsed = updateImportSheetMappingRequestSchema.parse(request);
        const timestamp = currentUtcTimestampSchema(now());

        updateImportSheetMappingReview(database, {
          id: parsed.mappingId,
          batchId: parsed.batchId,
          proposedRecordType: parsed.proposedRecordType,
          reviewStatus: parsed.reviewStatus,
          fieldMappingJson: JSON.stringify(parsed.fieldMapping),
          notes: nullableText(parsed.notes),
          updatedAtUtc: timestamp,
          audit: createImportAudit(
            createId(),
            parsed.batchId,
            'import_sheet_mapping_reviewed',
            'review_mapping',
            timestamp,
            'Import sheet mapping review status was updated.',
            {
              mappingId: parsed.mappingId,
              reviewStatus: parsed.reviewStatus,
              proposedRecordType: parsed.proposedRecordType,
            },
          ),
        });

        return mapImportBatch(getImportBatchOrThrow(database, parsed.batchId));
      } catch (error) {
        return normalizeError(error);
      }
    },

    updateStagedImportRowReview: (request) => {
      try {
        const parsed = updateStagedImportRowReviewRequestSchema.parse(request);
        const timestamp = currentUtcTimestampSchema(now());
        const reviewedAtUtc = parsed.reviewStatus === 'needs_review' ? null : timestamp;

        updateStagedImportRowReview(database, {
          id: parsed.rowId,
          batchId: parsed.batchId,
          proposedRecordType: parsed.proposedRecordType,
          activityClassification: parsed.activityClassification,
          reviewStatus: parsed.reviewStatus,
          normalizedValuesJson: JSON.stringify(parsed.normalizedValues),
          reviewNotes: nullableText(parsed.reviewNotes),
          reviewedAtUtc,
          updatedAtUtc: timestamp,
          audit: createImportAudit(
            createId(),
            parsed.batchId,
            'staged_import_row_reviewed',
            'review_row',
            timestamp,
            'Staged import row review status was updated.',
            {
              rowId: parsed.rowId,
              reviewStatus: parsed.reviewStatus,
              proposedRecordType: parsed.proposedRecordType,
              activityClassification: parsed.activityClassification,
            },
          ),
        });

        return mapImportBatch(getImportBatchOrThrow(database, parsed.batchId));
      } catch (error) {
        return normalizeError(error);
      }
    },

    listPayoffScenarios: (request) => {
      try {
        const parsed = listPayoffScenariosRequestSchema.parse(request);
        return listPayoffScenarioRecords(database, parsed.includeArchived).map(
          mapPayoffScenario,
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    getPayoffScenario: (request) => {
      try {
        const parsed = getPayoffScenarioRequestSchema.parse(request);
        return mapPayoffScenario(getScenarioOrThrow(parsed.id));
      } catch (error) {
        return normalizeError(error);
      }
    },

    createPayoffScenario: (request) => {
      try {
        const parsed = createPayoffScenarioRequestSchema.parse(request);
        const timestamp = currentUtcTimestampSchema(now());
        const scenarioId = createId();
        const assumptions = buildPayoffAssumptions(parsed);

        if (
          assumptions.strategy === 'custom' &&
          assumptions.customPriority.length === 0
        ) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              customPriority: [
                'Custom payoff priority requires at least one debt identifier.',
              ],
            },
          );
        }

        const result = calculatePayoffResult(assumptions);
        const scenario: PayoffScenarioInsert = {
          id: scenarioId,
          name: parsed.name,
          strategy: parsed.strategy,
          status: 'active',
          scenarioStartDate: assumptions.scenarioStartDate,
          extraMonthlyPaymentCents: assumptions.extraMonthlyPaymentCents,
          customPriorityJson: JSON.stringify(assumptions.customPriority),
          assumptionsJson: JSON.stringify(assumptions),
          resultJson: JSON.stringify(result),
          calculationEngineVersion: PAYOFF_ENGINE_VERSION,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
          archivedAtUtc: null,
        };

        createPayoffScenarioRecord(
          database,
          scenario,
          createPayoffScenarioAudit(
            createId(),
            scenarioId,
            'payoff_scenario_created',
            'create',
            timestamp,
            'Payoff scenario was created from posted activity and saved assumptions.',
            {
              strategy: parsed.strategy,
              calculationEngineVersion: PAYOFF_ENGINE_VERSION,
            },
          ),
        );

        return mapPayoffScenario(getScenarioOrThrow(scenarioId));
      } catch (error) {
        return normalizeError(error);
      }
    },

    rerunPayoffScenario: (request) => {
      try {
        const parsed = rerunPayoffScenarioRequestSchema.parse(request);
        const existing = getScenarioOrThrow(parsed.id);

        if (existing.status === 'archived') {
          throw new ApplicationServiceError(
            'conflict',
            'Archived payoff scenarios cannot be rerun.',
          );
        }

        const timestamp = nextTimestamp(now, existing.updatedAtUtc);
        const assumptions = parsePayoffAssumptions(existing.assumptionsJson);
        const result = calculatePayoffResult(assumptions);

        updatePayoffScenarioResultRecord(database, {
          id: parsed.id,
          expectedUpdatedAtUtc: existing.updatedAtUtc,
          resultJson: JSON.stringify(result),
          calculationEngineVersion: PAYOFF_ENGINE_VERSION,
          updatedAtUtc: timestamp,
          audit: createPayoffScenarioAudit(
            createId(),
            parsed.id,
            'payoff_scenario_rerun',
            'rerun',
            timestamp,
            'Payoff scenario was rerun using its saved assumptions and current posted activity through the start date.',
            { calculationEngineVersion: PAYOFF_ENGINE_VERSION },
          ),
        });

        return mapPayoffScenario(getScenarioOrThrow(parsed.id));
      } catch (error) {
        return normalizeError(error);
      }
    },

    archivePayoffScenario: (request) => {
      try {
        const parsed = archivePayoffScenarioRequestSchema.parse(request);
        const existing = getScenarioOrThrow(parsed.id);
        const timestamp = nextTimestamp(now, existing.updatedAtUtc);

        if (existing.status === 'archived') {
          return mapPayoffScenario(existing);
        }

        updatePayoffScenarioArchiveState(database, {
          id: parsed.id,
          expectedUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          status: 'archived',
          archivedAtUtc: timestamp,
          updatedAtUtc: timestamp,
          audit: createPayoffScenarioAudit(
            createId(),
            parsed.id,
            'payoff_scenario_archived',
            'archive',
            timestamp,
            'Payoff scenario was archived.',
          ),
        });

        return mapPayoffScenario(getScenarioOrThrow(parsed.id));
      } catch (error) {
        return normalizeError(error);
      }
    },

    getDebt: (request) => {
      try {
        const parsed = getDebtRequestSchema.parse(request);
        return mapDetail(
          database,
          getRecordOrThrow(parsed.id),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    createDebt: (request) => {
      try {
        const parsed = createDebtRequestSchema.parse(request);
        const debtId = createId();
        const termId = createId();
        const timestamp = nextTimestamp(now);
        const originationDate = ensureCalendarDate(
          'debt.originationDate',
          parsed.debt.originationDate,
        );
        const maturityDate = parsed.debt.maturityDate
          ? ensureCalendarDate('debt.maturityDate', parsed.debt.maturityDate)
          : null;
        const termStart = ensureCalendarDate(
          'initialTerm.effectiveStartDate',
          parsed.initialTerm.effectiveStartDate,
        );

        if (maturityDate && maturityDate < originationDate) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'debt.maturityDate': [
                'Maturity date cannot precede the origination date.',
              ],
            },
          );
        }

        if (termStart < originationDate) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'initialTerm.effectiveStartDate': [
                'Initial terms cannot begin before the debt origination date.',
              ],
            },
          );
        }

        const debt: DebtInsert = {
          id: debtId,
          name: parsed.debt.name,
          creditor: parsed.debt.creditor,
          ownerEntity: parsed.debt.ownerEntity || 'Personal',
          debtType: parsed.debt.debtType,
          purpose: parsed.debt.purpose,
          status: parsed.debt.status,
          originalPrincipalCents: convertMoney(
            'debt.originalPrincipal',
            parsed.debt.originalPrincipal,
          ),
          originationDate,
          maturityDate,
          minimumPaymentCents: convertMoney(
            'initialTerm.requiredPayment',
            parsed.initialTerm.requiredPayment,
          ),
          paymentFrequency: parsed.initialTerm.paymentFrequency,
          creditLimitCents: validateCreditLimit(
            parsed.debt.debtType,
            parsed.debt.creditLimit,
          ),
          collateralDescription: nullableText(parsed.debt.collateralDescription),
          taxCategory: parsed.debt.taxCategory,
          deductiblePercentageBps: convertPercentage(
            'debt.deductiblePercentage',
            parsed.debt.deductiblePercentage,
          ),
          notes: nullableText(parsed.debt.notes),
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
          archivedAtUtc: null,
        };
        const interestRateMicros = convertRate(
          'initialTerm.annualInterestRatePercent',
          parsed.initialTerm.annualInterestRatePercent,
        );

        if (
          parsed.initialTerm.interestRateType === 'zero' &&
          interestRateMicros !== 0
        ) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'initialTerm.annualInterestRatePercent': [
                'A zero-rate term must use a 0% annual rate.',
              ],
            },
          );
        }

        const term: DebtTermInsert = {
          id: termId,
          debtId,
          effectiveStartDate: termStart,
          effectiveEndDate: null,
          interestRateType: parsed.initialTerm.interestRateType,
          interestRateMicros,
          dayCountConvention: parsed.initialTerm.dayCountConvention,
          calculationConvention: parsed.initialTerm.calculationConvention,
          requiredPaymentCents: convertMoney(
            'initialTerm.requiredPayment',
            parsed.initialTerm.requiredPayment,
          ),
          paymentFrequency: parsed.initialTerm.paymentFrequency,
          notes: nullableText(parsed.initialTerm.notes),
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };

        createDebtAndInitialTerm(database, debt, term, [
          createDebtAudit(
            createId(),
            debtId,
            'debt_created',
            'create',
            timestamp,
            'Debt record was created.',
          ),
          createDebtAudit(
            createId(),
            debtId,
            'debt_term_created',
            'create_term',
            timestamp,
            'Initial effective-dated debt terms were created.',
            ['effectiveStartDate'],
          ),
        ]);

        return mapDetail(database, getRecordOrThrow(debtId), currentFinancialDate(now));
      } catch (error) {
        return normalizeError(error);
      }
    },

    updateDebt: (request) => {
      try {
        const parsed = updateDebtRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.id);

        if (existing.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before editing it.',
          );
        }

        const maturityDate = parsed.changes.maturityDate
          ? ensureCalendarDate('changes.maturityDate', parsed.changes.maturityDate)
          : null;

        if (maturityDate && maturityDate < existing.debt.originationDate) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'changes.maturityDate': [
                'Maturity date cannot precede the origination date.',
              ],
            },
          );
        }

        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        const changes = {
          name: parsed.changes.name,
          creditor: parsed.changes.creditor,
          ownerEntity: parsed.changes.ownerEntity,
          debtType: parsed.changes.debtType,
          purpose: parsed.changes.purpose,
          status: parsed.changes.status,
          maturityDate,
          creditLimitCents: validateCreditLimit(
            parsed.changes.debtType,
            parsed.changes.creditLimit,
          ),
          collateralDescription: nullableText(parsed.changes.collateralDescription),
          taxCategory: parsed.changes.taxCategory,
          deductiblePercentageBps: convertPercentage(
            'changes.deductiblePercentage',
            parsed.changes.deductiblePercentage,
          ),
          notes: nullableText(parsed.changes.notes),
          updatedAtUtc: timestamp,
        };
        const changedFields = Object.entries(changes)
          .filter(
            ([field, value]) =>
              field !== 'updatedAtUtc' &&
              existing.debt[field as keyof DebtRecord] !== value,
          )
          .map(([field]) => field);

        if (changedFields.length === 0) {
          return mapDetail(database, existing, currentFinancialDate(now));
        }

        updateDebtDescriptiveRecord(
          database,
          parsed.id,
          parsed.expectedUpdatedAtUtc,
          changes,
          createDebtAudit(
            createId(),
            parsed.id,
            'debt_updated',
            'update',
            timestamp,
            'Debt descriptive or administrative fields were updated.',
            changedFields,
          ),
        );

        return mapDetail(
          database,
          getRecordOrThrow(parsed.id),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    addDebtTerm: (request) => {
      try {
        const parsed = addDebtTermRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.debtId);

        if (existing.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before adding a term.',
          );
        }

        const latestTerm = existing.terms.at(-1);

        if (!latestTerm) {
          throw new ApplicationServiceError(
            'internal',
            'This debt is missing its required initial terms record.',
          );
        }

        const startDate = ensureCalendarDate(
          'term.effectiveStartDate',
          parsed.term.effectiveStartDate,
        );

        if (startDate <= latestTerm.effectiveStartDate) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'term.effectiveStartDate': [
                'A new term must begin after the latest historical term.',
              ],
            },
          );
        }

        if (latestTerm.effectiveEndDate && startDate <= latestTerm.effectiveEndDate) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'term.effectiveStartDate': [
                'The new effective date overlaps the latest term period.',
              ],
            },
          );
        }

        const interestRateMicros = convertRate(
          'term.annualInterestRatePercent',
          parsed.term.annualInterestRatePercent,
        );

        if (parsed.term.interestRateType === 'zero' && interestRateMicros !== 0) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'term.annualInterestRatePercent': [
                'A zero-rate term must use a 0% annual rate.',
              ],
            },
          );
        }

        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        const term: DebtTermInsert = {
          id: createId(),
          debtId: parsed.debtId,
          effectiveStartDate: startDate,
          effectiveEndDate: null,
          interestRateType: parsed.term.interestRateType,
          interestRateMicros,
          dayCountConvention: parsed.term.dayCountConvention,
          calculationConvention: parsed.term.calculationConvention,
          requiredPaymentCents: convertMoney(
            'term.requiredPayment',
            parsed.term.requiredPayment,
          ),
          paymentFrequency: parsed.term.paymentFrequency,
          notes: nullableText(parsed.term.notes),
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };

        appendDebtTermRecord(database, {
          debtId: parsed.debtId,
          expectedDebtUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          priorTermId: latestTerm.id,
          expectedPriorEndDate: latestTerm.effectiveEndDate,
          priorEndDate:
            latestTerm.effectiveEndDate === null
              ? previousFinancialDate(startDate)
              : latestTerm.effectiveEndDate,
          debtUpdatedAtUtc: timestamp,
          term,
          audit: createDebtAudit(
            createId(),
            parsed.debtId,
            'debt_term_created',
            'create_term',
            timestamp,
            'A new effective-dated debt term period was created.',
            ['effectiveStartDate'],
          ),
        });

        return mapDetail(
          database,
          getRecordOrThrow(parsed.debtId),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    createDebtTransaction: (request) => {
      try {
        const parsed = createDebtTransactionRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.debtId);

        if (existing.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before recording activity.',
          );
        }

        const effectiveDate = ensureNotBefore(
          'transaction.effectiveDate',
          ensureCalendarDate(
            'transaction.effectiveDate',
            parsed.transaction.effectiveDate,
          ),
          existing.debt.originationDate,
        );
        const postingDate = ensureNotBefore(
          'transaction.postingDate',
          ensureCalendarDate('transaction.postingDate', parsed.transaction.postingDate),
          existing.debt.originationDate,
        );

        if (postingDate < effectiveDate) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'transaction.postingDate': [
                'Posting date cannot precede the effective date.',
              ],
            },
          );
        }

        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        const transactionId = createId();
        const direction = manualTransactionDirection(
          parsed.transaction.transactionType,
        );
        const transaction: DebtTransactionInsert = {
          id: transactionId,
          debtId: parsed.debtId,
          transactionType: parsed.transaction.transactionType,
          effectiveDate,
          postingDate,
          totalAmountCents: convertManualTransactionAmount(
            'transaction.totalAmount',
            parsed.transaction.totalAmount,
            direction,
          ),
          status: 'posted',
          description:
            nullableText(parsed.transaction.description) ??
            `Manual ${parsed.transaction.transactionType.replaceAll('_', ' ')} recorded.`,
          sourceType: parsed.transaction.sourceType,
          sourceReference: nullableText(parsed.transaction.sourceReference),
          reversalOfTransactionId: null,
          supersedesTransactionId: null,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };
        const allocations = buildManualTransactionAllocations(
          createId,
          transactionId,
          timestamp,
          'transaction.allocations',
          parsed.transaction.allocations,
          direction,
        );

        const signErrors = validateTransactionSignConvention(transaction, allocations);

        if (signErrors.length > 0) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            postedTransactionFieldErrors(signErrors),
          );
        }

        createPostedTransactionRecord(database, transaction, allocations, [
          createTransactionAudit(
            createId(),
            transactionId,
            'transaction_recorded',
            'create',
            timestamp,
            'Posted transaction was recorded.',
            {
              transactionType: transaction.transactionType,
              sourceType: transaction.sourceType,
              allocationTypes: allocations.map(
                (allocation) => allocation.allocationType,
              ),
            },
          ),
        ]);

        return mapDetail(
          database,
          getRecordOrThrow(parsed.debtId),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    reverseDebtTransaction: (request) => {
      try {
        const parsed = reverseDebtTransactionRequestSchema.parse(request);
        const original = getDebtTransactionRecord(database, parsed.id);

        if (!original) {
          throw new ApplicationServiceError('not_found', 'Transaction was not found.');
        }

        const debt = getRecordOrThrow(original.debtId);

        if (debt.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before reversing activity.',
          );
        }

        const reversalDate = ensureNotBefore(
          'reversalDate',
          ensureCalendarDate('reversalDate', parsed.reversalDate),
          debt.debt.originationDate,
        );
        const timestamp = nextTimestamp(now, original.updatedAtUtc);
        reversePostedTransaction(database, {
          originalTransactionId: original.id,
          expectedUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          effectiveDate: reversalDate,
          postingDate: reversalDate,
          description: `Reversal of transaction ${original.id}.`,
          occurredAtUtc: timestamp,
        });

        return mapDetail(
          database,
          getRecordOrThrow(original.debtId),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    createBalanceSnapshot: (request) => {
      try {
        const parsed = createBalanceSnapshotRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.debtId);

        if (existing.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before recording a balance snapshot.',
          );
        }

        const effectiveDate = ensureNotBefore(
          'snapshot.effectiveDate',
          ensureCalendarDate('snapshot.effectiveDate', parsed.snapshot.effectiveDate),
          existing.debt.originationDate,
        );
        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        const snapshotId = createId();

        createBalanceSnapshotRecord(
          database,
          {
            id: snapshotId,
            debtId: parsed.debtId,
            effectiveDate,
            confirmedBalanceCents: convertMoney(
              'snapshot.confirmedBalance',
              parsed.snapshot.confirmedBalance,
            ),
            sourceType: parsed.snapshot.sourceType,
            sourceReference: nullableText(parsed.snapshot.sourceReference),
            notes: nullableText(parsed.snapshot.notes),
            createdAtUtc: timestamp,
            updatedAtUtc: timestamp,
          },
          createSnapshotAudit(
            createId(),
            snapshotId,
            'balance_snapshot_recorded',
            'create',
            timestamp,
            'Confirmed balance snapshot was recorded.',
            {
              sourceType: parsed.snapshot.sourceType,
            },
          ),
        );

        return mapDetail(
          database,
          getRecordOrThrow(parsed.debtId),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    createBalanceReconciliation: (request) => {
      try {
        const parsed = createBalanceReconciliationRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.debtId);

        if (existing.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before recording a reconciliation.',
          );
        }

        const statementDate = ensureNotBefore(
          'reconciliation.statementDate',
          ensureCalendarDate(
            'reconciliation.statementDate',
            parsed.reconciliation.statementDate,
          ),
          existing.debt.originationDate,
        );
        const statementEndingBalanceCents = convertMoney(
          'reconciliation.statementEndingBalance',
          parsed.reconciliation.statementEndingBalance,
        );
        const applicationCalculatedBalanceCents = calculateLedgerBalanceThroughDate(
          database,
          parsed.debtId,
          statementDate,
        );
        const calculatedDifferenceCents =
          statementEndingBalanceCents - applicationCalculatedBalanceCents;

        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        const reconciliationId = createId();
        const approvedAdjustment = parsed.reconciliation.approvedAdjustment ?? null;
        const supersedesReconciliationId =
          parsed.reconciliation.supersedesReconciliationId ?? null;
        const supersededReconciliation = supersedesReconciliationId
          ? existing.balanceReconciliations.find(
              (reconciliation) => reconciliation.id === supersedesReconciliationId,
            )
          : null;

        if (supersedesReconciliationId) {
          if (!supersededReconciliation) {
            throw new ApplicationServiceError(
              'not_found',
              'Reconciliation to correct was not found.',
            );
          }

          if (supersededReconciliation.lifecycleStatus !== 'current') {
            throw new ApplicationServiceError(
              'conflict',
              'Only the current reconciliation can be corrected.',
            );
          }

          if (
            supersededReconciliation.debtId !== parsed.debtId ||
            supersededReconciliation.statementDate !== statementDate
          ) {
            throw new ApplicationServiceError(
              'validation',
              'Review the highlighted fields.',
              {
                'reconciliation.statementDate': [
                  'Corrected reconciliation must use the same debt and statement date.',
                ],
              },
            );
          }
        } else {
          const existingCurrent = existing.balanceReconciliations.find(
            (reconciliation) =>
              reconciliation.statementDate === statementDate &&
              reconciliation.lifecycleStatus === 'current',
          );

          if (existingCurrent) {
            throw new ApplicationServiceError(
              'conflict',
              'A current reconciliation already exists for this statement date. Void or correct it before recording a replacement.',
            );
          }
        }
        let status: BalanceReconciliationInput['reconciliationStatus'] =
          calculatedDifferenceCents === 0 ? 'reconciled' : 'exception';
        let adjustment: {
          readonly transaction: DebtTransactionInsert;
          readonly allocations: readonly TransactionAllocationInsert[];
        } | null = null;
        let approvedAdjustmentTransactionId: string | null = null;

        if (approvedAdjustment) {
          if (calculatedDifferenceCents === 0) {
            throw new ApplicationServiceError(
              'validation',
              'Review the highlighted fields.',
              {
                'reconciliation.approvedAdjustment.totalAmount': [
                  'An approved adjustment is not needed when the calculated difference is zero.',
                ],
              },
            );
          }
          const adjustmentTransactionId = createId();
          const adjustmentTotalCents = convertSignedMoney(
            'reconciliation.approvedAdjustment.totalAmount',
            approvedAdjustment.totalAmount,
          );

          if (adjustmentTotalCents !== calculatedDifferenceCents) {
            throw new ApplicationServiceError(
              'validation',
              'Review the highlighted fields.',
              {
                'reconciliation.approvedAdjustment.totalAmount': [
                  'Approved adjustment must equal the calculated reconciliation difference.',
                ],
              },
            );
          }

          adjustment = {
            transaction: {
              id: adjustmentTransactionId,
              debtId: parsed.debtId,
              transactionType: 'approved_reconciliation_adjustment',
              effectiveDate: statementDate,
              postingDate: statementDate,
              totalAmountCents: adjustmentTotalCents,
              status: 'posted',
              description:
                nullableText(approvedAdjustment.description) ??
                'Approved reconciliation adjustment.',
              sourceType: 'reconciliation',
              sourceReference: reconciliationId,
              reversalOfTransactionId: null,
              supersedesTransactionId: null,
              createdAtUtc: timestamp,
              updatedAtUtc: timestamp,
            },
            allocations: buildAllocations(
              createId,
              adjustmentTransactionId,
              timestamp,
              'reconciliation.approvedAdjustment.allocations',
              approvedAdjustment.allocations,
            ),
          };
          approvedAdjustmentTransactionId = adjustmentTransactionId;
          status = 'reconciled_with_adjustment';

          const signErrors = validateTransactionSignConvention(
            adjustment.transaction,
            adjustment.allocations,
          );

          if (signErrors.length > 0) {
            throw new ApplicationServiceError(
              'validation',
              'Review the highlighted fields.',
              reconciliationAdjustmentFieldErrors(signErrors),
            );
          }
        }

        const reconciliation: BalanceReconciliationInput = {
          id: reconciliationId,
          debtId: parsed.debtId,
          statementDate,
          statementEndingBalanceCents,
          applicationCalculatedBalanceCents,
          reconciliationStatus: status,
          explanation: nullableText(parsed.reconciliation.explanation ?? null),
          approvedAdjustmentTransactionId,
          sourceReference: nullableText(parsed.reconciliation.sourceReference ?? null),
          supportingNotes: nullableText(parsed.reconciliation.supportingNotes ?? null),
          lifecycleStatus: 'current',
          supersedesReconciliationId,
          supersededByReconciliationId: null,
          voidedAtUtc: null,
          supersededAtUtc: null,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };
        const snapshotId = createId();

        createBalanceReconciliationRecord(database, {
          reconciliation,
          snapshot: {
            id: snapshotId,
            debtId: parsed.debtId,
            effectiveDate: statementDate,
            confirmedBalanceCents: statementEndingBalanceCents,
            sourceType: 'statement',
            sourceReference: `reconciliation:${reconciliationId}`,
            notes: nullableText(parsed.reconciliation.supportingNotes ?? null),
            createdAtUtc: timestamp,
            updatedAtUtc: timestamp,
          },
          adjustment: adjustment ?? undefined,
          supersedes: supersededReconciliation
            ? {
                id: supersededReconciliation.id,
                expectedUpdatedAtUtc: supersededReconciliation.updatedAtUtc,
                supersededAtUtc: timestamp,
              }
            : undefined,
          auditInputs: [
            ...(adjustment
              ? [
                  createTransactionAudit(
                    createId(),
                    adjustment.transaction.id,
                    'approved_reconciliation_adjustment_recorded',
                    'create',
                    timestamp,
                    'Approved reconciliation adjustment was posted.',
                    {
                      reconciliationId,
                      allocationTypes: adjustment.allocations.map(
                        (allocation) => allocation.allocationType,
                      ),
                    },
                  ),
                ]
              : []),
            createReconciliationAudit(
              createId(),
              reconciliationId,
              'balance_reconciliation_recorded',
              'create',
              timestamp,
              'Balance reconciliation was recorded.',
              {
                reconciliationStatus: status,
                hasApprovedAdjustment: Boolean(adjustment),
              },
            ),
            createSnapshotAudit(
              createId(),
              snapshotId,
              'balance_snapshot_recorded',
              'create',
              timestamp,
              'Confirmed balance snapshot was recorded from reconciliation support.',
              {
                sourceType: 'statement',
                reconciliationId,
              },
            ),
          ],
        });

        return mapDetail(
          database,
          getRecordOrThrow(parsed.debtId),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    voidBalanceReconciliation: (request) => {
      try {
        const parsed = voidBalanceReconciliationRequestSchema.parse(request);
        const record = listDebtActivityRecords(database, true)
          .flatMap((debt) => debt.balanceReconciliations)
          .find((reconciliation) => reconciliation.id === parsed.id);

        if (!record) {
          throw new ApplicationServiceError(
            'not_found',
            'Reconciliation was not found.',
          );
        }

        const debt = getRecordOrThrow(record.debtId);

        if (debt.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before voiding a reconciliation.',
          );
        }

        const timestamp = nextTimestamp(now, record.updatedAtUtc);
        voidBalanceReconciliationRecord(database, {
          id: parsed.id,
          expectedUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          voidedAtUtc: timestamp,
          audit: createReconciliationAudit(
            createId(),
            parsed.id,
            'balance_reconciliation_voided',
            'void',
            timestamp,
            'Balance reconciliation was voided and preserved for history.',
            {
              statementDate: record.statementDate,
            },
          ),
        });

        return mapDetail(
          database,
          getRecordOrThrow(record.debtId),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    archiveDebt: (request) => {
      try {
        const parsed = archiveDebtRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.id);
        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);

        setDebtArchivedState(
          database,
          parsed.id,
          parsed.expectedUpdatedAtUtc,
          timestamp,
          createDebtAudit(
            createId(),
            parsed.id,
            'debt_archived',
            'archive',
            timestamp,
            'Debt record was archived.',
          ),
        );

        return mapDetail(
          database,
          getRecordOrThrow(parsed.id),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    restoreDebt: (request) => {
      try {
        const parsed = restoreDebtRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.id);
        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);

        setDebtArchivedState(
          database,
          parsed.id,
          parsed.expectedUpdatedAtUtc,
          null,
          createDebtAudit(
            createId(),
            parsed.id,
            'debt_restored',
            'restore',
            timestamp,
            'Debt record was restored.',
          ),
        );

        return mapDetail(
          database,
          getRecordOrThrow(parsed.id),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },
  };

  return service;
};
