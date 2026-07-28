import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type {
  AddDebtTermRequest,
  CreateBalanceReconciliationRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  ArchiveDebtRequest,
  CreateDebtRequest,
  DashboardDto,
  DebtDetailDto,
  DebtSummaryDto,
  GetDashboardRequest,
  GetDebtRequest,
  GetImportBatchRequest,
  ImportBatchDto,
  ImportBatchSummaryDto,
  ListDebtsRequest,
  ReverseDebtTransactionRequest,
  RestoreDebtRequest,
  SelectWorkbookForImportRequest,
  UpdateImportSheetMappingRequest,
  UpdateStagedImportRowReviewRequest,
  UpdateDebtRequest,
} from '../../shared/debt-contracts';
import {
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  createBalanceReconciliationRequestSchema,
  createBalanceSnapshotRequestSchema,
  createDebtTransactionRequestSchema,
  createDebtRequestSchema,
  getDashboardRequestSchema,
  getDebtRequestSchema,
  getImportBatchRequestSchema,
  listImportBatchesRequestSchema,
  listDebtsRequestSchema,
  reverseDebtTransactionRequestSchema,
  restoreDebtRequestSchema,
  selectWorkbookForImportRequestSchema,
  updateImportSheetMappingRequestSchema,
  updateStagedImportRowReviewRequestSchema,
  updateDebtRequestSchema,
} from '../../shared/debt-contracts';
import type { AppDatabase } from '../database/connection';
import {
  calculateLedgerBalanceThroughDate,
  createBalanceReconciliationRecord,
  createBalanceSnapshotRecord,
  createImportBatchRecord,
  createPostedTransactionRecord,
  appendDebtTermRecord,
  getDebtActivityRecord,
  getDebtTransactionRecord,
  getImportBatchRecord,
  createDebtAndInitialTerm,
  listImportBatchRecords,
  listActiveDebtActivityRecords,
  listDebtRecords,
  RepositoryConflictError,
  RepositoryNotFoundError,
  setDebtArchivedState,
  updateImportSheetMappingReview,
  updateStagedImportRowReview,
  updateDebtDescriptiveRecord,
  type DebtRecord,
  type BalanceReconciliationRecord,
  type DebtTransactionWithAllocationsRecord,
  type DebtTermRecord,
  type DebtWithTermsRecord,
  type DebtWithActivityRecord,
  type ImportBatchRecord,
  type ImportBatchWithRowsRecord,
  type ImportSheetMappingRecord,
  type StagedImportRowRecord,
} from '../database/debt-maintenance-repository';
import { reversePostedTransaction } from '../database/repository';
import type {
  AuditEventInsert,
  BalanceReconciliationInput,
  DebtInsert,
  DebtTermInsert,
  DebtTransactionInsert,
  ImportSheetMappingInsert,
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
import { validateTransactionSignConvention } from '../domain/accounting/transaction-validation';
import { ApplicationServiceError } from './application-error';
import { parseWorkbookForImport } from './workbook-import-parser';

export interface DebtMaintenanceService {
  listDebts(request: ListDebtsRequest): readonly DebtSummaryDto[];
  getDashboard(request: GetDashboardRequest): DashboardDto;
  selectWorkbookForImport(
    request: SelectWorkbookForImportRequest,
  ): ImportBatchDto | null;
  listImportBatches(): readonly ImportBatchSummaryDto[];
  getImportBatch(request: GetImportBatchRequest): ImportBatchDto;
  updateImportSheetMapping(request: UpdateImportSheetMappingRequest): ImportBatchDto;
  updateStagedImportRowReview(
    request: UpdateStagedImportRowReviewRequest,
  ): ImportBatchDto;
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
  explanation: reconciliation.explanation,
  approvedAdjustmentTransactionId: reconciliation.approvedAdjustmentTransactionId,
  sourceReference: reconciliation.sourceReference,
  supportingNotes: reconciliation.supportingNotes,
  createdAtUtc: reconciliation.createdAtUtc,
  updatedAtUtc: reconciliation.updatedAtUtc,
});

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

