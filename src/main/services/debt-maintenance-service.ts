import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type {
  AddDebtTermRequest,
  ArchivePayoffScenarioRequest,
  CreateBalanceReconciliationRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  CreateDebtTransferRequest,
  EditDebtTransactionRequest,
  ArchiveDebtRequest,
  CreateDebtRequest,
  CreatePayoffScenarioRequest,
  CalculatePayoffBaselineRequest,
  ExtraCashAllocationRequest,
  ExtraCashAllocationResponse,
  DashboardDto,
  DebtOutlookDto,
  InterestAnalysisDto,
  RefinanceAnalysisDto,
  DataHealthDto,
  MilestonesDto,
  AcceptCurrentBalanceRequest,
  DeleteDebtPermanentlyRequest,
  ConfirmScheduledPaymentRequest,
  RemoveScheduledPaymentConfirmationRequest,
  DebtReportsDto,
  DebtDetailDto,
  DebtSummaryDto,
  GetDashboardRequest,
  GetDataHealthRequest,
  GetMilestonesRequest,
  GetDebtOutlookRequest,
  GetInterestAnalysisRequest,
  GetRefinanceAnalysisRequest,
  GetDebtReportsRequest,
  GetDebtRequest,
  GetPayoffScenarioRequest,
  ListDebtsRequest,
  ListPayoffScenariosRequest,
  PayoffScenarioDto,
  PayoffBaselineDto,
  RecordRefinanceRequest,
  RerunPayoffScenarioRequest,
  RenamePayoffScenarioRequest,
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
  createDebtTransferRequestSchema,
  editDebtTransactionRequestSchema,
  createDebtRequestSchema,
  createPayoffScenarioRequestSchema,
  extraCashAllocationRequestSchema,
  deleteDebtPermanentlyRequestSchema,
  confirmScheduledPaymentRequestSchema,
  removeScheduledPaymentConfirmationRequestSchema,
  getDashboardRequestSchema,
  getDataHealthRequestSchema,
  getMilestonesRequestSchema,
  getDebtOutlookRequestSchema,
  getInterestAnalysisRequestSchema,
  getRefinanceAnalysisRequestSchema,
  acceptCurrentBalanceRequestSchema,
  getDebtReportsRequestSchema,
  getDebtRequestSchema,
  getPayoffScenarioRequestSchema,
  listPayoffScenariosRequestSchema,
  calculatePayoffBaselineRequestSchema,
  listDebtsRequestSchema,
  recordRefinanceRequestSchema,
  rerunPayoffScenarioRequestSchema,
  renamePayoffScenarioRequestSchema,
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
  calculateEscrowBalanceThroughDate,
  createPayoffScenarioRecord,
  createBalanceReconciliationRecord,
  createBalanceSnapshotRecord,
  createPostedTransactionRecord,
  createDebtTransferRecord,
  deleteDebtPermanentlyRecord,
  createPaymentScheduleOverride,
  removePaymentScheduleOverride,
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
  recordInPlaceRefinanceRecord,
  RepositoryConflictError,
  RepositoryNotFoundError,
  setDebtArchivedState,
  updatePayoffScenarioArchiveState,
  updatePayoffScenarioResultRecord,
  updatePayoffScenarioNameRecord,
  updateDebtDescriptiveRecord,
  voidBalanceReconciliationRecord,
  type DebtRecord,
  type BalanceReconciliationRecord,
  type DebtTransactionWithAllocationsRecord,
  type DebtTermRecord,
  type DebtWithTermsRecord,
  type DebtWithActivityRecord,
  type PayoffScenarioRecord,
  type PostedTransactionInput,
} from '../database/debt-maintenance-repository';
import { reversePostedTransaction } from '../database/repository';
import type {
  AuditEventInsert,
  BalanceReconciliationInput,
  DebtInsert,
  DebtTermInsert,
  DebtTransactionInsert,
  RefinanceEventInsert,
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
import {
  calculateExtraCashAllocation,
  type ExtraCashAllocationStrategy,
} from '../domain/accounting/extra-cash-allocation';
import {
  calculateScheduledPayments,
  dueDateForMonth,
  type ScheduledPaymentResult,
} from '../domain/accounting/payment-schedule';
import { validateTransactionSignConvention } from '../domain/accounting/transaction-validation';
import { ApplicationServiceError } from './application-error';

export interface DebtMaintenanceService {
  listDebts(request: ListDebtsRequest): readonly DebtSummaryDto[];
  getDashboard(request: GetDashboardRequest): DashboardDto;
  getDataHealth?(request: GetDataHealthRequest): DataHealthDto;
  getMilestones?(request: GetMilestonesRequest): MilestonesDto;
  getDebtOutlook?(request: GetDebtOutlookRequest): DebtOutlookDto;
  getInterestAnalysis?(request: GetInterestAnalysisRequest): InterestAnalysisDto;
  getRefinanceAnalysis?(request: GetRefinanceAnalysisRequest): RefinanceAnalysisDto;
  acceptCurrentBalance?(request: AcceptCurrentBalanceRequest): DebtDetailDto;
  getDebtReports(request: GetDebtReportsRequest): DebtReportsDto;
  listPayoffScenarios(
    request: ListPayoffScenariosRequest,
  ): readonly PayoffScenarioDto[];
  calculatePayoffBaseline(request: CalculatePayoffBaselineRequest): PayoffBaselineDto;
  getPayoffScenario(request: GetPayoffScenarioRequest): PayoffScenarioDto;
  createPayoffScenario(request: CreatePayoffScenarioRequest): PayoffScenarioDto;
  calculateExtraCashAllocation(
    request: ExtraCashAllocationRequest,
  ): ExtraCashAllocationResponse;
  rerunPayoffScenario(request: RerunPayoffScenarioRequest): PayoffScenarioDto;
  renamePayoffScenario(request: RenamePayoffScenarioRequest): PayoffScenarioDto;
  archivePayoffScenario(request: ArchivePayoffScenarioRequest): PayoffScenarioDto;
  getDebt(request: GetDebtRequest): DebtDetailDto;
  createDebt(request: CreateDebtRequest): DebtDetailDto;
  updateDebt(request: UpdateDebtRequest): DebtDetailDto;
  addDebtTerm(request: AddDebtTermRequest): DebtDetailDto;
  createDebtTransaction(request: CreateDebtTransactionRequest): DebtDetailDto;
  createDebtTransfer(request: CreateDebtTransferRequest): DebtDetailDto;
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
  recordRefinance(request: RecordRefinanceRequest): DebtDetailDto;
  deleteDebtPermanently(
    request: DeleteDebtPermanentlyRequest,
    backupId: string,
  ): {
    readonly deletedDebtId: string;
    readonly deletedDebtName: string;
    readonly backupId: string;
  };
  confirmScheduledPayment(request: ConfirmScheduledPaymentRequest): DebtDetailDto;
  removeScheduledPaymentConfirmation(
    request: RemoveScheduledPaymentConfirmationRequest,
  ): DebtDetailDto;
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

const validatePaymentDueDay = (field: string, value: number | null): number | null => {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new ApplicationServiceError('validation', 'Review the highlighted fields.', {
      [field]: ['Payment due day must be a whole number from 1 through 31.'],
    });
  }
  return value;
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
  transferId: record.transaction.transferId,
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

const mapRefinanceEvent = (
  event: DebtWithActivityRecord['refinanceEvents'][number],
): DebtDetailDto['refinanceEvents'][number] => ({
  id: event.id,
  debtId: event.debtId,
  refinanceDate: event.refinanceDate,
  preRefinancePrincipal: centsToDollars(event.preRefinancePrincipalCents),
  lenderPayoffBalance:
    event.lenderPayoffBalanceCents === null
      ? null
      : centsToDollars(event.lenderPayoffBalanceCents),
  newRefinancedPrincipal: centsToDollars(event.newRefinancedPrincipalCents),
  principalChange: centsToDollars(event.principalChangeCents),
  financedFees: centsToDollars(event.financedFeesCents),
  cashFees: centsToDollars(event.cashFeesCents),
  escrowHandling: event.escrowHandling,
  escrowAmount:
    event.escrowAmountCents === null ? null : centsToDollars(event.escrowAmountCents),
  priorTermId: event.priorTermId,
  newTermId: event.newTermId,
  principalTransactionId: event.principalTransactionId,
  cashFeeTransactionId: event.cashFeeTransactionId,
  escrowTransactionId: event.escrowTransactionId,
  notes: event.notes,
  createdAtUtc: event.createdAtUtc,
  updatedAtUtc: event.updatedAtUtc,
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

const qualifyingScheduledPayments = (
  record: DebtWithActivityRecord,
): readonly {
  readonly id: string;
  readonly effectiveDate: string;
}[] =>
  record.transactions
    .filter(
      ({ transaction }) =>
        transaction.transactionType === 'payment' && transaction.status === 'posted',
    )
    .map(({ transaction }) => ({
      id: transaction.id,
      effectiveDate: transaction.effectiveDate,
    }));

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

const scheduledPaymentForRecord = (
  record: DebtWithActivityRecord,
  currentBalanceCents: number,
  effectiveDate: string,
): ScheduledPaymentResult =>
  calculateScheduledPayments({
    debtId: record.debt.id,
    originationDate: record.debt.originationDate,
    currentBalanceCents,
    status: record.debt.status,
    archivedAtUtc: record.debt.archivedAtUtc,
    paymentDueDay: record.debt.paymentDueDay,
    paymentScheduleStartDate: record.debt.paymentScheduleStartDate,
    terms: record.terms,
    payments: qualifyingScheduledPayments(record),
    confirmedSatisfiedDueDates: record.paymentScheduleOverrides.map(
      (override) => override.satisfiedDueDate,
    ),
    asOfDate: effectiveDate,
    lookAheadDays: 30,
  });

const mapScheduledPayment = (
  record: DebtWithActivityRecord,
  schedule: ScheduledPaymentResult,
): DebtDetailDto['paymentSchedule'] => ({
  debtId: record.debt.id,
  debtName: record.debt.name,
  creditor: record.debt.creditor,
  dueDate: schedule.dueDate,
  priorDueDate: schedule.priorDueDate,
  nextDueDate: schedule.nextDueDate,
  status: schedule.status,
  earliestPastDueDate: schedule.earliestPastDueDate,
  reviewMessage: schedule.reviewMessage,
  schedulingStartDate: record.debt.paymentScheduleStartDate,
  manualConfirmation: record.paymentScheduleOverrides.at(-1)
    ? {
        dueDate: record.paymentScheduleOverrides.at(-1)!.satisfiedDueDate,
        reason: record.paymentScheduleOverrides.at(-1)!.reason as
          | 'historical_payment_not_entered'
          | 'lender_treated_prior_payment_as_satisfying'
          | 'starting_schedule_after_historical_data'
          | 'other',
        confirmedAtUtc: record.paymentScheduleOverrides.at(-1)!.confirmedAtUtc,
      }
    : null,
});

const mapSummary = (
  database: AppDatabase,
  record: DebtWithActivityRecord,
  effectiveDate: string,
): DebtSummaryDto => {
  const debt = record.debt;
  const debtName = (id: string | null): string | null =>
    id ? (getDebtRecord(database, id)?.debt.name ?? null) : null;
  const currentBalanceCents = calculateLedgerBalanceThroughDate(
    database,
    debt.id,
    effectiveDate,
  );
  const schedule = scheduledPaymentForRecord(
    record,
    currentBalanceCents,
    effectiveDate,
  );

  return {
    id: debt.id,
    name: debt.name,
    creditor: debt.creditor,
    ownerEntity: debt.ownerEntity,
    debtType: debt.debtType,
    status: debt.status,
    originalPrincipal: centsToDollars(debt.originalPrincipalCents),
    currentBalance: centsToDollars(currentBalanceCents),
    currentBalanceEffectiveDate: effectiveDate,
    calculatedEscrowBalance: centsToDollars(
      calculateEscrowBalanceFromActivity(record, effectiveDate),
    ),
    originationDate: debt.originationDate,
    maturityDate: debt.maturityDate,
    initialTerm: mapTerm(requireInitialTerm(record)),
    currentTerm: mapTerm(currentTermForDate(record.terms, effectiveDate)),
    paymentDueDay: debt.paymentDueDay,
    paymentScheduleStartDate: debt.paymentScheduleStartDate,
    nextDueDate: schedule.nextDueDate,
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
  const currentBalanceCents = calculateLedgerBalanceThroughDate(
    database,
    debt.id,
    effectiveDate,
  );
  const schedule = scheduledPaymentForRecord(
    record,
    currentBalanceCents,
    effectiveDate,
  );

  return {
    id: debt.id,
    name: debt.name,
    creditor: debt.creditor,
    ownerEntity: debt.ownerEntity,
    debtType: debt.debtType,
    purpose: debt.purpose,
    status: debt.status,
    originalPrincipal: centsToDollars(debt.originalPrincipalCents),
    currentBalance: centsToDollars(currentBalanceCents),
    currentBalanceEffectiveDate: effectiveDate,
    originationDate: debt.originationDate,
    maturityDate: debt.maturityDate,
    minimumPayment: centsToDollars(debt.minimumPaymentCents),
    paymentFrequency: debt.paymentFrequency,
    paymentDueDay: debt.paymentDueDay,
    paymentScheduleStartDate: debt.paymentScheduleStartDate,
    nextDueDate: schedule.nextDueDate,
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
    paymentSchedule: mapScheduledPayment(record, schedule),
    terms: record.terms.map(mapTerm),
    permanentDeletionPreview: previewPermanentDebtDeletion(database, debt.id),
    transactions: record.transactions.map(mapTransaction),
    balanceSnapshots: record.balanceSnapshots.map(mapBalanceSnapshot),
    balanceReconciliations: record.balanceReconciliations.map(mapBalanceReconciliation),
    refinanceEvents: record.refinanceEvents.map(mapRefinanceEvent),
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

const calendarDaysBetween = (startDate: string, endDate: string): number => {
  const parse = (value: string): number => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year!, month! - 1, day!);
  };
  return Math.max(0, Math.round((parse(endDate) - parse(startDate)) / 86_400_000));
};

const dataHealthReason = (
  code:
    | 'never_reconciled'
    | 'activity_since_reconciliation'
    | 'missing_due_day'
    | 'missing_schedule_start'
    | 'missing_credit_limit'
    | 'edited_or_voided_activity'
    | 'refinance_activity'
    | 'expected_payment_missing'
    | 'data_integrity'
    | 'stale_reconciliation'
    | 'reconciliation_exception',
  label: string,
) => ({ code, label });

const createDataHealth = (
  database: AppDatabase,
  records: readonly DebtWithActivityRecord[],
  effectiveDate: string,
): DataHealthDto => {
  const rows = records.map((record) => {
    const balanceCents = calculateLedgerBalanceThroughDate(
      database,
      record.debt.id,
      effectiveDate,
    );
    const currentReconciliations = record.balanceReconciliations
      .filter((reconciliation) => reconciliation.lifecycleStatus === 'current')
      .sort((left, right) => right.statementDate.localeCompare(left.statementDate));
    const lastReconciliationDate = currentReconciliations[0]?.statementDate ?? null;
    const daysSinceReconciliation = lastReconciliationDate
      ? calendarDaysBetween(lastReconciliationDate, effectiveDate)
      : null;
    const boundary = lastReconciliationDate ?? record.debt.originationDate;
    const activity = record.transactions.filter(
      ({ transaction }) =>
        transaction.effectiveDate > boundary &&
        transaction.effectiveDate <= effectiveDate &&
        transaction.status !== 'superseded',
    );
    const activityCents = activity.reduce(
      (total, { transaction }) => total + Math.abs(transaction.totalAmountCents),
      0,
    );
    const activitySinceLastReconciliation = lastReconciliationDate
      ? `${activity.length} transaction${activity.length === 1 ? '' : 's'} (${centsToDollars(activityCents)})`
      : activity.length > 0
        ? `${activity.length} transaction${activity.length === 1 ? '' : 's'} since origination`
        : 'No posted activity';
    const reasons: ReturnType<typeof dataHealthReason>[] = [];
    const activePositiveBalance =
      record.debt.status === 'active' && !record.debt.archivedAtUtc && balanceCents > 0;
    const schedule = scheduledPaymentForRecord(record, balanceCents, effectiveDate);

    if (activePositiveBalance && !lastReconciliationDate) {
      reasons.push(dataHealthReason('never_reconciled', 'Never reconciled'));
    }
    const latestReconciliation = currentReconciliations[0];
    if (
      latestReconciliation &&
      latestReconciliation.reconciliationStatus !== 'reconciled' &&
      latestReconciliation.reconciliationStatus !== 'reconciled_with_adjustment'
    ) {
      reasons.push(
        dataHealthReason('reconciliation_exception', 'Reconciliation needs review'),
      );
    }
    if (activePositiveBalance && activity.length > 0 && lastReconciliationDate) {
      reasons.push(
        dataHealthReason(
          'activity_since_reconciliation',
          'Activity since last reconciliation',
        ),
      );
    }
    if (activePositiveBalance && record.debt.paymentDueDay === null) {
      reasons.push(dataHealthReason('missing_due_day', 'Missing due day'));
    }
    if (activePositiveBalance && record.debt.paymentScheduleStartDate === null) {
      reasons.push(
        dataHealthReason('missing_schedule_start', 'Missing scheduling start date'),
      );
    }
    if (
      activePositiveBalance &&
      (record.debt.debtType === 'credit_card' || record.debt.debtType === 'heloc') &&
      (!record.debt.creditLimitCents || record.debt.creditLimitCents <= 0)
    ) {
      reasons.push(dataHealthReason('missing_credit_limit', 'Missing credit limit'));
    }
    if (
      lastReconciliationDate &&
      record.transactions.some(
        ({ transaction }) =>
          transaction.updatedAtUtc.slice(0, 10) > lastReconciliationDate &&
          (transaction.status === 'superseded' || transaction.status === 'voided'),
      )
    ) {
      reasons.push(
        dataHealthReason(
          'edited_or_voided_activity',
          'Edited or voided transactions since reconciliation',
        ),
      );
    }
    if (
      lastReconciliationDate &&
      record.refinanceEvents.some(
        ({ refinanceDate }) => refinanceDate > lastReconciliationDate,
      )
    ) {
      reasons.push(
        dataHealthReason(
          'refinance_activity',
          'Refinance activity since reconciliation',
        ),
      );
    }
    if (
      activePositiveBalance &&
      schedule.obligations.some(
        (obligation) => !obligation.satisfied && obligation.dueDate < effectiveDate,
      )
    ) {
      reasons.push(
        dataHealthReason(
          'expected_payment_missing',
          'Expected payment with no qualifying payment',
        ),
      );
    }
    if (findMalformedReversalIssues(record).length > 0) {
      reasons.push(
        dataHealthReason('data_integrity', 'Existing data-integrity warning'),
      );
    }
    if (lastReconciliationDate && daysSinceReconciliation! > 90) {
      reasons.push(
        dataHealthReason(
          'stale_reconciliation',
          'Reconciliation is more than 90 days old',
        ),
      );
    }

    const attentionCodes = new Set([
      'never_reconciled',
      'edited_or_voided_activity',
      'refinance_activity',
      'expected_payment_missing',
      'data_integrity',
      'reconciliation_exception',
    ]);
    const status: DataHealthDto['rows'][number]['status'] = reasons.some((reason) =>
      attentionCodes.has(reason.code),
    )
      ? 'attention'
      : reasons.length > 0
        ? 'review'
        : 'current';
    return {
      debtId: record.debt.id,
      debtName: record.debt.name,
      creditor: record.debt.creditor,
      debtType: record.debt.debtType,
      status,
      currentBalance: centsToDollars(balanceCents),
      effectiveDate,
      lastReconciliationDate,
      daysSinceReconciliation,
      activitySinceLastReconciliation,
      reasons,
    };
  });
  const rank = { attention: 0, review: 1, current: 2 } as const;
  rows.sort(
    (left, right) =>
      rank[left.status] - rank[right.status] ||
      left.debtName.localeCompare(right.debtName),
  );
  return {
    effectiveDate,
    counts: {
      current: rows.filter((row) => row.status === 'current').length,
      review: rows.filter((row) => row.status === 'review').length,
      attention: rows.filter((row) => row.status === 'attention').length,
    },
    rows,
  };
};

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
  let purchaseChargesYtdCents = 0;
  let newBorrowingsYtdCents = 0;
  let interestActivityYtdCents = 0;
  let requiredMonthlyPaymentsCents = 0;
  let weightedRateNumerator = 0n;
  let weightedRateDenominator = 0n;
  let creditCardBalanceCents = 0;
  let creditCardUtilizationBalanceCents = 0;
  let creditCardLimitCents = 0;
  let creditCardAvailableCents = 0;
  let creditCardOverLimitCents = 0;

  const upcomingMaturities: DashboardDto['upcomingMaturities'] = [];
  const upcomingPayments: DashboardDto['upcomingPayments'] = [];
  const schedulingReviewItems: DashboardDto['schedulingReviewItems'] = [];
  const escrowBalances: DashboardDto['escrowBalances'] = [];
  const attentionItems: DashboardDto['attentionItems'] = [];
  const creditCardDetails: DashboardDto['creditCardPortfolio']['details'] = [];
  const creditCardReviewItems: string[] = [];
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
    const paymentSchedule = scheduledPaymentForRecord(
      record,
      ledgerBalanceCents,
      effectiveDate,
    );
    const paymentScheduleDto = mapScheduledPayment(record, paymentSchedule);

    if (
      !paymentSchedule.satisfied &&
      (paymentSchedule.status === 'past_due' ||
        paymentSchedule.status === 'due_today' ||
        paymentSchedule.status === 'upcoming')
    ) {
      upcomingPayments.push(paymentScheduleDto);
    }

    if (
      paymentSchedule.status === 'missing_due_day' ||
      paymentSchedule.status === 'unsupported_frequency'
    ) {
      schedulingReviewItems.push(paymentScheduleDto);
    }

    activeDebtCents += ledgerBalanceCents;
    if (record.debt.debtType === 'credit_card' && record.debt.status === 'active') {
      creditCardBalanceCents += Math.max(0, ledgerBalanceCents);
      if (record.debt.creditLimitCents === null || record.debt.creditLimitCents <= 0) {
        creditCardReviewItems.push(
          `${record.debt.name} has no valid credit limit and is excluded from utilization.`,
        );
        creditCardDetails.push({
          debtId: record.debt.id,
          debtName: record.debt.name,
          creditor: record.debt.creditor,
          currentBalance: centsToDollars(ledgerBalanceCents),
          creditLimit: null,
          availableCredit: null,
          utilizationPercent: null,
          reviewFlag:
            'No valid credit limit; excluded from portfolio utilization calculation.',
        });
      } else {
        creditCardLimitCents += record.debt.creditLimitCents;
        creditCardUtilizationBalanceCents += Math.max(0, ledgerBalanceCents);
        const rawAvailable = record.debt.creditLimitCents - ledgerBalanceCents;
        creditCardAvailableCents += Math.max(0, rawAvailable);
        creditCardOverLimitCents += Math.max(0, -rawAvailable);
        creditCardDetails.push({
          debtId: record.debt.id,
          debtName: record.debt.name,
          creditor: record.debt.creditor,
          currentBalance: centsToDollars(ledgerBalanceCents),
          creditLimit: centsToDollars(record.debt.creditLimitCents),
          availableCredit: centsToDollars(Math.max(0, rawAvailable)),
          utilizationPercent: `${((Math.max(0, ledgerBalanceCents) / record.debt.creditLimitCents) * 100).toFixed(1)}%`,
          reviewFlag:
            rawAvailable < 0
              ? `Over limit by ${centsToDollars(Math.abs(rawAvailable))}.`
              : null,
        });
      }
    }
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

      if (effectiveTransactionType === 'purchase') {
        purchaseChargesYtdCents += allocations
          .filter(
            (allocation) =>
              allocation.allocationType === 'principal' ||
              allocation.allocationType === 'extra_principal',
          )
          .reduce((total, allocation) => total + allocation.amountCents, 0);
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
  upcomingPayments.sort((left, right) => {
    const statusRank = (status: (typeof left)['status']): number => {
      if (status === 'past_due') return 0;
      if (status === 'due_today') return 1;
      return 2;
    };
    const rankComparison = statusRank(left.status) - statusRank(right.status);
    if (rankComparison !== 0) return rankComparison;
    return (left.dueDate ?? '').localeCompare(right.dueDate ?? '');
  });

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
      purchaseChargesYtd: centsToDollars(purchaseChargesYtdCents),
      newBorrowingsYtd: centsToDollars(newBorrowingsYtdCents),
      netDebtReductionYtd: centsToDollars(
        principalReductionYtdCents - purchaseChargesYtdCents - newBorrowingsYtdCents,
      ),
      interestActivityYtd: centsToDollars(Math.abs(interestActivityYtdCents)),
      escrowBalance: centsToDollars(escrowBalanceCents),
      requiredMonthlyPayments: centsToDollars(requiredMonthlyPaymentsCents),
      weightedAverageInterestRate:
        weightedAverageInterestRateMicros === null
          ? null
          : rateMicrosToPercentString(weightedAverageInterestRateMicros),
      creditCardBalances: centsToDollars(creditCardBalanceCents),
      availableCredit: centsToDollars(creditCardAvailableCents),
      creditUtilizationPercent:
        creditCardLimitCents === 0
          ? null
          : `${((creditCardUtilizationBalanceCents / creditCardLimitCents) * 100).toFixed(1)}%`,
      creditCardOverLimit: centsToDollars(creditCardOverLimitCents),
    },
    metricBasis: {
      activeDebt: `Application-calculated ledger balances for active debts as of ${effectiveDate}; not confirmed snapshots or original principal.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected balances require review.' : ''}`,
      principalReductionYtd: `Net principal and extra-principal allocations from posted non-superseded activity dated ${ytdStart} through ${effectiveDate}.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected YTD amounts require review.' : ''}`,
      purchaseChargesYtd: `Principal and extra-principal allocations from posted Purchase/Charge activity dated ${ytdStart} through ${effectiveDate}; transfers are excluded from this portfolio metric.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected YTD amounts require review.' : ''}`,
      newBorrowingsYtd: `Opening principal for active debts originated from ${ytdStart} through ${effectiveDate}, plus posted non-superseded borrowing or draw transaction totals dated in the same period. Opening principal is not double-counted when a same-date borrowing/draw already represents it.`,
      netDebtReductionYtd: `Principal paid YTD less Purchase/Charge activity and New Borrowing/Draw activity; portfolio transfers are excluded because Transfer In and Transfer Out net to zero.`,
      interestActivityYtd: `Positive display of interest allocations from posted non-superseded activity dated ${ytdStart} through ${effectiveDate}; internal payment allocations are stored as negative values.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected YTD amounts require review.' : ''}`,
      escrowBalance: `Application-calculated escrow balances for active debts as of ${effectiveDate}; excluded from debt principal balance.${hasDataIntegrityExceptions ? ' Data-integrity exceptions are present and affected escrow balances require review.' : ''}`,
      requiredMonthlyPayments: `Current effective debt terms as of ${effectiveDate}, normalized to monthly equivalents; irregular and other frequencies are excluded from the amount.`,
      weightedAverageInterestRate: `Current effective annual rates as of ${effectiveDate}, weighted by application-calculated ledger balances for active debts.`,
      creditCardBalances: `Application-calculated balances for active credit-card debts as of ${effectiveDate}.`,
      availableCredit: `Active credit-card credit limits less application-calculated active credit-card balances as of ${effectiveDate}; displayed available credit is not shown below zero.`,
      creditUtilizationPercent: `Active credit-card balances divided by active credit limits as of ${effectiveDate}; cards without valid limits are excluded and flagged for review.`,
      creditCardOverLimit: `Amount by which active credit-card balances exceed stated credit limits as of ${effectiveDate}.`,
    },
    creditCardPortfolio: {
      details: creditCardDetails,
      reviewItems: creditCardReviewItems,
    },
    upcomingPayments,
    schedulingReviewItems,
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
  monthlySchedule: (result.monthlySchedule ?? []).map((entry) => ({
    month: entry.month,
    debtId: entry.debtId,
    debtName: entry.debtName,
    requiredPayment: centsToDollars(entry.requiredPaymentCents),
    extraPayment: centsToDollars(entry.extraPaymentCents),
    totalPayment: centsToDollars(entry.totalPaymentCents),
    endingProjectedBalance: centsToDollars(entry.endingProjectedBalanceCents),
    totalProjectedBalance: centsToDollars(
      entry.totalProjectedBalanceCents ?? entry.endingProjectedBalanceCents,
    ),
    paidOffDebtName: entry.paidOffDebtName,
    nextPriorityDebtName: entry.nextPriorityDebtName,
  })),
  payoffOrder: (result.payoffOrder ?? []).map((entry) => ({
    debtId: entry.debtId,
    debtName: entry.debtName,
    priority: entry.priority,
    projectedPayoffDate: entry.projectedPayoffDate,
    monthsToPayoff: entry.monthsToPayoff,
    projectedInterest:
      entry.projectedInterestCents === null
        ? null
        : centsToDollars(entry.projectedInterestCents),
    interestSaved:
      entry.interestSavedCents === null
        ? null
        : centsToDollars(entry.interestSavedCents),
  })),
  monthsSaved: result.monthsSaved ?? null,
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
    lumpSum: centsToDollars(
      assumptions.initialLumpSumCents ??
        Object.values(assumptions.initialLumpSumAllocationsCents ?? {}).reduce(
          (total, value) => total + value,
          0,
        ),
    ),
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
  initialLumpSumDate: request.lumpSumDate
    ? ensureCalendarDate('lumpSumDate', request.lumpSumDate)
    : undefined,
  initialLumpSumCents: request.lumpSum
    ? convertMoney('lumpSum', request.lumpSum)
    : undefined,
  initialLumpSumAllocationsCents: request.initialLumpSumAllocations
    ? Object.fromEntries(
        Object.entries(request.initialLumpSumAllocations).map(([debtId, amount]) => [
          debtId,
          convertMoney(`initialLumpSumAllocations.${debtId}`, amount),
        ]),
      )
    : undefined,
});

const extraStrategyNames: Record<ExtraCashAllocationStrategy, string> = {
  highest_rate: 'Highest interest rate',
  lowest_balance: 'Lowest current balance',
  selected_debt: 'Selected debt',
  custom_priority: 'Custom ordered priority',
  custom_split: 'Custom split',
  baseline: 'Required payments only',
};

const mapExtraCashResult = (
  result: ReturnType<typeof calculateExtraCashAllocation>,
  debts: readonly PayoffDebtInput[],
  baseline: PayoffProjectionResult,
  extraMonthlyPaymentCents: number,
): ExtraCashAllocationResponse['baseline'] => {
  const projection = result.projection;
  if (!projection) {
    return {
      strategy: result.strategy,
      status: result.status,
      configurationMessage: result.configurationMessage,
      strategyName: extraStrategyNames[result.strategy],
      initialDebtName: null,
      lumpSumApplied: null,
      unusedLumpSum: null,
      extraMonthlyPayment: centsToDollars(extraMonthlyPaymentCents),
      projectedPayoffDate: null,
      projectionHorizonDate: null,
      projectionHorizonMonths: null,
      incompleteDebtNames: [],
      monthsSaved: null,
      projectedTotalInterest: null,
      directInterestSaved: null,
      rolloverInterestSaved: null,
      interestSaved: null,
      totalProjectedCashPaid: null,
      firstDebtName: null,
      firstDebtPayoffDate: null,
      finalDebtName: null,
      includedDebtCount: debts.length,
      assumptions: [],
      warnings: [],
      debts: [],
      monthlySchedule: [],
    };
  }
  const first = projection.payoffOrder[0];
  const priority = new Map(
    projection.payoffOrder.map((row) => [row.debtId, row.priority]),
  );
  return {
    strategy: result.strategy,
    status: projection.incompleteDebtIds?.length ? 'partial' : result.status,
    configurationMessage: result.configurationMessage,
    strategyName: extraStrategyNames[result.strategy],
    initialDebtName:
      debts.find((debt) => debt.debtId === result.initialDebtId)?.debtName ?? null,
    lumpSumApplied: centsToDollars(result.lumpSumAppliedCents),
    unusedLumpSum: centsToDollars(result.unusedLumpSumCents),
    extraMonthlyPayment: centsToDollars(extraMonthlyPaymentCents),
    projectedPayoffDate: projection.projectedPayoffDate,
    projectionHorizonDate: projection.projectionHorizonDate ?? null,
    projectionHorizonMonths: projection.projectionHorizonMonths ?? null,
    incompleteDebtNames: (projection.incompleteDebtIds ?? []).map(
      (debtId) => debts.find((debt) => debt.debtId === debtId)?.debtName ?? debtId,
    ),
    monthsSaved: projection.monthsSaved,
    projectedTotalInterest: centsToDollars(projection.totalProjectedInterestCents),
    directInterestSaved: centsToDollars(
      result.initialDebtId
        ? (baseline.debts.find((debt) => debt.debtId === result.initialDebtId)
            ?.projectedInterestCents ?? 0) -
            (projection.debts.find((debt) => debt.debtId === result.initialDebtId)
              ?.projectedInterestCents ?? 0)
        : 0,
    ),
    rolloverInterestSaved: centsToDollars(
      baseline.totalProjectedInterestCents -
        projection.totalProjectedInterestCents -
        (result.initialDebtId
          ? (baseline.debts.find((debt) => debt.debtId === result.initialDebtId)
              ?.projectedInterestCents ?? 0) -
            (projection.debts.find((debt) => debt.debtId === result.initialDebtId)
              ?.projectedInterestCents ?? 0)
          : 0),
    ),
    interestSaved: centsToDollars(
      baseline.totalProjectedInterestCents - projection.totalProjectedInterestCents,
    ),
    totalProjectedCashPaid: centsToDollars(
      debts.reduce((sum, debt) => sum + debt.startingBalanceCents, 0) +
        result.lumpSumAppliedCents +
        projection.totalProjectedInterestCents,
    ),
    firstDebtName: first?.debtName ?? null,
    firstDebtPayoffDate: first?.projectedPayoffDate ?? null,
    finalDebtName: projection.payoffOrder.at(-1)?.debtName ?? null,
    includedDebtCount: debts.length,
    assumptions: [...projection.assumptions],
    warnings: [...projection.warnings],
    debts: projection.debts.map((debt) => ({
      debtId: debt.debtId,
      debtName: debt.debtName,
      currentBalance: centsToDollars(
        debts.find((item) => item.debtId === debt.debtId)?.startingBalanceCents ?? 0,
      ),
      rate: `${((debts.find((item) => item.debtId === debt.debtId)?.terms.at(-1)?.interestRateMicros ?? 0) / 10000).toFixed(2)}%`,
      lumpSumApplied: centsToDollars(result.lumpSumByDebtCents[debt.debtId] ?? 0),
      requiredPaymentRolloverReceived: centsToDollars(
        projection.monthlySchedule
          .filter((entry) => entry.freedPaymentRecipientName === debt.debtName)
          .reduce((total, entry) => total + (entry.freedRequiredPaymentCents ?? 0), 0),
      ),
      baselineProjectedInterest:
        baseline.debts.find((item) => item.debtId === debt.debtId)
          ?.projectedInterestCents === null
          ? null
          : centsToDollars(
              baseline.debts.find((item) => item.debtId === debt.debtId)
                ?.projectedInterestCents ?? 0,
            ),
      extraMonthlyPaymentAllocation: centsToDollars(
        projection.monthlySchedule.find((entry) => entry.debtId === debt.debtId)
          ?.extraPaymentCents ?? 0,
      ),
      projectedPayoffDate: debt.projectedPayoffDate,
      monthsSaved: debt.projectedPayoffDate ? null : null,
      projectedInterest:
        debt.projectedInterestCents === null
          ? null
          : centsToDollars(debt.projectedInterestCents),
      interestSaved:
        baseline.debts.find((item) => item.debtId === debt.debtId)
          ?.projectedInterestCents === null || debt.projectedInterestCents === null
          ? null
          : centsToDollars(
              (baseline.debts.find((item) => item.debtId === debt.debtId)
                ?.projectedInterestCents ?? 0) - debt.projectedInterestCents,
            ),
      baselinePayoffDate:
        baseline.debts.find((item) => item.debtId === debt.debtId)
          ?.projectedPayoffDate ?? null,
      priority: priority.get(debt.debtId) ?? null,
    })),
    monthlySchedule: projection.monthlySchedule.flatMap((entry) =>
      (
        entry.debtAllocations ?? [
          {
            debtId: entry.debtId ?? '',
            requiredPaymentCents: entry.requiredPaymentCents,
            extraPaymentCents: entry.extraPaymentCents,
            interestCents: entry.interestCents ?? 0,
            endingBalanceCents: entry.endingProjectedBalanceCents,
            payoffEvent: Boolean(entry.paidOffDebtName),
          },
        ]
      ).map((allocation) => ({
        date: entry.month,
        debtName:
          debts.find((debt) => debt.debtId === allocation.debtId)?.debtName ??
          entry.debtName,
        requiredPayment: centsToDollars(allocation.requiredPaymentCents),
        lumpSumApplied: centsToDollars(
          result.lumpSumByDebtCents[allocation.debtId] ?? 0,
        ),
        extraMonthlyPayment: centsToDollars(allocation.extraPaymentCents),
        freedPaymentRollover: centsToDollars(allocation.freedPaymentCents ?? 0),
        totalPayment: centsToDollars(
          allocation.requiredPaymentCents +
            allocation.extraPaymentCents +
            (allocation.freedPaymentCents ?? 0),
        ),
        endingBalance: centsToDollars(allocation.endingBalanceCents),
        interest: centsToDollars(allocation.interestCents),
        payoffEvent: allocation.payoffEvent
          ? (debts.find((debt) => debt.debtId === allocation.debtId)?.debtName ?? null)
          : null,
        totalProjectedBalance: centsToDollars(entry.totalProjectedBalanceCents),
      })),
    ),
  };
};

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
    let purchases = 0;
    let transferIn = 0;
    let transferOut = 0;
    let payments = 0;
    let principalReduction = 0;
    let interestActivity = 0;
    let principalAdjustments = 0;
    let fees = 0;

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
        if (effectiveTransactionType === 'purchase')
          purchases += allocationTotal(allocations, ['principal']);
        if (effectiveTransactionType === 'transfer') {
          const transferPrincipal = allocationTotal(allocations, ['principal']);
          if (transferPrincipal >= 0) transferIn += transferPrincipal;
          else transferOut -= transferPrincipal;
        }
        if (effectiveTransactionType === 'payment')
          payments -= transaction.totalAmountCents;
        const principal = allocationTotal(allocations, [
          'principal',
          'extra_principal',
        ]);
        if (effectiveTransactionType === 'payment') {
          principalReduction -= principal;
        } else if (
          effectiveTransactionType !== 'borrowing_draw' &&
          effectiveTransactionType !== 'purchase' &&
          effectiveTransactionType !== 'transfer'
        ) {
          principalAdjustments += principal;
        }
        interestActivity += allocationTotal(allocations, ['interest']);
        fees += allocationTotal(allocations, ['fee']);
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
      borrowings +
      purchases +
      transferIn -
      transferOut -
      principalReduction +
      principalAdjustments -
      endingBalance;

    return {
      period,
      beginningBalance: centsToDollars(beginningBalance),
      borrowings: centsToDollars(borrowings),
      purchases: centsToDollars(purchases),
      transferIn: centsToDollars(transferIn),
      transferOut: centsToDollars(transferOut),
      netTransfers: centsToDollars(transferIn - transferOut),
      fees: centsToDollars(Math.abs(fees)),
      payments: centsToDollars(payments),
      principalReduction: centsToDollars(principalReduction),
      interestActivity: centsToDollars(Math.abs(interestActivity)),
      adjustmentsAndOther: centsToDollars(principalAdjustments),
      rollforwardCheck: centsToDollars(rollforwardCheck),
      endingBalance: centsToDollars(endingBalance),
    };
  });

const summarizeProgressRows = (
  rows: readonly DebtReportsDto['monthlyRollforward']['rows'][number][],
) => {
  const first = rows[0];
  const last = rows.at(-1);
  const total = (
    field:
      | 'principalReduction'
      | 'purchases'
      | 'borrowings'
      | 'interestActivity'
      | 'fees'
      | 'transferIn'
      | 'transferOut',
  ): number => rows.reduce((sum, row) => sum + Number(row[field] ?? '0.00'), 0);
  const principalPaid = total('principalReduction');
  const purchases = total('purchases');
  const newBorrowing = total('borrowings');
  return {
    beginningBalance: first?.beginningBalance ?? '0.00',
    endingBalance: last?.endingBalance ?? '0.00',
    principalPaid: centsToDollars(Math.round(principalPaid * 100)),
    purchases: centsToDollars(Math.round(purchases * 100)),
    newBorrowing: centsToDollars(Math.round(newBorrowing * 100)),
    netDebtReduction: centsToDollars(
      Math.round((principalPaid - purchases - newBorrowing) * 100),
    ),
    interestPaid: centsToDollars(Math.round(total('interestActivity') * 100)),
    fees: centsToDollars(Math.round(total('fees') * 100)),
    transferIn: centsToDollars(Math.round(total('transferIn') * 100)),
    transferOut: centsToDollars(Math.round(total('transferOut') * 100)),
    netTransfers: centsToDollars(
      Math.round((total('transferIn') - total('transferOut')) * 100),
    ),
  };
};

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
    const periodStartDate = isAnnual ? `${row.period}-01-01` : `${row.period}-01`;
    const periodEndDate = isAnnual
      ? `${row.period}-12-31`
      : periodEnd(row.period, 'monthly');
    const refinanceDate =
      records
        .flatMap((record) => record.refinanceEvents.map((event) => event.refinanceDate))
        .filter((date) => date >= periodStartDate && date <= periodEndDate)
        .sort()[0] ?? null;
    return {
      period: row.period,
      periodEndDate,
      grouping: 'Total debt',
      refinanceDate,
      endingBalance: row.endingBalance,
      changeFromPriorPeriod:
        change === null ? null : centsToDollars(Math.round(change * 100)),
    };
  });

  return totalRows;
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
  const progressSummary = summarizeProgressRows(monthlyRows);
  const priorStartDate = addMonths(startDate, -12);
  const priorEndDate = addMonths(endDate, -12);
  const priorRows = createRollforward(records, priorStartDate, priorEndDate, 'monthly');
  const priorSummary = summarizeProgressRows(priorRows);
  const hasPriorData = priorRows.some((row) =>
    [
      row.beginningBalance,
      row.endingBalance,
      row.principalReduction,
      row.purchases,
      row.borrowings,
      row.interestActivity,
      row.fees,
    ].some((value) => Number(value ?? '0.00') !== 0),
  );
  const trendRows = monthlyRows.map((row) => ({
    period: row.period,
    principalReduction: row.principalReduction,
    interestActivity: row.interestActivity,
    borrowings: row.borrowings,
    payments: row.payments,
    purchases: row.purchases,
    transferIn: row.transferIn,
    transferOut: row.transferOut,
    netTransfers: row.netTransfers,
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
    progressSummary: {
      ...progressSummary,
      comparison: hasPriorData
        ? {
            startDate: priorStartDate,
            endDate: priorEndDate,
            principalPaid: priorSummary.principalPaid,
            netDebtReduction: priorSummary.netDebtReduction,
            interestPaid: priorSummary.interestPaid,
            endingDebt: priorSummary.endingBalance,
          }
        : null,
    },
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

const createMilestones = (
  database: AppDatabase,
  effectiveDate: string,
  selectedScenario: PayoffScenarioDto | null,
  baselineScenario: PayoffBaselineDto | null,
): MilestonesDto => {
  const records = listDebtActivityRecords(database, true);
  const trackingStartDate =
    records.map((record) => record.debt.originationDate).sort()[0] ?? effectiveDate;
  const reports = createDebtReports(
    database,
    {
      startDate: trackingStartDate,
      endDate: effectiveDate,
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
    },
    () => `${effectiveDate}T00:00:00.000Z`,
  );
  const debtTypes = new Map(
    records.map((record) => [record.debt.id, record.debt.debtType]),
  );
  const parseDollars = (value: string): number => signedCurrencyInputToCents(value);
  const currentByDebt = new Map(
    records.map((record) => [
      record.debt.id,
      calculateLedgerBalanceThroughDate(database, record.debt.id, effectiveDate),
    ]),
  );
  const startingDebtCents = records.reduce(
    (total, record) => total + record.debt.originalPrincipalCents,
    0,
  );
  const currentDebtCents = [...currentByDebt.values()].reduce(
    (total, balance) => total + balance,
    0,
  );
  const mortgageStartingCents = records
    .filter((record) => record.debt.debtType === 'mortgage')
    .reduce((total, record) => total + record.debt.originalPrincipalCents, 0);
  const mortgageCurrentCents = records
    .filter((record) => record.debt.debtType === 'mortgage')
    .reduce((total, record) => total + (currentByDebt.get(record.debt.id) ?? 0), 0);
  const reducedCents = startingDebtCents - currentDebtCents;
  const mortgageReducedCents = mortgageStartingCents - mortgageCurrentCents;
  const nonmortgageReducedCents = reducedCents - mortgageReducedCents;
  const currentYear = effectiveDate.slice(0, 4);
  const ytdAnnual = reports.annualRollforward.rows.find(
    (row) => row.period === currentYear,
  );
  const annualPrincipalReduction = reports.annualRollforward.rows.map((row) => ({
    year: row.period,
    amount: row.principalReduction,
  }));
  const annualInterestPaid = reports.annualRollforward.rows.map((row) => ({
    year: row.period,
    amount: row.interestActivity,
  }));
  const balanceByDate = new Map<
    string,
    { total: number; mortgage: number; nonmortgage: number }
  >();
  for (const row of reports.balanceHistory.rows) {
    const current = balanceByDate.get(row.effectiveDate) ?? {
      total: 0,
      mortgage: 0,
      nonmortgage: 0,
    };
    const balance = parseDollars(row.calculatedBalance);
    current.total += balance;
    if (debtTypes.get(row.debtId) === 'mortgage') current.mortgage += balance;
    else current.nonmortgage += balance;
    balanceByDate.set(row.effectiveDate, current);
  }
  const balanceHistory = [...balanceByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      totalPrincipalBalance: centsToDollars(values.total),
      mortgagePrincipalBalance: centsToDollars(values.mortgage),
      nonmortgagePrincipalBalance: centsToDollars(values.nonmortgage),
    }));
  const scenarioComparison =
    selectedScenario && baselineScenario
      ? (() => {
          const actual = new Map(
            balanceHistory.map((point) => [point.date, point.totalPrincipalBalance]),
          );
          const baseline = new Map(
            baselineScenario.result.monthlySchedule.map((entry) => [
              entry.month,
              entry.totalProjectedBalance,
            ]),
          );
          const selected = new Map(
            selectedScenario.result.monthlySchedule.map((entry) => [
              entry.month,
              entry.totalProjectedBalance,
            ]),
          );
          const currentBalance = balanceHistory.at(-1)?.totalPrincipalBalance ?? '0.00';
          const dates = [
            ...new Set([...actual.keys(), ...baseline.keys(), ...selected.keys()]),
          ].sort();
          return dates.map((date) => ({
            date,
            actualPrincipalBalance:
              date <= effectiveDate ? (actual.get(date) ?? null) : null,
            baselinePrincipalBalance:
              date >= effectiveDate
                ? date === effectiveDate
                  ? currentBalance
                  : (baseline.get(date) ?? null)
                : null,
            selectedScenarioPrincipalBalance:
              date >= effectiveDate
                ? date === effectiveDate
                  ? currentBalance
                  : (selected.get(date) ?? null)
                : null,
          }));
        })()
      : [];
  const nextProjectedDebtPayoff =
    selectedScenario?.result.payoffOrder
      .filter(
        (item) => item.projectedPayoffDate && item.projectedPayoffDate >= effectiveDate,
      )
      .sort((left, right) =>
        (left.projectedPayoffDate ?? '').localeCompare(right.projectedPayoffDate ?? ''),
      )[0] ?? null;
  const safeCurrentDebtCents = Math.max(0, currentDebtCents);
  const nextDebtBalanceMilestoneCents =
    safeCurrentDebtCents === 0
      ? 0
      : Math.floor((safeCurrentDebtCents - 1) / 1_000_000) * 1_000_000;
  const priorDebtBalanceMilestoneCents = nextDebtBalanceMilestoneCents + 1_000_000;
  const validCreditCards = records.filter(
    (record) =>
      record.debt.status === 'active' &&
      record.debt.debtType === 'credit_card' &&
      record.debt.creditLimitCents !== null &&
      record.debt.creditLimitCents > 0,
  );
  const creditLimitCents = validCreditCards.reduce(
    (total, record) => total + (record.debt.creditLimitCents ?? 0),
    0,
  );
  const utilizationCents = validCreditCards.reduce(
    (total, record) => total + Math.max(0, currentByDebt.get(record.debt.id) ?? 0),
    0,
  );
  const priorYearDate = addMonths(effectiveDate, -12);
  const priorUtilizationCents = validCreditCards.reduce(
    (total, record) =>
      total +
      Math.max(
        0,
        calculateLedgerBalanceThroughDate(database, record.debt.id, priorYearDate),
      ),
    0,
  );
  const utilization =
    creditLimitCents > 0 ? (utilizationCents / creditLimitCents) * 100 : null;
  const priorUtilization =
    creditLimitCents > 0 ? (priorUtilizationCents / creditLimitCents) * 100 : null;

  return {
    effectiveDate,
    trackingStartDate,
    totalDebtReducedSinceTracking: centsToDollars(reducedCents),
    debtReducedYtd: ytdAnnual?.principalReduction ?? '0.00',
    startingDebt: centsToDollars(startingDebtCents),
    currentDebt: centsToDollars(currentDebtCents),
    percentageStartingDebtRemaining:
      startingDebtCents === 0
        ? '0.0%'
        : `${((currentDebtCents / startingDebtCents) * 100).toFixed(1)}%`,
    mortgageDebtReduced: centsToDollars(mortgageReducedCents),
    nonmortgageDebtReduced: centsToDollars(nonmortgageReducedCents),
    nextProjectedDebtPayoff: nextProjectedDebtPayoff
      ? {
          debtId: nextProjectedDebtPayoff.debtId,
          debtName: nextProjectedDebtPayoff.debtName,
          projectedPayoffDate: nextProjectedDebtPayoff.projectedPayoffDate!,
        }
      : null,
    nextDebtBalanceMilestone: centsToDollars(nextDebtBalanceMilestoneCents),
    dollarsRemainingToNextDebtBalanceMilestone: centsToDollars(
      safeCurrentDebtCents - nextDebtBalanceMilestoneCents,
    ),
    percentProgressFromPriorDebtBalanceMilestone:
      safeCurrentDebtCents === 0
        ? '100.0%'
        : `${Math.max(
            0,
            Math.min(
              100,
              ((priorDebtBalanceMilestoneCents - safeCurrentDebtCents) / 1_000_000) *
                100,
            ),
          ).toFixed(1)}%`,
    interestPaidYtd: ytdAnnual?.interestActivity ?? '0.00',
    interestSavedFromSelectedScenario: selectedScenario?.result.interestSavings ?? null,
    currentCreditUtilization:
      utilization === null ? null : `${utilization.toFixed(1)}%`,
    priorYearCreditUtilization:
      priorUtilization === null ? null : `${priorUtilization.toFixed(1)}%`,
    selectedScenario: selectedScenario
      ? { id: selectedScenario.id, name: selectedScenario.name }
      : null,
    balanceHistory,
    annualPrincipalReduction,
    annualInterestPaid,
    baselinePayoffDate: baselineScenario?.result.projectedPayoffDate ?? null,
    selectedScenarioPayoffDate: selectedScenario?.result.projectedPayoffDate ?? null,
    scenarioComparison,
  };
};

const debtOutlookMonthStart = (date: string, offset: number): string =>
  addMonths(`${date.slice(0, 7)}-01`, offset);

const debtOutlookMonthEnd = (month: string): string => {
  const nextMonth = addMonths(month, 1);
  return previousFinancialDate(nextMonth);
};

const createDebtOutlook = (
  database: AppDatabase,
  effectiveDate: string,
  scenarioId: string | null,
  calculateResult: (assumptions: PayoffAssumptions) => PayoffProjectionResult,
  getScenario: (id: string) => PayoffScenarioRecord,
): DebtOutlookDto => {
  const records = listActiveDebtActivityRecords(database).filter(
    (record) => record.debt.status === 'active',
  );
  const months = Array.from({ length: 12 }, (_, index) =>
    debtOutlookMonthStart(effectiveDate, index),
  );
  const windowEnd = debtOutlookMonthEnd(months.at(-1)!);
  const baselineResult = calculateResult({
    scenarioStartDate: effectiveDate,
    strategy: 'baseline',
    extraMonthlyPaymentCents: 0,
    customPriority: [],
    variableRateOverrides: {},
    maxProjectionMonths: 12,
  });
  let selectedResult: PayoffProjectionResult | null = null;
  let scenarioName = 'Required payments only';
  let selectedScenarioId: string | null = null;
  if (scenarioId) {
    const scenario = getScenario(scenarioId);
    const assumptions = parsePayoffAssumptions(scenario.assumptionsJson);
    selectedResult = calculateResult({
      ...assumptions,
      scenarioStartDate: effectiveDate,
      maxProjectionMonths: Math.max(12, assumptions.maxProjectionMonths),
    });
    scenarioName = scenario.name;
    selectedScenarioId = scenario.id;
  }

  const resultForOutlook = selectedResult ?? baselineResult;
  const allocationByMonthAndDebt = new Map<
    string,
    Map<
      string,
      NonNullable<
        PayoffProjectionResult['monthlySchedule'][number]['debtAllocations']
      >[number]
    >
  >();
  for (const row of resultForOutlook.monthlySchedule) {
    const allocations = new Map(
      (row.debtAllocations ?? []).map((allocation) => [allocation.debtId, allocation]),
    );
    allocationByMonthAndDebt.set(monthKey(row.month), allocations);
  }
  const payoffDates = new Map(
    resultForOutlook.debts
      .filter((debt) => debt.projectedPayoffDate)
      .map((debt) => [debt.debtId, debt.projectedPayoffDate!]),
  );
  const warnings: string[] = [];
  const detailRowsByMonth = new Map<
    string,
    DebtOutlookDto['months'][number]['details']
  >();

  for (const month of months) {
    const details: DebtOutlookDto['months'][number]['details'] = [];
    for (const record of records) {
      const balance = calculateLedgerBalanceThroughDate(
        database,
        record.debt.id,
        effectiveDate,
      );
      if (balance <= 0) continue;
      if (record.debt.paymentDueDay === null) {
        warnings.push(`${record.debt.name}: missing due day; payment not projected.`);
        continue;
      }
      if (record.debt.paymentScheduleStartDate === null) {
        warnings.push(
          `${record.debt.name}: missing scheduling start date; payment not projected.`,
        );
        continue;
      }
      const dueDate = dueDateForMonth(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        record.debt.paymentDueDay,
      );
      if (dueDate < record.debt.paymentScheduleStartDate) continue;
      const term = currentTermForDate(record.terms, dueDate);
      if (term.paymentFrequency !== 'monthly') {
        warnings.push(
          `${record.debt.name}: ${term.paymentFrequency} scheduling is unsupported; payment not projected.`,
        );
        continue;
      }
      const payoffDate = payoffDates.get(record.debt.id);
      if (payoffDate && dueDate > payoffDate) continue;
      const allocation = allocationByMonthAndDebt
        .get(monthKey(month))
        ?.get(record.debt.id);
      const plannedExtraPayment = allocation?.extraPaymentCents ?? 0;
      const projectedEndingBalance = allocation
        ? centsToDollars(allocation.endingBalanceCents)
        : null;
      details.push({
        debtId: record.debt.id,
        debtName: record.debt.name,
        dueDate,
        requiredPayment: centsToDollars(term.requiredPaymentCents),
        plannedExtraPayment: centsToDollars(plannedExtraPayment),
        totalPlannedPayment: centsToDollars(
          term.requiredPaymentCents + plannedExtraPayment,
        ),
        projectedEndingBalance,
      });
    }
    details.sort(
      (left, right) =>
        left.dueDate.localeCompare(right.dueDate) ||
        left.debtName.localeCompare(right.debtName),
    );
    detailRowsByMonth.set(monthKey(month), details);
  }

  const outlookMonths = months.map((month) => {
    const details = detailRowsByMonth.get(monthKey(month)) ?? [];
    const requiredPayments = details.reduce(
      (total, detail) => total + signedCurrencyInputToCents(detail.requiredPayment),
      0,
    );
    const plannedExtraPayments = details.reduce(
      (total, detail) => total + signedCurrencyInputToCents(detail.plannedExtraPayment),
      0,
    );
    const payoffRows = resultForOutlook.debts
      .filter(
        (debt) =>
          debt.projectedPayoffDate !== null &&
          monthKey(debt.projectedPayoffDate) === monthKey(month),
      )
      .map((debt) => ({ debtId: debt.debtId, debtName: debt.debtName }));
    return {
      month,
      requiredPayments: centsToDollars(requiredPayments),
      plannedExtraPayments: centsToDollars(plannedExtraPayments),
      totalDebtService: centsToDollars(requiredPayments + plannedExtraPayments),
      debtPayoffs: payoffRows,
      details,
    };
  });

  const events: DebtOutlookDto['events'] = [];
  for (const record of records) {
    const addEvent = (
      date: string,
      eventType: DebtOutlookDto['events'][number]['eventType'],
      description: string,
    ): void => {
      if (date >= effectiveDate && date <= windowEnd) {
        events.push({
          date,
          debtId: record.debt.id,
          debtName: record.debt.name,
          eventType,
          description,
        });
      }
    };
    const payoffDate = payoffDates.get(record.debt.id);
    if (payoffDate) addEvent(payoffDate, 'payoff', 'Projected payoff.');
    if (record.debt.maturityDate)
      addEvent(record.debt.maturityDate, 'maturity', 'Maturity date.');
    for (const term of record.terms) {
      if (term.effectiveStartDate < effectiveDate) continue;
      const prior = record.terms
        .filter((candidate) => candidate.effectiveStartDate < term.effectiveStartDate)
        .at(-1);
      if (!prior) continue;
      if (
        prior.interestRateType !== term.interestRateType ||
        prior.interestRateMicros !== term.interestRateMicros
      )
        addEvent(term.effectiveStartDate, 'rate_change', 'Interest rate changes.');
      if (prior.requiredPaymentCents !== term.requiredPaymentCents)
        addEvent(
          term.effectiveStartDate,
          'required_payment_change',
          'Required payment changes.',
        );
      if (
        prior.paymentFrequency !== term.paymentFrequency ||
        prior.dayCountConvention !== term.dayCountConvention ||
        prior.calculationConvention !== term.calculationConvention
      )
        addEvent(term.effectiveStartDate, 'term_change', 'Debt terms change.');
    }
    for (const refinance of record.refinanceEvents)
      addEvent(refinance.refinanceDate, 'refinance', 'In-place refinance event.');
  }
  events.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.debtName.localeCompare(right.debtName),
  );

  const totals = outlookMonths.map((month) =>
    signedCurrencyInputToCents(month.totalDebtService),
  );
  const requiredTotal = outlookMonths.reduce(
    (total, month) => total + signedCurrencyInputToCents(month.requiredPayments),
    0,
  );
  const extraTotal = outlookMonths.reduce(
    (total, month) => total + signedCurrencyInputToCents(month.plannedExtraPayments),
    0,
  );
  const highestIndex = totals.indexOf(Math.max(...totals));
  const lowestIndex = totals.indexOf(Math.min(...totals));
  return {
    effectiveDate,
    scenario: { id: selectedScenarioId, name: scenarioName },
    months: outlookMonths,
    events,
    requiredPaymentsTotal: centsToDollars(requiredTotal),
    plannedExtraPaymentsTotal: centsToDollars(extraTotal),
    totalPlannedDebtService: centsToDollars(requiredTotal + extraTotal),
    averageMonthlyDebtService: centsToDollars(
      Math.round((requiredTotal + extraTotal) / 12),
    ),
    highestPaymentMonth: {
      month: months[highestIndex]!,
      amount: centsToDollars(totals[highestIndex]!),
    },
    lowestPaymentMonth: {
      month: months[lowestIndex]!,
      amount: centsToDollars(totals[lowestIndex]!),
    },
    projectedDebtPayoffCount: outlookMonths.reduce(
      (total, month) => total + month.debtPayoffs.length,
      0,
    ),
    warnings: [...new Set(warnings)],
  };
};

