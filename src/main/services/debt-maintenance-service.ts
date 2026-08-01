import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type {
  AddDebtTermRequest,
  ArchivePayoffScenarioRequest,
  CreateBalanceReconciliationRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  EditDebtTransactionRequest,
  ArchiveDebtRequest,
  CreateDebtRequest,
  CreatePayoffScenarioRequest,
  DashboardDto,
  DeleteDebtPermanentlyRequest,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  GetDashboardRequest,
  GetDebtReportsRequest,
  GetDebtRequest,
  GetPayoffScenarioRequest,
  ListDebtsRequest,
  ListPayoffScenariosRequest,
  PayoffScenarioDto,
  RerunPayoffScenarioRequest,
  ReverseDebtTransactionRequest,
  RestoreDebtRequest,
  UpdateDebtRequest,
  VoidBalanceReconciliationRequest,
  VoidDebtTransactionRequest,
} from '../../shared/debt-contracts';
import {
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  archivePayoffScenarioRequestSchema,
  createBalanceReconciliationRequestSchema,
  createBalanceSnapshotRequestSchema,
  createDebtTransactionRequestSchema,
  editDebtTransactionRequestSchema,
  createDebtRequestSchema,
  createPayoffScenarioRequestSchema,
  deleteDebtPermanentlyRequestSchema,
  getDashboardRequestSchema,
  getDebtReportsRequestSchema,
  getDebtRequestSchema,
  getPayoffScenarioRequestSchema,
  listPayoffScenariosRequestSchema,
  listDebtsRequestSchema,
  rerunPayoffScenarioRequestSchema,
  reverseDebtTransactionRequestSchema,
  restoreDebtRequestSchema,
  updateDebtRequestSchema,
  voidBalanceReconciliationRequestSchema,
  voidDebtTransactionRequestSchema,
} from '../../shared/debt-contracts';
import { ALLOCATION_TYPES } from '../../shared/debt-options';
import { REPORTING_HISTORY_START_DATE } from '../../shared/reporting-constants';
import type { AppDatabase } from '../database/connection';
import {
  calculateLedgerBalanceThroughDate,
  createPayoffScenarioRecord,
  createBalanceReconciliationRecord,
  createBalanceSnapshotRecord,
  createPostedTransactionRecord,
  deleteDebtPermanentlyRecord,
  editPostedTransactionRecord,
  appendDebtTermRecord,
  getDebtActivityRecord,
  getDebtRecord,
  getDebtTransactionRecord,
  getPayoffScenarioRecord,
  createDebtAndInitialTerm,
  listActiveDebtActivityRecords,
  listDebtActivityRecords,
  listPayoffScenarioRecords,
  previewPermanentDebtDeletion,
  RepositoryConflictError,
  RepositoryNotFoundError,
  setDebtArchivedState,
  updatePayoffScenarioArchiveState,
  updatePayoffScenarioResultRecord,
  updateDebtDescriptiveRecord,
  voidBalanceReconciliationRecord,
  type DebtRecord,
  type BalanceReconciliationRecord,
  type DebtTransactionWithAllocationsRecord,
  type DebtTermRecord,
  type DebtWithTermsRecord,
  type DebtWithActivityRecord,
  type PayoffScenarioRecord,
} from '../database/debt-maintenance-repository';
import { reversePostedTransaction } from '../database/repository';
import type {
  AuditEventInsert,
  BalanceReconciliationInput,
  DebtInsert,
  DebtTermInsert,
  DebtTransactionInsert,
  PayoffScenarioInsert,
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

export interface DebtMaintenanceService {
  listDebts(request: ListDebtsRequest): readonly DebtSummaryDto[];
  getDashboard(request: GetDashboardRequest): DashboardDto;
  getDebtReports(request: GetDebtReportsRequest): DebtReportsDto;
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
  editDebtTransaction(request: EditDebtTransactionRequest): DebtDetailDto;
  reverseDebtTransaction(request: ReverseDebtTransactionRequest): DebtDetailDto;
  voidDebtTransaction(request: VoidDebtTransactionRequest): DebtDetailDto;
  createBalanceSnapshot(request: CreateBalanceSnapshotRequest): DebtDetailDto;
  createBalanceReconciliation(
    request: CreateBalanceReconciliationRequest,
  ): DebtDetailDto;
  voidBalanceReconciliation(request: VoidBalanceReconciliationRequest): DebtDetailDto;
  archiveDebt(request: ArchiveDebtRequest): DebtDetailDto;
  restoreDebt(request: RestoreDebtRequest): DebtDetailDto;
  deleteDebtPermanently(
    request: DeleteDebtPermanentlyRequest,
    backupId: string,
  ): {
    readonly deletedDebtId: string;
    readonly deletedDebtName: string;
    readonly backupId: string;
  };
}

export interface DebtMaintenanceServiceDependencies {
  readonly database: AppDatabase;
  readonly createId?: () => string;
  readonly now?: () => string;
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

const validateRefinanceLinks = (
  database: AppDatabase,
  debtId: string,
  fieldPrefix: string,
  refinancedFromDebtId: string | null,
  refinancedIntoDebtId: string | null,
): void => {
  if (refinancedFromDebtId === debtId || refinancedIntoDebtId === debtId) {
    throw new ApplicationServiceError('validation', 'Review the highlighted fields.', {
      [`${fieldPrefix}.refinancedFromDebtId`]: [
        'A debt cannot refinance from or into itself.',
      ],
    });
  }
  if (
    refinancedFromDebtId &&
    refinancedIntoDebtId &&
    refinancedFromDebtId === refinancedIntoDebtId
  ) {
    throw new ApplicationServiceError('validation', 'Review the highlighted fields.', {
      [`${fieldPrefix}.refinancedIntoDebtId`]: [
        'Prior and replacement refinance debts must be different.',
      ],
    });
  }
  for (const [field, linkedDebtId] of [
    ['refinancedFromDebtId', refinancedFromDebtId],
    ['refinancedIntoDebtId', refinancedIntoDebtId],
  ] as const) {
    if (linkedDebtId && !getDebtRecord(database, linkedDebtId)) {
      throw new ApplicationServiceError(
        'validation',
        'Review the highlighted fields.',
        {
          [`${fieldPrefix}.${field}`]: ['Linked refinance debt was not found.'],
        },
      );
    }
  }
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

const currentActualTransactionEntriesThrough = (
  record: DebtWithActivityRecord,
  effectiveDate: string,
): readonly DebtWithActivityRecord['transactions'][number][] => {
  const originalStatuses = new Map(
    record.transactions.map((entry) => [
      entry.transaction.id,
      entry.transaction.status,
    ]),
  );

  return record.transactions.filter((entry) => {
    if (entry.transaction.effectiveDate > effectiveDate) return false;
    if (entry.transaction.status === 'superseded') return false;
    if (
      entry.transaction.transactionType === 'reversal' &&
      entry.transaction.reversalOfTransactionId
    ) {
      const originalStatus = originalStatuses.get(
        entry.transaction.reversalOfTransactionId,
      );
      if (originalStatus === 'superseded') return false;
    }

    return true;
  });
};

const calculateEscrowBalanceFromActivity = (
  record: DebtWithActivityRecord,
  effectiveDate: string,
): number => {
  const currentEntries = currentActualTransactionEntriesThrough(record, effectiveDate);
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

  const balance = currentEntries.reduce((total, entry) => {
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
  const debtName = (id: string | null): string | null =>
    id ? (getDebtRecord(database, id)?.debt.name ?? null) : null;

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
    calculatedEscrowBalance: centsToDollars(
      calculateEscrowBalanceFromActivity(record, effectiveDate),
    ),
    originationDate: debt.originationDate,
    maturityDate: debt.maturityDate,
    initialTerm: mapTerm(requireInitialTerm(record)),
    currentTerm: mapTerm(currentTermForDate(record.terms, effectiveDate)),
    archivedAtUtc: debt.archivedAtUtc,
    financingChainName: debt.financingChainName,
    refinancedFromDebtId: debt.refinancedFromDebtId,
    refinancedFromDebtName: debtName(debt.refinancedFromDebtId),
    refinancedIntoDebtId: debt.refinancedIntoDebtId,
    refinancedIntoDebtName: debtName(debt.refinancedIntoDebtId),
    refinanceDate: debt.refinanceDate,
  };
};

const mapDetail = (
  database: AppDatabase,
  record: DebtWithActivityRecord,
  effectiveDate: string,
): DebtDetailDto => {
  const debt = record.debt;
  const debtName = (id: string | null): string | null =>
    id ? (getDebtRecord(database, id)?.debt.name ?? null) : null;

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
    financingChainName: debt.financingChainName,
    refinancedFromDebtId: debt.refinancedFromDebtId,
    refinancedFromDebtName: debtName(debt.refinancedFromDebtId),
    refinancedIntoDebtId: debt.refinancedIntoDebtId,
    refinancedIntoDebtName: debtName(debt.refinancedIntoDebtId),
    refinanceDate: debt.refinanceDate,
    currentTerm: mapTerm(currentTerm),
    terms: record.terms.map(mapTerm),
    permanentDeletionPreview: previewPermanentDebtDeletion(database, debt.id),
    transactions: record.transactions.map(mapTransaction),
    balanceSnapshots: record.balanceSnapshots.map(mapBalanceSnapshot),
    balanceReconciliations: record.balanceReconciliations.map(mapBalanceReconciliation),
    calculatedEscrowBalance: centsToDollars(
      calculateEscrowBalanceFromActivity(record, effectiveDate),
    ),
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
): readonly DebtTransactionWithAllocationsRecord[] => {
  const supersededTransactionIds = new Set(
    record.transactions
      .filter(({ transaction }) => transaction.status === 'superseded')
      .map(({ transaction }) => transaction.id),
  );

  return record.transactions.filter(
    ({ transaction }) =>
      transaction.status !== 'superseded' &&
      !(
        transaction.transactionType === 'reversal' &&
        transaction.reversalOfTransactionId &&
        supersededTransactionIds.has(transaction.reversalOfTransactionId)
      ) &&
      isWithinDateRange(transaction.effectiveDate, startDate, endDate),
  );
};

const openingPrincipalRepresentedByBorrowingTransaction = (
  record: DebtWithActivityRecord,
  startDate: string,
  endDate: string,
): boolean =>
  postedActualTransactionsThrough(record, startDate, endDate).some(
    ({ transaction }) =>
      transaction.transactionType === 'borrowing_draw' &&
      transaction.effectiveDate === record.debt.originationDate &&
      transaction.totalAmountCents === record.debt.originalPrincipalCents,
  );

const openingPrincipalBorrowingCents = (
  record: DebtWithActivityRecord,
  startDate: string,
  endDate: string,
): number =>
  isWithinDateRange(record.debt.originationDate, startDate, endDate) &&
  !openingPrincipalRepresentedByBorrowingTransaction(record, startDate, endDate)
    ? record.debt.originalPrincipalCents
    : 0;

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
    const debtEscrowBalanceCents = calculateEscrowBalanceFromActivity(
      record,
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

    newBorrowingsYtdCents += openingPrincipalBorrowingCents(
      record,
      ytdStart,
      effectiveDate,
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
      newBorrowingsYtd: `Opening principal for active debts originated from ${ytdStart} through ${effectiveDate}, plus posted non-superseded borrowing or draw transaction totals dated in the same period. Opening principal is not double-counted when a same-date borrowing/draw already represents it.`,
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

const calculateReportPrincipalBalanceThroughDate = (
  record: DebtWithActivityRecord,
  date: string,
): number => {
  if (date < record.debt.originationDate) return 0;
  return postedActualTransactionsThrough(
    record,
    record.debt.originationDate,
    date,
  ).reduce(
    (balance, { allocations }) =>
      balance + allocationTotal(allocations, ['principal', 'extra_principal']),
    record.debt.originalPrincipalCents,
  );
};

const allocationTotal = (
  allocations: readonly DebtTransactionWithAllocationsRecord['allocations'][number][],
  types: readonly string[],
): number =>
  allocations
    .filter((allocation) => types.includes(allocation.allocationType))
    .reduce((total, allocation) => total + allocation.amountCents, 0);

const createRollforward = (
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
    let principalAdjustments = 0;

    for (const record of records) {
      const transactionTypes = new Map(
        record.transactions.map((entry) => [
          entry.transaction.id,
          entry.transaction.transactionType,
        ]),
      );
      borrowings += openingPrincipalBorrowingCents(record, start, end);
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

        if (effectiveTransactionType === 'borrowing_draw')
          borrowings += allocationTotal(allocations, ['principal', 'extra_principal']);
        if (effectiveTransactionType === 'payment')
          payments -= transaction.totalAmountCents;
        const principal = allocationTotal(allocations, [
          'principal',
          'extra_principal',
        ]);
        if (effectiveTransactionType === 'payment') {
          principalReduction -= principal;
        } else if (effectiveTransactionType !== 'borrowing_draw') {
          principalAdjustments += principal;
        }
        interestActivity += allocationTotal(allocations, ['interest']);
      }
    }

    const beginningBalance = records.reduce(
      (total, record) =>
        total + calculateReportPrincipalBalanceThroughDate(record, beginningDate),
      0,
    );
    const endingBalance = records.reduce(
      (total, record) =>
        total + calculateReportPrincipalBalanceThroughDate(record, end),
      0,
    );
    const rollforwardCheck =
      beginningBalance +
      borrowings -
      principalReduction +
      principalAdjustments -
      endingBalance;

    return {
      period,
      beginningBalance: centsToDollars(beginningBalance),
      borrowings: centsToDollars(borrowings),
      payments: centsToDollars(payments),
      principalReduction: centsToDollars(principalReduction),
      interestActivity: centsToDollars(Math.abs(interestActivity)),
      adjustmentsAndOther: centsToDollars(principalAdjustments),
      rollforwardCheck: centsToDollars(rollforwardCheck),
      endingBalance: centsToDollars(endingBalance),
    };
  });

const createBalanceTrendRows = (
  records: readonly DebtWithActivityRecord[],
  monthlyRows: DebtReportsDto['monthlyRollforward']['rows'],
  annualRows: DebtReportsDto['annualRollforward']['rows'],
): DebtReportsDto['balanceTrends']['rows'] => {
  const rows = monthlyRows.length > 36 ? annualRows : monthlyRows;
  let priorEndingBalance: number | null = null;

  const totalRows = rows.map((row) => {
    const endingBalance = Number(row.endingBalance);
    const change =
      priorEndingBalance === null ? null : endingBalance - priorEndingBalance;
    priorEndingBalance = endingBalance;
    const isAnnual = /^\d{4}$/.test(row.period);
    return {
      period: row.period,
      periodEndDate: isAnnual
        ? `${row.period}-12-31`
        : periodEnd(row.period, 'monthly'),
      grouping: 'Total debt',
      refinanceDate: null,
      endingBalance: row.endingBalance,
      changeFromPriorPeriod:
        change === null ? null : centsToDollars(Math.round(change * 100)),
    };
  });

  const recordsByChain = new Map<string, DebtWithActivityRecord[]>();
  for (const record of records) {
    if (!record.debt.financingChainName) continue;
    recordsByChain.set(record.debt.financingChainName, [
      ...(recordsByChain.get(record.debt.financingChainName) ?? []),
      record,
    ]);
  }

  const chainRows = [...recordsByChain.entries()].flatMap(
    ([chainName, chainRecords]) => {
      if (chainRecords.length < 2) return [];
      let priorChainBalance: number | null = null;
      const refinanceDate =
        chainRecords
          .map((record) => record.debt.refinanceDate)
          .filter((date): date is string => date !== null)
          .sort()[0] ?? null;
      return rows.map((row) => {
        const isAnnual = /^\d{4}$/.test(row.period);
        const periodEndDate = isAnnual
          ? `${row.period}-12-31`
          : periodEnd(row.period, 'monthly');
        const endingBalanceCents = chainRecords.reduce(
          (total, record) =>
            total + calculateReportPrincipalBalanceThroughDate(record, periodEndDate),
          0,
        );
        const change =
          priorChainBalance === null ? null : endingBalanceCents - priorChainBalance;
        priorChainBalance = endingBalanceCents;
        return {
          period: row.period,
          periodEndDate,
          grouping: chainName,
          refinanceDate,
          endingBalance: centsToDollars(endingBalanceCents),
          changeFromPriorPeriod: change === null ? null : centsToDollars(change),
        };
      });
    },
  );

  return [...totalRows, ...chainRows];
};

const monthsBetweenDates = (
  startDate: string | null,
  endDate: string | null,
): number | null => {
  if (!startDate || !endDate) return null;
  return (
    (Number(endDate.slice(0, 4)) - Number(startDate.slice(0, 4))) * 12 +
    Number(endDate.slice(5, 7)) -
    Number(startDate.slice(5, 7))
  );
};

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
  const sensitivityInputs =
    kind === 'rate'
      ? inputs.filter((input) =>
          input.terms.some((term) => term.interestRateType === 'variable'),
        )
      : inputs;
  if (sensitivityInputs.length === 0) return [];

  const cases =
    kind === 'rate'
      ? [
          { label: 'Rates -1.00%', rateChange: -10_000, extra: 0 },
          { label: 'Baseline', rateChange: 0, extra: 0 },
          { label: 'Rates +1.00%', rateChange: 10_000, extra: 0 },
          { label: 'Rates +2.00%', rateChange: 20_000, extra: 0 },
        ]
      : [
          { label: 'No extra payment', rateChange: 0, extra: 0 },
          { label: 'Extra $100/month', rateChange: 0, extra: 10_000 },
          { label: 'Extra $250/month', rateChange: 0, extra: 25_000 },
          { label: 'Extra $500/month', rateChange: 0, extra: 50_000 },
        ];

  const runCase = (item: (typeof cases)[number]): PayoffProjectionResult => {
    const adjustedInputs = sensitivityInputs.map((debt) => ({
      ...debt,
      terms: debt.terms.map((term) => ({
        ...term,
        interestRateMicros:
          term.interestRateType === 'variable'
            ? term.interestRateMicros
            : Math.max(0, term.interestRateMicros + item.rateChange),
      })),
    }));
    return projectPayoffScenario(adjustedInputs, {
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
  };

  const baselineCase = cases.find((item) => item.rateChange === 0 && item.extra === 0);
  if (!baselineCase) return [];
  const baselineResult = runCase(baselineCase);
  const baselineVariableRateMicros =
    kind === 'rate'
      ? records
          .map((record) => currentTermForDate(record.terms, startDate))
          .find((term) => term.interestRateType === 'variable')?.interestRateMicros
      : null;

  return cases.map((item) => {
    const result = runCase(item);
    const interestChange =
      result.totalProjectedInterestCents - baselineResult.totalProjectedInterestCents;
    const timingChange = monthsBetweenDates(
      baselineResult.projectedPayoffDate,
      result.projectedPayoffDate,
    );

    return {
      scenarioLabel: item.label,
      assumption:
        kind === 'rate'
          ? 'How would projected interest cost and payoff timing change if variable rates increase or decrease? Only variable-rate debts are included.'
          : 'How much interest and time would be saved by applying additional monthly payments? Uses avalanche priority and the stated extra payment.',
      baselineRate:
        baselineVariableRateMicros === null || baselineVariableRateMicros === undefined
          ? null
          : rateMicrosToPercentString(baselineVariableRateMicros),
      rateChange:
        kind === 'rate'
          ? `${item.rateChange >= 0 ? '+' : '-'}${rateMicrosToPercentString(Math.abs(item.rateChange))}%`
          : null,
      projectedPayoffDate: result.projectedPayoffDate,
      payoffTimingChangeMonths: timingChange,
      totalProjectedInterest: centsToDollars(result.totalProjectedInterestCents),
      changeFromBaselineInterest: centsToDollars(interestChange),
      interestSaved:
        kind === 'extra'
          ? centsToDollars(
              baselineResult.totalProjectedInterestCents -
                result.totalProjectedInterestCents,
            )
          : null,
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
  const requestedStartDate = parsed.startDate ?? `${effectiveDate.slice(0, 4)}-01-01`;
  const startDate =
    requestedStartDate < REPORTING_HISTORY_START_DATE
      ? REPORTING_HISTORY_START_DATE
      : requestedStartDate;
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
    `Reporting history currently starts on ${REPORTING_HISTORY_START_DATE}; older underlying records are preserved but excluded from report periods.`,
  ];

  const balanceHistoryDates = periodKeys(startDate, endDate, 'monthly').map((period) =>
    clampDate(periodEnd(period, 'monthly'), startDate, endDate),
  );
  const balanceHistoryRows = records.flatMap((record) =>
    balanceHistoryDates.map((date) => {
      const snapshot = record.balanceSnapshots
        .filter((candidate) => candidate.effectiveDate <= date)
        .at(-1);
      return {
        debtId: record.debt.id,
        debtName: record.debt.name,
        creditor: record.debt.creditor,
        effectiveDate: date,
        calculatedBalance: centsToDollars(
          calculateReportPrincipalBalanceThroughDate(record, date),
        ),
        confirmedBalance: snapshot
          ? centsToDollars(snapshot.confirmedBalanceCents)
          : null,
        basis: `Calculated balance is ending principal as of ${date}; confirmed balance is latest snapshot on or before ${date}, when available and shown separately.`,
      };
    }),
  );

  const monthlyRows = createRollforward(records, startDate, endDate, 'monthly');
  const annualRows = createRollforward(records, startDate, endDate, 'annual');
  const trendRows = monthlyRows.map((row) => ({
    period: row.period,
    principalReduction: row.principalReduction,
    interestActivity: row.interestActivity,
    borrowings: row.borrowings,
    payments: row.payments,
  }));
  const annualInterestByDebt = records.flatMap((record) =>
    periodKeys(startDate, endDate, 'annual').flatMap((period) => {
      const start = clampDate(periodStart(period, 'annual'), startDate, endDate);
      const end = clampDate(periodEnd(period, 'annual'), startDate, endDate);
      const interestCents = postedActualTransactionsThrough(record, start, end).reduce(
        (total, entry) => total + allocationTotal(entry.allocations, ['interest']),
        0,
      );
      return interestCents === 0
        ? []
        : [
            {
              year: period,
              debtId: record.debt.id,
              debtName: record.debt.name,
              interestExpense: centsToDollars(Math.abs(interestCents)),
            },
          ];
    }),
  );
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
      rows: annualRows,
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
        'Interest expense analysis',
        startDate,
        endDate,
        effectiveDate,
        baseAssumptions,
      ),
      rows: trendRows,
      annualInterestByDebt,
    },
    balanceTrends: {
      basis: reportBasis('Debt balance trend', startDate, endDate, effectiveDate, [
        ...baseAssumptions,
        'Trend rows show application-calculated ending principal balance at period end.',
      ]),
      rows: createBalanceTrendRows(records, monthlyRows, annualRows),
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
        const refinanceDate = parsed.debt.refinanceDate
          ? ensureCalendarDate('debt.refinanceDate', parsed.debt.refinanceDate)
          : null;
        const financingChainName = nullableText(parsed.debt.financingChainName);
        const refinancedFromDebtId = parsed.debt.refinancedFromDebtId ?? null;
        const refinancedIntoDebtId = parsed.debt.refinancedIntoDebtId ?? null;
        validateRefinanceLinks(
          database,
          debtId,
          'debt',
          refinancedFromDebtId,
          refinancedIntoDebtId,
        );
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
          financingChainName,
          refinancedFromDebtId,
          refinancedIntoDebtId,
          refinanceDate,
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
        const refinanceDate = parsed.changes.refinanceDate
          ? ensureCalendarDate('changes.refinanceDate', parsed.changes.refinanceDate)
          : null;
        const financingChainName = nullableText(parsed.changes.financingChainName);
        const refinancedFromDebtId = parsed.changes.refinancedFromDebtId ?? null;
        const refinancedIntoDebtId = parsed.changes.refinancedIntoDebtId ?? null;
        validateRefinanceLinks(
          database,
          parsed.id,
          'changes',
          refinancedFromDebtId,
          refinancedIntoDebtId,
        );

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
          financingChainName,
          refinancedFromDebtId,
          refinancedIntoDebtId,
          refinanceDate,
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

    editDebtTransaction: (request) => {
      try {
        const parsed = editDebtTransactionRequestSchema.parse(request);
        const original = getDebtTransactionRecord(database, parsed.id);

        if (!original) {
          throw new ApplicationServiceError('not_found', 'Transaction was not found.');
        }

        const debt = getRecordOrThrow(original.debtId);

        if (debt.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before editing activity.',
          );
        }

        if (
          debt.transactions.some(
            (entry) =>
              entry.transaction.supersedesTransactionId === original.id &&
              entry.transaction.status === 'posted',
          )
        ) {
          throw new ApplicationServiceError(
            'conflict',
            'Transaction can no longer be edited because it already has a current replacement.',
          );
        }

        if (original.status !== 'posted') {
          throw new ApplicationServiceError(
            'conflict',
            'Only a currently posted transaction can be edited.',
          );
        }

        if (original.transactionType === 'reversal') {
          throw new ApplicationServiceError(
            'conflict',
            'Reversal transactions cannot be edited.',
          );
        }

        if (
          original.transactionType === 'approved_reconciliation_adjustment' ||
          original.sourceType === 'reconciliation'
        ) {
          throw new ApplicationServiceError(
            'conflict',
            'Reconciliation-approved adjustments require the reconciliation correction workflow.',
          );
        }

        const originalEntry = debt.transactions.find(
          (entry) => entry.transaction.id === original.id,
        );

        if (!originalEntry) {
          throw new ApplicationServiceError(
            'internal',
            'Transaction allocations were not available for editing.',
          );
        }

        const effectiveDate = ensureNotBefore(
          'transaction.effectiveDate',
          ensureCalendarDate(
            'transaction.effectiveDate',
            parsed.transaction.effectiveDate,
          ),
          debt.debt.originationDate,
        );
        const postingDate = ensureNotBefore(
          'transaction.postingDate',
          ensureCalendarDate('transaction.postingDate', parsed.transaction.postingDate),
          debt.debt.originationDate,
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

        const timestamp = nextTimestamp(now, original.updatedAtUtc);
        const reversalId = createId();
        const replacementId = createId();
        const reversal: DebtTransactionInsert = {
          id: reversalId,
          debtId: original.debtId,
          transactionType: 'reversal',
          effectiveDate: original.effectiveDate,
          postingDate: original.effectiveDate,
          totalAmountCents: -original.totalAmountCents,
          status: 'posted',
          description: `Superseding edit reversal of transaction ${original.id}.`,
          sourceType: 'system',
          sourceReference: original.id,
          reversalOfTransactionId: original.id,
          supersedesTransactionId: null,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };
        const reversalAllocations = originalEntry.allocations.map(
          (allocation): TransactionAllocationInsert => ({
            id: createId(),
            transactionId: reversalId,
            allocationType: allocation.allocationType,
            amountCents: -allocation.amountCents,
            notes: 'Superseding edit reversal of original allocation.',
            createdAtUtc: timestamp,
            updatedAtUtc: timestamp,
          }),
        );
        const direction = manualTransactionDirection(
          parsed.transaction.transactionType,
        );
        const replacement: DebtTransactionInsert = {
          id: replacementId,
          debtId: original.debtId,
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
            `Corrected ${parsed.transaction.transactionType.replaceAll('_', ' ')} recorded.`,
          sourceType:
            original.sourceType === 'import' ? 'import' : parsed.transaction.sourceType,
          sourceReference:
            original.sourceType === 'import'
              ? original.sourceReference
              : nullableText(parsed.transaction.sourceReference),
          reversalOfTransactionId: null,
          supersedesTransactionId: original.id,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };
        const replacementAllocations = buildManualTransactionAllocations(
          createId,
          replacementId,
          timestamp,
          'transaction.allocations',
          parsed.transaction.allocations,
          direction,
        );
        const signErrors = [
          ...validateTransactionSignConvention(reversal, reversalAllocations),
          ...validateTransactionSignConvention(replacement, replacementAllocations),
        ];

        if (signErrors.length > 0) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            postedTransactionFieldErrors(signErrors),
          );
        }

        const affectedReconciliationDate =
          original.effectiveDate < effectiveDate
            ? original.effectiveDate
            : effectiveDate;

        editPostedTransactionRecord(database, {
          originalTransactionId: original.id,
          expectedUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          reversal: {
            transaction: reversal,
            allocations: reversalAllocations,
          },
          replacement: {
            transaction: replacement,
            allocations: replacementAllocations,
          },
          updatedAtUtc: timestamp,
          affectedReconciliationDate,
          auditInputs: [
            createTransactionAudit(
              createId(),
              original.id,
              'transaction_superseded',
              'supersede',
              timestamp,
              'Posted transaction was superseded by a corrected replacement.',
              {
                reversalTransactionId: reversalId,
                replacementTransactionId: replacementId,
              },
            ),
            createTransactionAudit(
              createId(),
              replacementId,
              'transaction_replacement_recorded',
              'create_replacement',
              timestamp,
              'Corrected replacement transaction was recorded.',
              {
                originalTransactionId: original.id,
                allocationTypes: replacementAllocations.map(
                  (allocation) => allocation.allocationType,
                ),
              },
            ),
          ],
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

    voidDebtTransaction: (request) => {
      try {
        const parsed = voidDebtTransactionRequestSchema.parse(request);
        const original = getDebtTransactionRecord(database, parsed.id);

        if (!original) {
          throw new ApplicationServiceError('not_found', 'Transaction was not found.');
        }

        const debt = getRecordOrThrow(original.debtId);

        if (debt.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before voiding activity.',
          );
        }

        if (original.status !== 'posted') {
          throw new ApplicationServiceError(
            'conflict',
            'Only a currently posted transaction can be voided.',
          );
        }

        if (original.transactionType === 'reversal') {
          throw new ApplicationServiceError(
            'conflict',
            'Generated reversal transactions cannot be voided directly.',
          );
        }

        if (
          debt.transactions.some(
            (entry) => entry.transaction.supersedesTransactionId === original.id,
          )
        ) {
          throw new ApplicationServiceError(
            'conflict',
            'This transaction has already been corrected and cannot be voided directly.',
          );
        }

        const voidDate = ensureNotBefore(
          'voidDate',
          ensureCalendarDate('voidDate', parsed.voidDate),
          debt.debt.originationDate,
        );
        const timestamp = nextTimestamp(now, original.updatedAtUtc);
        reversePostedTransaction(database, {
          originalTransactionId: original.id,
          expectedUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          effectiveDate: voidDate,
          postingDate: voidDate,
          description: `Void of transaction ${original.id}.`,
          occurredAtUtc: timestamp,
          originalStatus: 'voided',
          auditEventType: 'transaction_voided',
          auditAction: 'void',
          auditSummary:
            'Posted transaction was voided by a linked offsetting transaction.',
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
        if (calculatedDifferenceCents !== 0 && approvedAdjustment === null) {
          throw new ApplicationServiceError(
            'validation',
            `Verified lender balance ${centsToDollars(statementEndingBalanceCents)}; calculated ledger balance ${centsToDollars(applicationCalculatedBalanceCents)}; difference ${centsToDollars(calculatedDifferenceCents)}. Review and edit or void the underlying transactions, then try again.`,
          );
        }
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

    deleteDebtPermanently: (request, backupId) => {
      try {
        if (backupId.trim() === '') {
          throw new ApplicationServiceError(
            'conflict',
            'A validated backup is required before permanently deleting a debt.',
          );
        }

        const parsed = deleteDebtPermanentlyRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.id);
        if (parsed.typedDebtName !== existing.debt.name) {
          throw new ApplicationServiceError(
            'validation',
            'Type the debt name exactly to confirm permanent deletion.',
            {
              typedDebtName: ['Debt name confirmation did not match.'],
            },
          );
        }
        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        deleteDebtPermanentlyRecord(database, {
          debtId: parsed.id,
          expectedUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          audit: {
            id: createId(),
            eventType: 'debt_permanently_deleted',
            entityType: 'application',
            entityId: 'permanent-debt-deletion',
            action: 'delete',
            occurredAtUtc: timestamp,
            source: 'user',
            summary:
              'A debt and its dependent records were permanently deleted after a validated backup.',
            beforeMetadataJson: null,
            afterMetadataJson: JSON.stringify({ backupId }),
          },
        });

        return {
          deletedDebtId: parsed.id,
          deletedDebtName: existing.debt.name,
          backupId,
        };
      } catch (error) {
        return normalizeError(error);
      }
    },
  };

  return service;
};