const mapSummary = (record: DebtWithTermsRecord): DebtSummaryDto => {
  const debt = record.debt;

  return {
    id: debt.id,
    name: debt.name,
    creditor: debt.creditor,
    ownerEntity: debt.ownerEntity,
    debtType: debt.debtType,
    status: debt.status,
    originalPrincipal: centsToDollars(debt.originalPrincipalCents),
    originationDate: debt.originationDate,
    maturityDate: debt.maturityDate,
    initialTerm: mapTerm(requireInitialTerm(record)),
    archivedAtUtc: debt.archivedAtUtc,
  };
};

const mapDetail = (record: DebtWithActivityRecord): DebtDetailDto => {
  const debt = record.debt;

  requireInitialTerm(record);

  return {
    id: debt.id,
    name: debt.name,
    creditor: debt.creditor,
    ownerEntity: debt.ownerEntity,
    debtType: debt.debtType,
    purpose: debt.purpose,
    status: debt.status,
    originalPrincipal: centsToDollars(debt.originalPrincipalCents),
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
    terms: record.terms.map(mapTerm),
    transactions: record.transactions.map(mapTransaction),
    balanceSnapshots: record.balanceSnapshots.map(mapBalanceSnapshot),
    balanceReconciliations: record.balanceReconciliations.map(mapBalanceReconciliation),
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
  let principalReductionYtdCents = 0;
  let newBorrowingsYtdCents = 0;
  let interestActivityYtdCents = 0;
  let requiredMonthlyPaymentsCents = 0;
  let weightedRateNumerator = 0n;
  let weightedRateDenominator = 0n;

  const upcomingMaturities: DashboardDto['upcomingMaturities'] = [];
  const attentionItems: DashboardDto['attentionItems'] = [];

  for (const record of records) {
    const currentTerm = currentTermForDate(record.terms, effectiveDate);
    const ledgerBalanceCents = calculateLedgerBalanceThroughDate(
      database,
      record.debt.id,
      effectiveDate,
    );

    activeDebtCents += ledgerBalanceCents;
    requiredMonthlyPaymentsCents += monthlyEquivalentCents(
      currentTerm.requiredPaymentCents,
      currentTerm.paymentFrequency,
    );

    if (ledgerBalanceCents > 0) {
      weightedRateNumerator +=
        BigInt(ledgerBalanceCents) * BigInt(currentTerm.interestRateMicros);
      weightedRateDenominator += BigInt(ledgerBalanceCents);
    }

    for (const { transaction, allocations } of postedActualTransactionsThrough(
      record,
      ytdStart,
      effectiveDate,
    )) {
      if (transaction.transactionType === 'borrowing_draw') {
        newBorrowingsYtdCents += transaction.totalAmountCents;
      }

      for (const allocation of allocations) {
        if (
          (allocation.allocationType === 'principal' ||
            allocation.allocationType === 'extra_principal') &&
          allocation.amountCents < 0
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
        reconciliation.reconciliationStatus === 'unreconciled' ||
        reconciliation.reconciliationStatus === 'in_progress' ||
        reconciliation.reconciliationStatus === 'exception'
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
  }

  upcomingMaturities.sort((left, right) =>
    left.effectiveDate.localeCompare(right.effectiveDate),
  );
  attentionItems.sort((left, right) =>
    right.statementDate.localeCompare(left.statementDate),
  );

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
      interestActivityYtd: centsToDollars(interestActivityYtdCents),
      requiredMonthlyPayments: centsToDollars(requiredMonthlyPaymentsCents),
      weightedAverageInterestRate:
        weightedAverageInterestRateMicros === null
          ? null
          : rateMicrosToPercentString(weightedAverageInterestRateMicros),
    },
    metricBasis: {
      activeDebt: `Application-calculated ledger balances for active debts as of ${effectiveDate}; not confirmed snapshots or original principal.`,
      principalReductionYtd: `Net principal and extra-principal allocations from posted non-superseded activity dated ${ytdStart} through ${effectiveDate}.`,
      newBorrowingsYtd: `Posted non-superseded borrowing or draw transaction totals dated ${ytdStart} through ${effectiveDate}.`,
      interestActivityYtd: `Net interest allocations from posted non-superseded activity dated ${ytdStart} through ${effectiveDate}; negative amounts indicate interest paid through payments.`,
      requiredMonthlyPayments: `Current effective debt terms as of ${effectiveDate}, normalized to monthly equivalents; irregular and other frequencies are excluded from the amount.`,
      weightedAverageInterestRate: `Current effective annual rates as of ${effectiveDate}, weighted by application-calculated ledger balances for active debts.`,
    },
    upcomingMaturities: upcomingMaturities.slice(0, 10),
    attentionItems: attentionItems.slice(0, 10),
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

  const service: DebtMaintenanceService = {
    listDebts: (request) => {
      try {
        const parsed = listDebtsRequestSchema.parse(request);
        return listDebtRecords(database, parsed.includeArchived).map(mapSummary);
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

    getDebt: (request) => {
      try {
        const parsed = getDebtRequestSchema.parse(request);
        return mapDetail(getRecordOrThrow(parsed.id));
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
          ownerEntity: parsed.debt.ownerEntity,
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
            'debt.minimumPayment',
            parsed.debt.minimumPayment,
          ),
          paymentFrequency: parsed.debt.paymentFrequency,
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

        return mapDetail(getRecordOrThrow(debtId));
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
          return mapDetail(existing);
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

        return mapDetail(getRecordOrThrow(parsed.id));
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

        return mapDetail(getRecordOrThrow(parsed.debtId));
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
        const transaction: DebtTransactionInsert = {
          id: transactionId,
          debtId: parsed.debtId,
          transactionType: parsed.transaction.transactionType,
          effectiveDate,
          postingDate,
          totalAmountCents: convertSignedMoney(
            'transaction.totalAmount',
            parsed.transaction.totalAmount,
          ),
          status: 'posted',
          description: parsed.transaction.description,
          sourceType: parsed.transaction.sourceType,
          sourceReference: nullableText(parsed.transaction.sourceReference),
          reversalOfTransactionId: null,
          supersedesTransactionId: null,
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };
        const allocations = buildAllocations(
          createId,
          transactionId,
          timestamp,
          'transaction.allocations',
          parsed.transaction.allocations,
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

        return mapDetail(getRecordOrThrow(parsed.debtId));
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

        const timestamp = nextTimestamp(now, original.updatedAtUtc);
        const transactionDate = timestamp.slice(0, 10);
        reversePostedTransaction(database, {
          originalTransactionId: original.id,
          expectedUpdatedAtUtc: parsed.expectedUpdatedAtUtc,
          effectiveDate: transactionDate,
          postingDate: transactionDate,
          description: `Reversal of transaction ${original.id}.`,
          occurredAtUtc: timestamp,
        });

        return mapDetail(getRecordOrThrow(original.debtId));
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

        return mapDetail(getRecordOrThrow(parsed.debtId));
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
        const status = parsed.reconciliation.reconciliationStatus;

        if (status === 'reconciled' && calculatedDifferenceCents !== 0) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'reconciliation.reconciliationStatus': [
                'A reconciliation can be marked reconciled only when the calculated difference is zero.',
              ],
            },
          );
        }

        if (
          status === 'reconciled_with_adjustment' &&
          calculatedDifferenceCents === 0
        ) {
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'reconciliation.reconciliationStatus': [
                'Use reconciled status when no approved adjustment is needed.',
              ],
            },
          );
        }

        const timestamp = nextTimestamp(now, existing.debt.updatedAtUtc);
        const reconciliationId = createId();
        const approvedAdjustment = parsed.reconciliation.approvedAdjustment ?? null;
        let adjustment: {
          readonly transaction: DebtTransactionInsert;
          readonly allocations: readonly TransactionAllocationInsert[];
        } | null = null;
        let approvedAdjustmentTransactionId: string | null = null;

        if (approvedAdjustment) {
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
              description: approvedAdjustment.description,
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
          explanation: nullableText(parsed.reconciliation.explanation),
          approvedAdjustmentTransactionId,
          sourceReference: nullableText(parsed.reconciliation.sourceReference),
          supportingNotes: nullableText(parsed.reconciliation.supportingNotes),
          createdAtUtc: timestamp,
          updatedAtUtc: timestamp,
        };

        createBalanceReconciliationRecord(database, {
          reconciliation,
          adjustment: adjustment ?? undefined,
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
          ],
        });

        return mapDetail(getRecordOrThrow(parsed.debtId));
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

        return mapDetail(getRecordOrThrow(parsed.id));
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

        return mapDetail(getRecordOrThrow(parsed.id));
      } catch (error) {
        return normalizeError(error);
      }
    },
  };

  return service;
};