const createInterestAnalysis = (
  database: AppDatabase,
  effectiveDate: string,
  request: GetInterestAnalysisRequest,
  calculateResult: (assumptions: PayoffAssumptions) => PayoffProjectionResult,
): InterestAnalysisDto => {
  const parsed = getInterestAnalysisRequestSchema.parse(request);
  const records = listActiveDebtActivityRecords(database).filter((record) => {
    const balance = calculateLedgerBalanceThroughDate(
      database,
      record.debt.id,
      effectiveDate,
    );
    if (record.debt.status !== 'active' || balance <= 0) return false;
    if (parsed.debtType && record.debt.debtType !== parsed.debtType) return false;
    if (parsed.segment === 'mortgage' && record.debt.debtType !== 'mortgage')
      return false;
    if (parsed.segment === 'nonmortgage' && record.debt.debtType === 'mortgage')
      return false;
    if (
      parsed.segment === 'revolving' &&
      !['credit_card', 'heloc'].includes(record.debt.debtType)
    )
      return false;
    if (
      parsed.segment === 'installment' &&
      ['credit_card', 'heloc'].includes(record.debt.debtType)
    )
      return false;
    return true;
  });
  if (records.length === 0) {
    throw new ApplicationServiceError(
      'validation',
      'No active positive-balance debts match the selected filters.',
    );
  }
  const activeIds = new Set(records.map((record) => record.debt.id));
  const inputs = buildPayoffDebtInputs(database, effectiveDate).filter((input) =>
    activeIds.has(input.debtId),
  );
  const baseline = calculateResult({
    scenarioStartDate: effectiveDate,
    strategy: 'baseline',
    extraMonthlyPaymentCents: 0,
    customPriority: [],
    variableRateOverrides: {},
    maxProjectionMonths: 600,
  });
  const reports = createDebtReports(
    database,
    {
      startDate: `${effectiveDate.slice(0, 4)}-01-01`,
      endDate: effectiveDate,
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: 'active',
    },
    () => `${effectiveDate}T00:00:00.000Z`,
  );
  const ytdInterestByDebt = new Map<string, number>();
  for (const row of reports.activityTrends.annualInterestByDebt) {
    ytdInterestByDebt.set(row.debtId, signedCurrencyInputToCents(row.interestExpense));
  }
  const baselineInterest = new Map(
    baseline.debts.map((debt) => [debt.debtId, debt.projectedInterestCents]),
  );
  const portfolioInterestCents = baseline.totalProjectedInterestCents;
  const compare = (
    debtId: string,
    lumpSumCents: number,
    extraMonthlyPaymentCents: number,
  ): {
    readonly appliedAmount: string;
    readonly directInterestSaved: string | null;
    readonly redirectedInterestSaved: string | null;
    readonly totalInterestSaved: string | null;
    readonly projectedPayoffDate: string | null;
    readonly monthsSaved: number | null;
  } => {
    const calculation = calculateExtraCashAllocation({
      debts: inputs,
      analysisDate: effectiveDate,
      lumpSumCents,
      extraMonthlyPaymentCents,
      strategy: 'selected_debt',
      selectedDebtId: debtId,
      priority: [],
      maxProjectionMonths: 600,
    });
    const projection = calculation.projection;
    const baselineDebtInterest = baselineInterest.get(debtId);
    const scenarioDebt = projection?.debts.find((debt) => debt.debtId === debtId);
    const directInterestSaved =
      baselineDebtInterest === null ||
      baselineDebtInterest === undefined ||
      scenarioDebt?.projectedInterestCents === null ||
      scenarioDebt?.projectedInterestCents === undefined
        ? null
        : baselineDebtInterest - scenarioDebt.projectedInterestCents;
    const totalInterestSaved = projection
      ? portfolioInterestCents - projection.totalProjectedInterestCents
      : null;
    const redirectedInterestSaved =
      totalInterestSaved === null || directInterestSaved === null
        ? null
        : totalInterestSaved - directInterestSaved;
    return {
      appliedAmount: centsToDollars(calculation.lumpSumAppliedCents),
      directInterestSaved:
        directInterestSaved === null ? null : centsToDollars(directInterestSaved),
      redirectedInterestSaved:
        redirectedInterestSaved === null
          ? null
          : centsToDollars(redirectedInterestSaved),
      totalInterestSaved:
        totalInterestSaved === null ? null : centsToDollars(totalInterestSaved),
      projectedPayoffDate: scenarioDebt?.projectedPayoffDate ?? null,
      monthsSaved: projection?.monthsSaved ?? null,
    };
  };
  const rows = records.map((record) => {
    const debtId = record.debt.id;
    const currentBalance = calculateLedgerBalanceThroughDate(
      database,
      debtId,
      effectiveDate,
    );
    const term = currentTermForDate(record.terms, effectiveDate);
    const baselineDebt = baseline.debts.find((debt) => debt.debtId === debtId);
    const lump = compare(debtId, 100_000, 0);
    const monthly = compare(debtId, 0, 10_000);
    const projectedInterest = baselineInterest.get(debtId);
    return {
      debtId,
      debtName: record.debt.name,
      debtType: record.debt.debtType,
      currentBalance: centsToDollars(currentBalance),
      currentInterestRate: `${rateMicrosToPercentString(term.interestRateMicros)}%`,
      interestPaidYtd: centsToDollars(ytdInterestByDebt.get(debtId) ?? 0),
      projectedRemainingInterest:
        projectedInterest === null || projectedInterest === undefined
          ? null
          : centsToDollars(projectedInterest),
      shareOfPortfolioInterest:
        portfolioInterestCents > 0 &&
        projectedInterest !== null &&
        projectedInterest !== undefined
          ? `${((projectedInterest / portfolioInterestCents) * 100).toFixed(1)}%`
          : '0.0%',
      lumpSumSavings: {
        appliedAmount: lump.appliedAmount,
        directInterestSaved: lump.directInterestSaved,
        redirectedInterestSaved: lump.redirectedInterestSaved,
        totalInterestSaved: lump.totalInterestSaved,
      },
      monthlySavings: {
        appliedAmount: '100.00',
        directInterestSaved: monthly.directInterestSaved,
        redirectedInterestSaved: monthly.redirectedInterestSaved,
        totalInterestSaved: monthly.totalInterestSaved,
        monthsSaved: monthly.monthsSaved,
      },
      baselinePayoffDate: baselineDebt?.projectedPayoffDate ?? null,
      lumpSumPayoffDate: lump.projectedPayoffDate,
      monthlyPayoffDate: monthly.projectedPayoffDate,
    };
  });
  const best = (
    selector: (row: (typeof rows)[number]) => number,
    label: string,
    formatter: (row: (typeof rows)[number]) => string,
  ) => {
    const row = [...rows].sort((left, right) => selector(right) - selector(left))[0];
    return row
      ? { label, debtId: row.debtId, debtName: row.debtName, value: formatter(row) }
      : { label, debtId: null, debtName: null, value: 'Not available' };
  };
  const numeric = (value: string | null): number =>
    value === null ? 0 : signedCurrencyInputToCents(value);
  return {
    effectiveDate,
    filters: { debtType: parsed.debtType, segment: parsed.segment },
    rows,
    baselinePortfolioInterest: centsToDollars(portfolioInterestCents),
    baselinePortfolioPayoffDate: baseline.projectedPayoffDate,
    interpretations: [
      best(
        (row) => Number(row.currentInterestRate.replace('%', '')),
        'Highest current rate',
        (row) => row.currentInterestRate,
      ),
      best(
        (row) => numeric(row.projectedRemainingInterest),
        'Largest projected interest cost',
        (row) => row.projectedRemainingInterest ?? 'Not available',
      ),
      best(
        (row) => numeric(row.lumpSumSavings.totalInterestSaved),
        'Best $1,000 lump-sum savings',
        (row) => row.lumpSumSavings.totalInterestSaved ?? 'Not available',
      ),
      best(
        (row) => numeric(row.monthlySavings.totalInterestSaved),
        'Best $100/month savings',
        (row) => row.monthlySavings.totalInterestSaved ?? 'Not available',
      ),
    ],
    warnings: [...new Set(baseline.warnings)],
  };
};

