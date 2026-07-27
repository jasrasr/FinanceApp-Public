import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type {
  AddDebtTermRequest,
  CreateBalanceSnapshotRequest,
  CreateDebtTransactionRequest,
  ArchiveDebtRequest,
  CreateDebtRequest,
  DebtDetailDto,
  DebtSummaryDto,
  GetDebtRequest,
  ListDebtsRequest,
  ReverseDebtTransactionRequest,
  RestoreDebtRequest,
  UpdateDebtRequest,
} from '../../shared/debt-contracts';
import {
  addDebtTermRequestSchema,
  archiveDebtRequestSchema,
  createBalanceSnapshotRequestSchema,
  createDebtTransactionRequestSchema,
  createDebtRequestSchema,
  getDebtRequestSchema,
  listDebtsRequestSchema,
  reverseDebtTransactionRequestSchema,
  restoreDebtRequestSchema,
  updateDebtRequestSchema,
} from '../../shared/debt-contracts';
import type { AppDatabase } from '../database/connection';
import {
  createBalanceSnapshotRecord,
  createPostedTransactionRecord,
  appendDebtTermRecord,
  getDebtActivityRecord,
  getDebtTransactionRecord,
  createDebtAndInitialTerm,
  listDebtRecords,
  RepositoryConflictError,
  RepositoryNotFoundError,
  setDebtArchivedState,
  updateDebtDescriptiveRecord,
  type DebtRecord,
  type DebtTransactionWithAllocationsRecord,
  type DebtTermRecord,
  type DebtWithTermsRecord,
  type DebtWithActivityRecord,
} from '../database/debt-maintenance-repository';
import { reversePostedTransaction } from '../database/repository';
import type {
  AuditEventInsert,
  DebtInsert,
  DebtTermInsert,
  DebtTransactionInsert,
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

export interface DebtMaintenanceService {
  listDebts(request: ListDebtsRequest): readonly DebtSummaryDto[];
  getDebt(request: GetDebtRequest): DebtDetailDto;
  createDebt(request: CreateDebtRequest): DebtDetailDto;
  updateDebt(request: UpdateDebtRequest): DebtDetailDto;
  addDebtTerm(request: AddDebtTermRequest): DebtDetailDto;
  createDebtTransaction(request: CreateDebtTransactionRequest): DebtDetailDto;
  reverseDebtTransaction(request: ReverseDebtTransactionRequest): DebtDetailDto;
  createBalanceSnapshot(request: CreateBalanceSnapshotRequest): DebtDetailDto;
  archiveDebt(request: ArchiveDebtRequest): DebtDetailDto;
  restoreDebt(request: RestoreDebtRequest): DebtDetailDto;
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
    archivedAtUtc: debt.archivedAtUtc,
    createdAtUtc: debt.createdAtUtc,
    updatedAtUtc: debt.updatedAtUtc,
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

  const service: DebtMaintenanceService = {
    listDebts: (request) => {
      try {
        const parsed = listDebtsRequestSchema.parse(request);
        return listDebtRecords(database, parsed.includeArchived).map(mapSummary);
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
        const allocationInputs = [
          [
            'transaction.allocations.principal',
            'principal',
            parsed.transaction.allocations.principal,
          ],
          [
            'transaction.allocations.interest',
            'interest',
            parsed.transaction.allocations.interest,
          ],
          [
            'transaction.allocations.escrow',
            'escrow',
            parsed.transaction.allocations.escrow,
          ],
          ['transaction.allocations.fee', 'fee', parsed.transaction.allocations.fee],
          [
            'transaction.allocations.penalty',
            'penalty',
            parsed.transaction.allocations.penalty,
          ],
          [
            'transaction.allocations.extraPrincipal',
            'extra_principal',
            parsed.transaction.allocations.extraPrincipal,
          ],
          [
            'transaction.allocations.other',
            'other',
            parsed.transaction.allocations.other,
          ],
        ] as const;
        const allocations: TransactionAllocationInsert[] = [];

        for (const [field, allocationType, amount] of allocationInputs) {
          if (amount == null || amount.trim() === '') {
            continue;
          }

          const amountCents = convertSignedMoney(field, amount);

          if (amountCents === 0) {
            throw new ApplicationServiceError(
              'validation',
              'Review the highlighted fields.',
              {
                [field]: ['Allocation amount must be nonzero.'],
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
          throw new ApplicationServiceError(
            'validation',
            'Review the highlighted fields.',
            {
              'transaction.allocations': ['Enter at least one allocation amount.'],
            },
          );
        }

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