const monthlyPaymentForRefinance = (
  principal: number,
  rateMicros: number,
  months: number,
): number => {
  if (months <= 0) return principal;
  if (rateMicros === 0) return Math.ceil(principal / months);
  const monthlyRate = rateMicros / 1_000_000 / 12;
  return Math.ceil(
    (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)),
  );
};

const createRefinanceAnalysis = (
  database: AppDatabase,
  request: GetRefinanceAnalysisRequest,
): RefinanceAnalysisDto => {
  const parsed = getRefinanceAnalysisRequestSchema.parse(request);
  const record = getDebtActivityRecord(database, parsed.debtId);
  if (!record || record.debt.status !== 'active')
    throw new ApplicationServiceError(
      'not_found',
      'Eligible active debt was not found.',
    );
  const balance = calculateLedgerBalanceThroughDate(
    database,
    parsed.debtId,
    parsed.refinanceDate,
  );
  if (balance <= 0)
    throw new ApplicationServiceError(
      'validation',
      'The selected debt has no positive calculated balance on the refinance date.',
    );
  const currentInput = buildPayoffDebtInputs(database, parsed.refinanceDate).find(
    (input) => input.debtId === parsed.debtId,
  );
  if (!currentInput)
    throw new ApplicationServiceError(
      'validation',
      'The selected debt cannot be projected with its current terms.',
    );
  const current = projectPayoffScenario([currentInput], {
    scenarioStartDate: parsed.refinanceDate,
    strategy: 'baseline',
    extraMonthlyPaymentCents: 0,
    customPriority: [],
    variableRateOverrides: {},
    maxProjectionMonths: parsed.maxProjectionMonths,
  });
  const newPrincipal =
    currencyInputToCents(parsed.newPrincipal) +
    currencyInputToCents(parsed.financedClosingCosts ?? '0');
  const rateMicros = percentageInputToRateMicros(parsed.newAnnualInterestRatePercent);
  const payment = parsed.newRequiredPayment
    ? currencyInputToCents(parsed.newRequiredPayment)
    : monthlyPaymentForRefinance(newPrincipal, rateMicros, parsed.newTermMonths);
  const refinanceInput: PayoffDebtInput = {
    debtId: `${parsed.debtId}-refinance`,
    debtName: record.debt.name,
    creditor: record.debt.creditor,
    debtType: record.debt.debtType,
    startingBalanceCents: newPrincipal,
    maturityDate: parsed.newMaturityDate ?? null,
    terms: [
      {
        effectiveStartDate: parsed.refinanceDate,
        effectiveEndDate: null,
        interestRateType: parsed.newRateType ?? 'fixed',
        interestRateMicros: rateMicros,
        requiredPaymentCents: payment,
        paymentFrequency: 'monthly',
        dayCountConvention: 'monthly',
        calculationConvention: 'amortized_monthly',
      },
    ],
  };
  const refinance = projectPayoffScenario([refinanceInput], {
    scenarioStartDate: parsed.refinanceDate,
    strategy: 'baseline',
    extraMonthlyPaymentCents: 0,
    customPriority: [],
    variableRateOverrides: {},
    maxProjectionMonths: parsed.maxProjectionMonths,
  });
  const currentDebt = current.debts[0]!;
  const refinanceDebt = refinance.debts[0]!;
  const cashCosts = currencyInputToCents(parsed.cashClosingCosts ?? '0');
  const cashOut = currencyInputToCents(parsed.cashOutAmount ?? '0');
  const toSeries = (result: PayoffProjectionResult, extraInitialCash: number) => {
    let cumulative = extraInitialCash;
    return result.monthlySchedule.map((point) => {
      cumulative += point.totalPaymentCents;
      return {
        date: point.month,
        balance: centsToDollars(point.totalProjectedBalanceCents),
        cumulativeCashOutflow: centsToDollars(cumulative),
        interest: centsToDollars(point.interestCents ?? 0),
      };
    });
  };
  const currentSeries = toSeries(current, 0);
  const refinanceSeries = toSeries(refinance, cashCosts);
  const currentTotal =
    currentDebt.projectedInterestCents === null
      ? null
      : currentSeries.reduce(
          (sum, point) => sum + currencyInputToCents(point.interest),
          0,
        );
  const refinanceTotal =
    refinanceDebt.projectedInterestCents === null
      ? null
      : refinanceSeries.reduce(
          (sum, point) => sum + currencyInputToCents(point.interest),
          0,
        );
  const breakEvenIndex = refinanceSeries.findIndex(
    (point, index) =>
      currencyInputToCents(point.cumulativeCashOutflow) <=
      currencyInputToCents(
        currentSeries[index]?.cumulativeCashOutflow ?? point.cumulativeCashOutflow,
      ),
  );
  const paymentChange = payment - currentDebt.requiredMonthlyPaymentCents;
  const totalCashDifference =
    currentSeries.length && refinanceSeries.length
      ? currencyInputToCents(currentSeries.at(-1)!.cumulativeCashOutflow) -
        currencyInputToCents(refinanceSeries.at(-1)!.cumulativeCashOutflow)
      : null;
  const monthsDifference =
    currentDebt.projectedPayoffDate && refinanceDebt.projectedPayoffDate
      ? Math.round(
          (Date.parse(`${refinanceDebt.projectedPayoffDate}T00:00:00Z`) -
            Date.parse(`${currentDebt.projectedPayoffDate}T00:00:00Z`)) /
            (86400000 * 30.4375),
        )
      : null;
  const interestDifference =
    currentTotal !== null && refinanceTotal !== null
      ? currentTotal - refinanceTotal
      : null;
  const winner = (
    left: number | null,
    right: number | null,
  ): 'current' | 'refinance' | 'tie' =>
    left === null || right === null
      ? 'tie'
      : left === right
        ? 'tie'
        : left < right
          ? 'current'
          : 'refinance';
  return {
    debtId: parsed.debtId,
    debtName: record.debt.name,
    effectiveDate: parsed.refinanceDate,
    current: {
      balance: centsToDollars(balance),
      rate: rateMicrosToPercentString(
        currentInput.terms.find(
          (term) => term.effectiveStartDate <= parsed.refinanceDate,
        )?.interestRateMicros ?? 0,
      ),
      requiredPayment: centsToDollars(currentDebt.requiredMonthlyPaymentCents),
      payoffDate: currentDebt.projectedPayoffDate,
      projectedInterest: currentTotal === null ? null : centsToDollars(currentTotal),
      series: currentSeries,
    },
    refinance: {
      principal: centsToDollars(newPrincipal),
      rate: rateMicrosToPercentString(rateMicros),
      requiredPayment: centsToDollars(payment),
      payoffDate: refinanceDebt.projectedPayoffDate,
      projectedInterest:
        refinanceTotal === null ? null : centsToDollars(refinanceTotal),
      cashClosingCosts: centsToDollars(cashCosts),
      financedClosingCosts: centsToDollars(
        currencyInputToCents(parsed.financedClosingCosts ?? '0'),
      ),
      cashOutAmount: centsToDollars(cashOut),
      series: refinanceSeries,
    },
    paymentChange: centsToDollars(paymentChange),
    interestDifference:
      interestDifference === null ? '0.00' : centsToDollars(interestDifference),
    totalCashDifference:
      totalCashDifference === null ? '0.00' : centsToDollars(totalCashDifference),
    monthsDifference,
    breakEvenMonth: breakEvenIndex < 0 ? null : breakEvenIndex + 1,
    breakEvenDate: breakEvenIndex < 0 ? null : refinanceSeries[breakEvenIndex]!.date,
    netBenefitThroughPayoff:
      totalCashDifference === null ? '0.00' : centsToDollars(totalCashDifference),
    interpretations: [
      {
        label: 'Monthly payment',
        winner: paymentChange < 0 ? 'refinance' : paymentChange > 0 ? 'current' : 'tie',
        detail: centsToDollars(Math.abs(paymentChange)),
      },
      {
        label: 'Earliest payoff',
        winner:
          monthsDifference === null
            ? 'tie'
            : monthsDifference < 0
              ? 'refinance'
              : monthsDifference > 0
                ? 'current'
                : 'tie',
        detail:
          monthsDifference === null
            ? 'Not available'
            : `${Math.abs(monthsDifference)} months`,
      },
      {
        label: 'Total interest',
        winner: winner(currentTotal, refinanceTotal),
        detail:
          interestDifference === null
            ? 'Not available'
            : centsToDollars(Math.abs(interestDifference)),
      },
      {
        label: 'Break-even',
        winner: breakEvenIndex < 0 ? 'current' : 'refinance',
        detail:
          breakEvenIndex < 0 ? 'Never reached' : refinanceSeries[breakEvenIndex]!.date,
      },
      {
        label: 'Net benefit through payoff',
        winner:
          totalCashDifference === null
            ? 'tie'
            : totalCashDifference > 0
              ? 'refinance'
              : totalCashDifference < 0
                ? 'current'
                : 'tie',
        detail:
          totalCashDifference === null
            ? 'Not available'
            : centsToDollars(Math.abs(totalCashDifference)),
      },
    ],
    warnings: [
      ...current.warnings,
      ...refinance.warnings,
      ...(cashOut > 0
        ? ['Cash-out proceeds are shown separately and are not treated as savings.']
        : []),
    ],
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

    getDataHealth: (request) => {
      try {
        getDataHealthRequestSchema.parse(request);
        return createDataHealth(
          database,
          listActiveDebtActivityRecords(database),
          currentFinancialDate(now),
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    getMilestones: (request) => {
      try {
        const parsed = getMilestonesRequestSchema.parse(request);
        const effectiveDate = currentFinancialDate(now);
        if (!parsed.scenarioId)
          return createMilestones(database, effectiveDate, null, null);

        const scenarioRecord = getScenarioOrThrow(parsed.scenarioId);
        const savedScenario = mapPayoffScenario(scenarioRecord);
        const savedAssumptions = parsePayoffAssumptions(scenarioRecord.assumptionsJson);
        const currentAssumptions: PayoffAssumptions = {
          ...savedAssumptions,
          scenarioStartDate: effectiveDate,
        };
        const selectedScenario: PayoffScenarioDto = {
          ...savedScenario,
          scenarioStartDate: effectiveDate,
          result: mapPayoffResult(calculatePayoffResult(currentAssumptions)),
        };
        const baselineAssumptions: PayoffAssumptions = {
          scenarioStartDate: effectiveDate,
          strategy: 'baseline',
          extraMonthlyPaymentCents: 0,
          customPriority: [],
          variableRateOverrides: {},
          maxProjectionMonths: savedAssumptions.maxProjectionMonths,
        };
        const baselineResult = mapPayoffResult(
          calculatePayoffResult(baselineAssumptions),
        );
        const baselineScenario: PayoffBaselineDto = {
          id: 'generated-required-payments-baseline',
          name: 'Required payments only',
          strategy: 'baseline',
          scenarioStartDate: effectiveDate,
          extraMonthlyPayment: '0.00',
          lumpSum: '0.00',
          maxProjectionMonths: savedAssumptions.maxProjectionMonths,
          result: baselineResult,
          calculationEngineVersion: PAYOFF_ENGINE_VERSION,
        };
        return createMilestones(
          database,
          effectiveDate,
          selectedScenario,
          baselineScenario,
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    getDebtOutlook: (request) => {
      try {
        const parsed = getDebtOutlookRequestSchema.parse(request);
        const effectiveDate = currentFinancialDate(now);
        return createDebtOutlook(
          database,
          effectiveDate,
          parsed.scenarioId,
          calculatePayoffResult,
          getScenarioOrThrow,
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    getInterestAnalysis: (request) => {
      try {
        const parsed = getInterestAnalysisRequestSchema.parse(request);
        return createInterestAnalysis(
          database,
          currentFinancialDate(now),
          parsed,
          calculatePayoffResult,
        );
      } catch (error) {
        return normalizeError(error);
      }
    },

    getRefinanceAnalysis: (request) => {
      try {
        return createRefinanceAnalysis(database, request);
      } catch (error) {
        return normalizeError(error);
      }
    },

    acceptCurrentBalance: (request) => {
      try {
        const parsed = acceptCurrentBalanceRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.debtId);
        if (existing.debt.archivedAtUtc || existing.debt.status !== 'active') {
          throw new ApplicationServiceError(
            'conflict',
            'Only an active debt can accept a current balance.',
          );
        }
        const effectiveDate = currentFinancialDate(now);
        const healthRow = createDataHealth(database, [existing], effectiveDate).rows[0];
        const eligibleReasons = new Set([
          'never_reconciled',
          'activity_since_reconciliation',
          'edited_or_voided_activity',
          'refinance_activity',
          'stale_reconciliation',
          'reconciliation_exception',
        ]);
        if (!healthRow?.reasons.some((reason) => eligibleReasons.has(reason.code))) {
          throw new ApplicationServiceError(
            'conflict',
            'The current balance cannot resolve any remaining data-health issue.',
          );
        }
        const applicationCalculatedBalanceCents = calculateLedgerBalanceThroughDate(
          database,
          parsed.debtId,
          effectiveDate,
        );
        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        const reconciliationId = createId();
        const existingCurrent = existing.balanceReconciliations.find(
          (reconciliation) =>
            reconciliation.statementDate === effectiveDate &&
            reconciliation.lifecycleStatus === 'current',
        );
        const snapshotId = createId();
        createBalanceReconciliationRecord(database, {
          reconciliation: {
            id: reconciliationId,
            debtId: parsed.debtId,
            statementDate: effectiveDate,
            statementEndingBalanceCents: applicationCalculatedBalanceCents,
            applicationCalculatedBalanceCents,
            reconciliationStatus: 'reconciled',
            explanation:
              'User accepted the application-calculated balance as the current control balance.',
            approvedAdjustmentTransactionId: null,
            sourceReference: 'application-calculated-acceptance',
            supportingNotes: 'Accepted application balance; not lender-verified.',
            lifecycleStatus: 'current',
            supersedesReconciliationId: existingCurrent?.id ?? null,
            supersededByReconciliationId: null,
            voidedAtUtc: null,
            supersededAtUtc: null,
            createdAtUtc: timestamp,
            updatedAtUtc: timestamp,
          },
          snapshot: {
            id: snapshotId,
            debtId: parsed.debtId,
            effectiveDate,
            confirmedBalanceCents: applicationCalculatedBalanceCents,
            sourceType: 'manual',
            sourceReference: `application-calculated-acceptance:${reconciliationId}`,
            notes: 'Accepted application balance; not lender-verified.',
            createdAtUtc: timestamp,
            updatedAtUtc: timestamp,
          },
          supersedes: existingCurrent
            ? {
                id: existingCurrent.id,
                expectedUpdatedAtUtc: existingCurrent.updatedAtUtc,
                supersededAtUtc: timestamp,
              }
            : undefined,
          auditInputs: [
            createReconciliationAudit(
              createId(),
              reconciliationId,
              'application_balance_accepted',
              'create',
              timestamp,
              'Application-calculated balance was accepted as the current control balance; not lender-verified.',
              { effectiveDate, applicationCalculatedBalanceCents },
            ),
            createSnapshotAudit(
              createId(),
              snapshotId,
              'application_balance_snapshot_recorded',
              'create',
              timestamp,
              'Application-calculated balance snapshot recorded as manual, not lender-verified evidence.',
              { sourceType: 'manual', reconciliationId },
            ),
          ],
        });
        return mapDetail(database, getRecordOrThrow(parsed.debtId), effectiveDate);
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

    calculatePayoffBaseline: (request) => {
      try {
        const parsed = calculatePayoffBaselineRequestSchema.parse(request);
        const scenarioStartDate = ensureCalendarDate(
          'scenarioStartDate',
          parsed.scenarioStartDate,
        );
        const assumptions: PayoffAssumptions = {
          scenarioStartDate,
          strategy: 'baseline',
          extraMonthlyPaymentCents: 0,
          customPriority: [],
          variableRateOverrides: {},
          maxProjectionMonths: parsed.maxProjectionMonths,
        };
        const result = calculatePayoffResult(assumptions);
        return {
          id: 'generated-required-payments-baseline',
          name: 'Required payments only',
          strategy: 'baseline',
          scenarioStartDate,
          extraMonthlyPayment: '0.00',
          lumpSum: '0.00',
          maxProjectionMonths: parsed.maxProjectionMonths,
          result: mapPayoffResult(result),
          calculationEngineVersion: PAYOFF_ENGINE_VERSION,
        };
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

    calculateExtraCashAllocation: (request) => {
      try {
        const parsed = extraCashAllocationRequestSchema.parse(request);
        const analysisDate = ensureCalendarDate('analysisDate', parsed.analysisDate);
        const records = listActiveDebtActivityRecords(database);
        const eligibleDebts: ExtraCashAllocationResponse['eligibleDebts'][number][] =
          [];
        const inputs: PayoffDebtInput[] = [];
        for (const record of records) {
          const balance = calculateLedgerBalanceThroughDate(
            database,
            record.debt.id,
            analysisDate,
          );
          const term = [...record.terms]
            .filter(
              (candidate) =>
                candidate.effectiveStartDate <= analysisDate &&
                (candidate.effectiveEndDate === null ||
                  candidate.effectiveEndDate >= analysisDate),
            )
            .sort((left, right) =>
              right.effectiveStartDate.localeCompare(left.effectiveStartDate),
            )[0];
          let reason: string | null = null;
          if (parsed.excludedDebtIds.includes(record.debt.id))
            reason = 'Manually excluded.';
          else if (balance <= 0) reason = 'Current balance is zero or below.';
          else if (!term) reason = 'No current term exists as of the analysis date.';
          else if (
            term.paymentFrequency === 'irregular' ||
            term.paymentFrequency === 'other'
          )
            reason = 'Payment frequency is unsupported.';
          else if (term.requiredPaymentCents <= 0)
            reason = 'Required payment is invalid.';
          else if (term.interestRateType === 'variable')
            reason = 'Variable-rate debt requires an explicit rate assumption.';
          eligibleDebts.push({
            debtName: record.debt.name,
            included: reason === null,
            reason,
          });
          if (reason === null && term) {
            inputs.push({
              debtId: record.debt.id,
              debtName: record.debt.name,
              creditor: record.debt.creditor,
              debtType: record.debt.debtType,
              startingBalanceCents: balance,
              maturityDate: record.debt.maturityDate,
              terms: record.terms.map((item) => ({
                effectiveStartDate: item.effectiveStartDate,
                effectiveEndDate: item.effectiveEndDate,
                interestRateType: item.interestRateType,
                interestRateMicros: item.interestRateMicros,
                requiredPaymentCents: item.requiredPaymentCents,
                paymentFrequency: item.paymentFrequency,
                dayCountConvention: item.dayCountConvention,
                calculationConvention: item.calculationConvention,
              })),
            });
          }
        }
        if (inputs.length === 0)
          throw new ApplicationServiceError(
            'validation',
            'No eligible debts are available for analysis.',
          );
        const common = {
          debts: inputs,
          analysisDate,
          lumpSumCents: convertMoney('lumpSum', parsed.lumpSum),
          extraMonthlyPaymentCents: convertMoney(
            'extraMonthlyPayment',
            parsed.extraMonthlyPayment,
          ),
          maxProjectionMonths: parsed.maxProjectionMonths,
        };
        const baselineProjection = calculateExtraCashAllocation({
          ...common,
          strategy: 'baseline',
        }).projection;
        if (!baselineProjection) {
          throw new ApplicationServiceError(
            'internal',
            'Baseline projection could not be calculated.',
          );
        }
        const strategies: readonly ExtraCashAllocationStrategy[] = [
          'highest_rate',
          'lowest_balance',
          'selected_debt',
          'custom_priority',
        ];
        const selectedDebtId = parsed.selectedDebtId ?? inputs[0]?.debtId;
        const comparisons = strategies.map((strategy) => {
          const splitCents = Object.fromEntries(
            Object.entries(parsed.customSplit).map(([id, value]) => [
              id,
              convertMoney(`customSplit.${id}`, value),
            ]),
          );
          const calculation = calculateExtraCashAllocation({
            ...common,
            strategy,
            selectedDebtId,
            priority: parsed.customPriority,
            splitCents,
          });
          return mapExtraCashResult(
            calculation,
            inputs,
            baselineProjection,
            common.extraMonthlyPaymentCents,
          );
        });
        const baselineCalculation = calculateExtraCashAllocation({
          ...common,
          strategy: 'baseline',
        });
        return {
          analysisDate,
          baseline: mapExtraCashResult(
            baselineCalculation,
            inputs,
            baselineProjection,
            0,
          ),
          comparisons,
          eligibleDebts,
        };
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

    renamePayoffScenario: (request) => {
      try {
        const parsed = renamePayoffScenarioRequestSchema.parse(request);
        const existing = getScenarioOrThrow(parsed.id);
        if (existing.status === 'archived') {
          throw new ApplicationServiceError(
            'conflict',
            'Archived payoff scenarios cannot be renamed.',
          );
        }
        const timestamp = nextTimestamp(now, existing.updatedAtUtc);
        updatePayoffScenarioNameRecord(database, {
          id: parsed.id,
          expectedUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          name: parsed.name,
          updatedAtUtc: timestamp,
          audit: createPayoffScenarioAudit(
            createId(),
            parsed.id,
            'payoff_scenario_renamed',
            'rename',
            timestamp,
            'Payoff scenario name was changed without recalculating its assumptions or results.',
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

        if (
          parsed.debt.paymentScheduleStartDate &&
          parsed.debt.paymentScheduleStartDate < originationDate
        ) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'debt.paymentScheduleStartDate': [
                'Scheduling start date cannot precede the debt origination date.',
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
          paymentDueDay: validatePaymentDueDay(
            'debt.paymentDueDay',
            parsed.debt.paymentDueDay ?? null,
          ),
          paymentScheduleStartDate: parsed.debt.paymentScheduleStartDate
            ? ensureCalendarDate(
                'debt.paymentScheduleStartDate',
                parsed.debt.paymentScheduleStartDate,
              )
            : null,
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

        if (
          parsed.changes.paymentScheduleStartDate &&
          parsed.changes.paymentScheduleStartDate < existing.debt.originationDate
        ) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'changes.paymentScheduleStartDate': [
                'Scheduling start date cannot precede the debt origination date.',
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
          paymentDueDay: validatePaymentDueDay(
            'changes.paymentDueDay',
            parsed.changes.paymentDueDay === undefined
              ? existing.debt.paymentDueDay
              : parsed.changes.paymentDueDay,
          ),
          paymentScheduleStartDate:
            parsed.changes.paymentScheduleStartDate === undefined
              ? existing.debt.paymentScheduleStartDate
              : parsed.changes.paymentScheduleStartDate
                ? ensureCalendarDate(
                    'changes.paymentScheduleStartDate',
                    parsed.changes.paymentScheduleStartDate,
                  )
                : null,
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

    recordRefinance: (request) => {
      try {
        const parsed = recordRefinanceRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.debtId);

        if (existing.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore this debt before recording a refinance.',
          );
        }

        const latestTerm = existing.terms.at(-1);
        if (!latestTerm) {
          throw new ApplicationServiceError(
            'internal',
            'This debt is missing its required initial terms record.',
          );
        }

        const refinanceDate = ensureNotBefore(
          'refinanceDate',
          ensureCalendarDate('refinanceDate', parsed.refinanceDate),
          existing.debt.originationDate,
        );
        if (refinanceDate <= latestTerm.effectiveStartDate) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              refinanceDate: [
                'Refinance date must be after the latest effective-dated term begins.',
              ],
            },
          );
        }
        if (
          latestTerm.effectiveEndDate &&
          refinanceDate <= latestTerm.effectiveEndDate
        ) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              refinanceDate: ['Refinance date overlaps a closed term period.'],
            },
          );
        }
        if (
          existing.refinanceEvents.some(
            (event) => event.refinanceDate === refinanceDate,
          )
        ) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            { refinanceDate: ['A refinance is already recorded on this date.'] },
          );
        }

        const newMaturityDate = ensureCalendarDate(
          'newMaturityDate',
          parsed.newMaturityDate,
        );
        if (newMaturityDate < refinanceDate) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              newMaturityDate: ['Maturity date cannot precede the refinance date.'],
            },
          );
        }

        const interestRateMicros = convertRate(
          'newAnnualInterestRatePercent',
          parsed.newAnnualInterestRatePercent,
        );
        if (parsed.interestRateType === 'zero' && interestRateMicros !== 0) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              newAnnualInterestRatePercent: [
                'A zero-rate term must use a 0% annual rate.',
              ],
            },
          );
        }

        const preRefinanceDate = previousFinancialDate(refinanceDate);
        const preRefinancePrincipal = calculateLedgerBalanceThroughDate(
          database,
          parsed.debtId,
          preRefinanceDate,
        );
        const lenderPayoffBalance = nullableText(parsed.lenderPayoffBalance)
          ? convertMoney('lenderPayoffBalance', parsed.lenderPayoffBalance ?? '')
          : null;
        const notes = nullableText(parsed.notes);
        if (
          lenderPayoffBalance !== null &&
          lenderPayoffBalance !== preRefinancePrincipal
        ) {
          if (!parsed.payoffDifferenceAcknowledged) {
            throw new ApplicationServiceError(
              'validation',
              'Review the highlighted fields.',
              {
                payoffDifferenceAcknowledged: [
                  'Acknowledge and document the payoff difference before saving.',
                ],
              },
            );
          }
          if (!notes) {
            throw new ApplicationServiceError(
              'validation',
              'Review the highlighted fields.',
              {
                notes: ['Document why the refinance payoff difference is appropriate.'],
              },
            );
          }
        }

        const newRefinancedPrincipal = convertMoney(
          'newRefinancedPrincipal',
          parsed.newRefinancedPrincipal,
        );
        const principalChange = newRefinancedPrincipal - preRefinancePrincipal;
        const financedFees = convertMoney('financedFees', parsed.financedFees);
        const cashFees = convertMoney('cashFees', parsed.cashFees);
        const requiredPayment = convertMoney(
          'newRequiredPayment',
          parsed.newRequiredPayment,
        );
        const paymentDueDay = validatePaymentDueDay(
          'newPaymentDueDay',
          parsed.newPaymentDueDay ?? existing.debt.paymentDueDay,
        );
        const escrowAmountInput = nullableText(parsed.escrowAmount);
        const escrowAmount =
          parsed.escrowHandling === 'carry_forward'
            ? null
            : convertMoney('escrowAmount', escrowAmountInput ?? '0');
        if (parsed.escrowHandling !== 'carry_forward' && escrowAmountInput === null) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            { escrowAmount: ['Enter the escrow amount for this handling option.'] },
          );
        }

        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        const refinanceEventId = createId();
        const newTermId = createId();
        const principalTransactionId = principalChange === 0 ? null : createId();
        const cashFeeTransactionId = cashFees === 0 ? null : createId();
        const currentEscrowBalance = calculateEscrowBalanceThroughDate(
          database,
          parsed.debtId,
          preRefinanceDate,
        );
        const escrowChange =
          parsed.escrowHandling === 'reset_opening_balance'
            ? (escrowAmount ?? 0) - currentEscrowBalance
            : parsed.escrowHandling === 'refund'
              ? (escrowAmount ?? 0)
              : parsed.escrowHandling === 'new_deposit'
                ? (escrowAmount ?? 0)
                : 0;
        const escrowTransactionId = escrowChange === 0 ? null : createId();

        const buildSystemTransaction = (
          transactionId: string,
          transactionType: DebtTransactionInsert['transactionType'],
          allocationType: TransactionAllocationInsert['allocationType'],
          amountCents: number,
          description: string,
          sourceReference: string,
        ): PostedTransactionInput => ({
          transaction: {
            id: transactionId,
            debtId: parsed.debtId,
            transactionType,
            effectiveDate: refinanceDate,
            postingDate: refinanceDate,
            totalAmountCents: amountCents,
            status: 'posted',
            description,
            sourceType: 'system',
            sourceReference,
            reversalOfTransactionId: null,
            supersedesTransactionId: null,
            createdAtUtc: timestamp,
            updatedAtUtc: timestamp,
          },
          allocations: [
            {
              id: createId(),
              transactionId,
              allocationType,
              amountCents,
              notes: description,
              createdAtUtc: timestamp,
              updatedAtUtc: timestamp,
            },
          ],
        });

        const principalAdjustment =
          principalTransactionId === null
            ? undefined
            : buildSystemTransaction(
                principalTransactionId,
                'principal_adjustment',
                'principal',
                principalChange,
                'In-place refinance principal adjustment.',
                refinanceEventId,
              );
        const cashFeeTransaction =
          cashFeeTransactionId === null
            ? undefined
            : buildSystemTransaction(
                cashFeeTransactionId,
                'other',
                'other',
                cashFees,
                'Cash-paid refinance fees recorded separately from principal.',
                refinanceEventId,
              );
        const escrowTransaction =
          escrowTransactionId === null
            ? undefined
            : buildSystemTransaction(
                escrowTransactionId,
                parsed.escrowHandling === 'refund'
                  ? 'escrow_refund'
                  : 'escrow_adjustment',
                'escrow',
                escrowChange,
                'Refinance escrow adjustment recorded separately from principal.',
                refinanceEventId,
              );

        const newTerm: DebtTermInsert = {
          id: newTermId,
          debtId: parsed.debtId,
          effectiveStartDate: refinanceDate,
          effectiveEndDate: null,
          interestRateType: parsed.interestRateType,
          interestRateMicros,
          dayCountConvention: parsed.dayCountConvention,
          calculationConvention: parsed.calculationConvention,
          requiredPaymentCents: requiredPayment,
          paymentFrequency: parsed.newPaymentFrequency,
          notes,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };
        const refinanceEvent: RefinanceEventInsert = {
          id: refinanceEventId,
          debtId: parsed.debtId,
          refinanceDate,
          preRefinancePrincipalCents: preRefinancePrincipal,
          lenderPayoffBalanceCents: lenderPayoffBalance,
          newRefinancedPrincipalCents: newRefinancedPrincipal,
          principalChangeCents: principalChange,
          financedFeesCents: financedFees,
          cashFeesCents: cashFees,
          escrowHandling: parsed.escrowHandling,
          escrowAmountCents: escrowAmount,
          priorTermId: latestTerm.id,
          newTermId,
          principalTransactionId,
          cashFeeTransactionId,
          escrowTransactionId,
          notes,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };

        recordInPlaceRefinanceRecord(database, {
          debtId: parsed.debtId,
          expectedDebtUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          priorTermId: latestTerm.id,
          expectedPriorEndDate: latestTerm.effectiveEndDate,
          priorEndDate: previousFinancialDate(refinanceDate),
          debtUpdate: {
            maturityDate: newMaturityDate,
            minimumPaymentCents: requiredPayment,
            paymentFrequency: parsed.newPaymentFrequency,
            paymentDueDay,
            paymentScheduleStartDate: existing.debt.paymentScheduleStartDate,
            updatedAtUtc: timestamp,
          },
          newTerm,
          principalAdjustment,
          cashFeeTransaction,
          escrowTransaction,
          refinanceEvent,
          auditInputs: [
            createDebtAudit(
              createId(),
              parsed.debtId,
              'debt_refinance_recorded',
              'record_refinance',
              timestamp,
              'In-place refinance was recorded without creating a new debt.',
              [
                'maturityDate',
                'minimumPaymentCents',
                'paymentFrequency',
                'paymentDueDay',
              ],
            ),
            createAudit(
              createId(),
              'refinance_event',
              refinanceEventId,
              'refinance_event_created',
              'create',
              timestamp,
              'Refinance event details were recorded.',
              ['refinanceDate'],
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

        if (parsed.transaction.transactionType === 'transfer') {
          throw new ApplicationServiceError(
            'validation',
            'Use the debt transfer workflow so both ledger sides are created atomically.',
          );
        }
        if (parsed.transaction.transferId) {
          throw new ApplicationServiceError(
            'validation',
            'Transfer identifiers are reserved for linked transfer records.',
          );
        }
        if (
          parsed.transaction.transactionType === 'purchase' &&
          existing.debt.debtType !== 'credit_card'
        ) {
          throw new ApplicationServiceError(
            'validation',
            'Purchase/Charge transactions are available only for credit-card debts.',
            {
              'transaction.transactionType': [
                'Select a credit-card debt for a purchase/charge.',
              ],
            },
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
          transferId: parsed.transaction.transferId ?? null,
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

    createDebtTransfer: (request) => {
      try {
        const parsed = createDebtTransferRequestSchema.parse(request);
        const source = getRecordOrThrow(parsed.sourceDebtId);
        const destination = getRecordOrThrow(parsed.destinationDebtId);
        if (source.debt.archivedAtUtc || destination.debt.archivedAtUtc) {
          throw new ApplicationServiceError(
            'conflict',
            'Restore both debts before recording a transfer.',
          );
        }
        const effectiveDate = ensureCalendarDate('effectiveDate', parsed.effectiveDate);
        const postingDate = ensureCalendarDate('postingDate', parsed.postingDate);
        const amountCents = convertMoney('amount', parsed.amount);
        if (amountCents <= 0)
          throw new ApplicationServiceError(
            'validation',
            'Transfer amount must be positive.',
            { amount: ['Enter a positive transfer amount.'] },
          );
        if (
          calculateLedgerBalanceThroughDate(database, source.debt.id, effectiveDate) <
          amountCents
        ) {
          throw new ApplicationServiceError(
            'validation',
            'The source debt does not have sufficient calculated balance for this transfer.',
            { amount: ['Transfer amount exceeds the source debt balance.'] },
          );
        }
        const timestamp = nextTimestamp(
          now,
          source.debt.updatedAtUtc > destination.debt.updatedAtUtc
            ? source.debt.updatedAtUtc
            : destination.debt.updatedAtUtc,
        );
        const transferId = createId();
        const sourceId = createId();
        const destinationId = createId();
        const description =
          nullableText(parsed.description) ?? 'Debt-to-debt balance transfer.';
        const makeTransaction = (
          id: string,
          debtId: string,
          totalAmountCents: number,
        ): DebtTransactionInsert => ({
          id,
          debtId,
          transactionType: 'transfer',
          effectiveDate,
          postingDate,
          totalAmountCents,
          status: 'posted',
          description,
          sourceType: 'manual',
          sourceReference: nullableText(parsed.sourceReference),
          transferId,
          reversalOfTransactionId: null,
          supersedesTransactionId: null,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        });
        const makeAllocation = (
          transactionId: string,
          amount: number,
        ): TransactionAllocationInsert => ({
          id: createId(),
          transactionId,
          allocationType: 'principal',
          amountCents: amount,
          notes: 'Transfer principal movement.',
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        });
        createDebtTransferRecord(database, {
          source: {
            transaction: makeTransaction(sourceId, source.debt.id, -amountCents),
            allocations: [makeAllocation(sourceId, -amountCents)],
          },
          destination: {
            transaction: makeTransaction(
              destinationId,
              destination.debt.id,
              amountCents,
            ),
            allocations: [makeAllocation(destinationId, amountCents)],
          },
          auditInputs: [
            createTransactionAudit(
              createId(),
              sourceId,
              'debt_transfer_created',
              'create',
              timestamp,
              'Transfer-out ledger side recorded.',
              { transferId, direction: 'out' },
            ),
            createTransactionAudit(
              createId(),
              destinationId,
              'debt_transfer_created',
              'create',
              timestamp,
              'Transfer-in ledger side recorded.',
              { transferId, direction: 'in' },
            ),
          ],
        });
        return mapDetail(
          database,
          getRecordOrThrow(source.debt.id),
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

        if (original.transferId) {
          throw new ApplicationServiceError(
            'conflict',
            'Linked transfers cannot be edited as a single debt transaction. Reverse both linked sides atomically, then record a new transfer.',
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

        if (original.transactionType === 'reversal') {
          throw new ApplicationServiceError(
            'conflict',
            'Generated reversal transactions cannot be reversed.',
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

    confirmScheduledPayment: (request) => {
      try {
        const parsed = confirmScheduledPaymentRequestSchema.parse(request);
        const existing = getRecordOrThrow(parsed.debtId);
        const schedule = scheduledPaymentForRecord(
          existing,
          calculateLedgerBalanceThroughDate(
            database,
            parsed.debtId,
            currentFinancialDate(now),
          ),
          currentFinancialDate(now),
        );
        if (schedule.dueDate !== parsed.dueDate || schedule.satisfied) {
          throw new ApplicationServiceError(
            'conflict',
            'The calculated unpaid due date changed. Refresh the debt and review it again.',
          );
        }
        const timestamp = currentUtcTimestampSchema(now());
        createPaymentScheduleOverride(
          database,
          {
            id: createId(),
            debtId: parsed.debtId,
            satisfiedDueDate: parsed.dueDate,
            reason: parsed.reason,
            confirmedAtUtc: timestamp,
            createdAtUtc: timestamp,
          },
          createAudit(
            createId(),
            'debt',
            parsed.debtId,
            'scheduled_payment_confirmed',
            'confirm_schedule',
            timestamp,
            'A scheduled payment due date was manually confirmed for scheduling only.',
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

    removeScheduledPaymentConfirmation: (request) => {
      try {
        const parsed = removeScheduledPaymentConfirmationRequestSchema.parse(request);
        const timestamp = currentUtcTimestampSchema(now());
        removePaymentScheduleOverride(
          database,
          parsed.debtId,
          parsed.dueDate,
          timestamp,
          createAudit(
            createId(),
            'debt',
            parsed.debtId,
            'scheduled_payment_confirmation_removed',
            'remove_schedule_confirmation',
            timestamp,
            'A manual scheduled payment confirmation was removed.',
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
