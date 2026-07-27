import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
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

const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const FINANCIAL_DATE_GLOB = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
const MAX_SAFE_INTEGER_SQL = sql.raw(String(MAX_SAFE_INTEGER));
const FINANCIAL_DATE_GLOB_SQL = sql.raw(`'${FINANCIAL_DATE_GLOB}'`);
const sqlList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));

export const debts = sqliteTable(
  'debts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    creditor: text('creditor').notNull(),
    ownerEntity: text('owner_entity').notNull(),
    debtType: text('debt_type', { enum: DEBT_TYPES }).notNull(),
    purpose: text('purpose').notNull(),
    status: text('status', { enum: DEBT_STATUSES }).notNull(),
    originalPrincipalCents: integer('original_principal_cents').notNull(),
    originationDate: text('origination_date').notNull(),
    maturityDate: text('maturity_date'),
    minimumPaymentCents: integer('minimum_payment_cents').notNull(),
    paymentFrequency: text('payment_frequency', {
      enum: PAYMENT_FREQUENCIES,
    }).notNull(),
    creditLimitCents: integer('credit_limit_cents'),
    collateralDescription: text('collateral_description'),
    taxCategory: text('tax_category', { enum: TAX_CATEGORIES }).notNull(),
    deductiblePercentageBps: integer('deductible_percentage_bps').notNull(),
    notes: text('notes'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
    archivedAtUtc: text('archived_at_utc'),
  },
  (table) => [
    index('debts_creditor_idx').on(table.creditor),
    index('debts_owner_entity_idx').on(table.ownerEntity),
    index('debts_status_idx').on(table.status),
    check('debts_type_valid', sql`${table.debtType} IN (${sqlList(DEBT_TYPES)})`),
    check('debts_status_valid', sql`${table.status} IN (${sqlList(DEBT_STATUSES)})`),
    check(
      'debts_payment_frequency_valid',
      sql`${table.paymentFrequency} IN (${sqlList(PAYMENT_FREQUENCIES)})`,
    ),
    check(
      'debts_tax_category_valid',
      sql`${table.taxCategory} IN (${sqlList(TAX_CATEGORIES)})`,
    ),
    check(
      'debts_original_principal_range',
      sql`${table.originalPrincipalCents} >= 0 AND ${table.originalPrincipalCents} <= ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'debts_minimum_payment_range',
      sql`${table.minimumPaymentCents} >= 0 AND ${table.minimumPaymentCents} <= ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'debts_credit_limit_range',
      sql`${table.creditLimitCents} IS NULL OR (${table.creditLimitCents} >= 0 AND ${table.creditLimitCents} <= ${MAX_SAFE_INTEGER_SQL})`,
    ),
    check(
      'debts_deductible_percentage_range',
      sql`${table.deductiblePercentageBps} BETWEEN 0 AND 10000`,
    ),
    check(
      'debts_origination_date_format',
      sql`${table.originationDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'debts_maturity_date_format',
      sql`${table.maturityDate} IS NULL OR ${table.maturityDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'debts_maturity_after_origination',
      sql`${table.maturityDate} IS NULL OR ${table.maturityDate} >= ${table.originationDate}`,
    ),
    check(
      'debts_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z' AND (${table.archivedAtUtc} IS NULL OR ${table.archivedAtUtc} LIKE '%Z')`,
    ),
  ],
);

export const debtTerms = sqliteTable(
  'debt_terms',
  {
    id: text('id').primaryKey(),
    debtId: text('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    effectiveStartDate: text('effective_start_date').notNull(),
    effectiveEndDate: text('effective_end_date'),
    interestRateType: text('interest_rate_type', {
      enum: INTEREST_RATE_TYPES,
    }).notNull(),
    interestRateMicros: integer('interest_rate_micros').notNull(),
    dayCountConvention: text('day_count_convention', {
      enum: DAY_COUNT_CONVENTIONS,
    }).notNull(),
    calculationConvention: text('calculation_convention', {
      enum: INTEREST_CALCULATION_CONVENTIONS,
    }).notNull(),
    requiredPaymentCents: integer('required_payment_cents').notNull(),
    paymentFrequency: text('payment_frequency', {
      enum: PAYMENT_FREQUENCIES,
    }).notNull(),
    notes: text('notes'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('debt_terms_debt_start_uq').on(table.debtId, table.effectiveStartDate),
    index('debt_terms_debt_period_idx').on(
      table.debtId,
      table.effectiveStartDate,
      table.effectiveEndDate,
    ),
    check(
      'debt_terms_rate_type_valid',
      sql`${table.interestRateType} IN (${sqlList(INTEREST_RATE_TYPES)})`,
    ),
    check(
      'debt_terms_day_count_valid',
      sql`${table.dayCountConvention} IN (${sqlList(DAY_COUNT_CONVENTIONS)})`,
    ),
    check(
      'debt_terms_calculation_valid',
      sql`${table.calculationConvention} IN (${sqlList(INTEREST_CALCULATION_CONVENTIONS)})`,
    ),
    check(
      'debt_terms_payment_frequency_valid',
      sql`${table.paymentFrequency} IN (${sqlList(PAYMENT_FREQUENCIES)})`,
    ),
    check(
      'debt_terms_effective_start_format',
      sql`${table.effectiveStartDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'debt_terms_effective_end_format',
      sql`${table.effectiveEndDate} IS NULL OR ${table.effectiveEndDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'debt_terms_effective_period_order',
      sql`${table.effectiveEndDate} IS NULL OR ${table.effectiveEndDate} >= ${table.effectiveStartDate}`,
    ),
    check(
      'debt_terms_interest_rate_range',
      sql`${table.interestRateMicros} BETWEEN 0 AND ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'debt_terms_zero_rate_consistency',
      sql`${table.interestRateType} <> 'zero' OR ${table.interestRateMicros} = 0`,
    ),
    check(
      'debt_terms_required_payment_range',
      sql`${table.requiredPaymentCents} BETWEEN 0 AND ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'debt_terms_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z'`,
    ),
  ],
);

export const debtTransactions = sqliteTable(
  'debt_transactions',
  {
    id: text('id').primaryKey(),
    debtId: text('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    transactionType: text('transaction_type', {
      enum: TRANSACTION_TYPES,
    }).notNull(),
    effectiveDate: text('effective_date').notNull(),
    postingDate: text('posting_date').notNull(),
    totalAmountCents: integer('total_amount_cents').notNull(),
    status: text('status', { enum: POSTED_TRANSACTION_STATUSES }).notNull(),
    description: text('description').notNull(),
    sourceType: text('source_type', {
      enum: TRANSACTION_SOURCE_TYPES,
    }).notNull(),
    sourceReference: text('source_reference'),
    reversalOfTransactionId: text('reversal_of_transaction_id').references(
      (): AnySQLiteColumn => debtTransactions.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    supersedesTransactionId: text('supersedes_transaction_id').references(
      (): AnySQLiteColumn => debtTransactions.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('debt_transactions_reversal_of_uq')
      .on(table.reversalOfTransactionId)
      .where(sql`${table.reversalOfTransactionId} IS NOT NULL`),
    uniqueIndex('debt_transactions_supersedes_uq')
      .on(table.supersedesTransactionId)
      .where(sql`${table.supersedesTransactionId} IS NOT NULL`),
    index('debt_transactions_debt_effective_idx').on(table.debtId, table.effectiveDate),
    index('debt_transactions_debt_posting_idx').on(table.debtId, table.postingDate),
    index('debt_transactions_status_idx').on(table.status),
    check(
      'debt_transactions_type_valid',
      sql`${table.transactionType} IN (${sqlList(TRANSACTION_TYPES)})`,
    ),
    check(
      'debt_transactions_status_valid',
      sql`${table.status} IN (${sqlList(POSTED_TRANSACTION_STATUSES)})`,
    ),
    check(
      'debt_transactions_source_type_valid',
      sql`${table.sourceType} IN (${sqlList(TRANSACTION_SOURCE_TYPES)})`,
    ),
    check(
      'debt_transactions_effective_date_format',
      sql`${table.effectiveDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'debt_transactions_posting_date_format',
      sql`${table.postingDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'debt_transactions_amount_range',
      sql`${table.totalAmountCents} <> 0 AND ${table.totalAmountCents} BETWEEN -${MAX_SAFE_INTEGER_SQL} AND ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'debt_transactions_reversal_relationship',
      sql`((${table.transactionType} = 'reversal' AND ${table.reversalOfTransactionId} IS NOT NULL) OR (${table.transactionType} <> 'reversal' AND ${table.reversalOfTransactionId} IS NULL))`,
    ),
    check(
      'debt_transactions_no_self_relationship',
      sql`(${table.reversalOfTransactionId} IS NULL OR ${table.reversalOfTransactionId} <> ${table.id}) AND (${table.supersedesTransactionId} IS NULL OR ${table.supersedesTransactionId} <> ${table.id})`,
    ),
    check(
      'debt_transactions_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z'`,
    ),
  ],
);

export const transactionAllocations = sqliteTable(
  'transaction_allocations',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => debtTransactions.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    allocationType: text('allocation_type', {
      enum: ALLOCATION_TYPES,
    }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    notes: text('notes'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('transaction_allocations_type_uq').on(
      table.transactionId,
      table.allocationType,
    ),
    index('transaction_allocations_transaction_idx').on(table.transactionId),
    check(
      'transaction_allocations_type_valid',
      sql`${table.allocationType} IN (${sqlList(ALLOCATION_TYPES)})`,
    ),
    check(
      'transaction_allocations_amount_range',
      sql`${table.amountCents} <> 0 AND ${table.amountCents} BETWEEN -${MAX_SAFE_INTEGER_SQL} AND ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'transaction_allocations_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z'`,
    ),
  ],
);

export const balanceSnapshots = sqliteTable(
  'balance_snapshots',
  {
    id: text('id').primaryKey(),
    debtId: text('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    effectiveDate: text('effective_date').notNull(),
    confirmedBalanceCents: integer('confirmed_balance_cents').notNull(),
    sourceType: text('source_type', {
      enum: SNAPSHOT_SOURCE_TYPES,
    }).notNull(),
    sourceReference: text('source_reference'),
    notes: text('notes'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('balance_snapshots_debt_date_source_uq').on(
      table.debtId,
      table.effectiveDate,
      table.sourceType,
    ),
    index('balance_snapshots_debt_effective_idx').on(table.debtId, table.effectiveDate),
    check(
      'balance_snapshots_source_type_valid',
      sql`${table.sourceType} IN (${sqlList(SNAPSHOT_SOURCE_TYPES)})`,
    ),
    check(
      'balance_snapshots_effective_date_format',
      sql`${table.effectiveDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'balance_snapshots_balance_range',
      sql`${table.confirmedBalanceCents} BETWEEN 0 AND ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'balance_snapshots_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z'`,
    ),
  ],
);

export const balanceReconciliations = sqliteTable(
  'balance_reconciliations',
  {
    id: text('id').primaryKey(),
    debtId: text('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    statementDate: text('statement_date').notNull(),
    statementEndingBalanceCents: integer('statement_ending_balance_cents').notNull(),
    applicationCalculatedBalanceCents: integer(
      'application_calculated_balance_cents',
    ).notNull(),
    calculatedDifferenceCents: integer('calculated_difference_cents').notNull(),
    reconciliationStatus: text('reconciliation_status', {
      enum: RECONCILIATION_STATUSES,
    }).notNull(),
    explanation: text('explanation'),
    approvedAdjustmentTransactionId: text(
      'approved_adjustment_transaction_id',
    ).references(() => debtTransactions.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    sourceReference: text('source_reference'),
    supportingNotes: text('supporting_notes'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('balance_reconciliations_debt_statement_uq').on(
      table.debtId,
      table.statementDate,
    ),
    index('balance_reconciliations_status_idx').on(table.reconciliationStatus),
    check(
      'balance_reconciliations_status_valid',
      sql`${table.reconciliationStatus} IN (${sqlList(RECONCILIATION_STATUSES)})`,
    ),
    check(
      'balance_reconciliations_statement_date_format',
      sql`${table.statementDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'balance_reconciliations_statement_balance_range',
      sql`${table.statementEndingBalanceCents} BETWEEN 0 AND ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'balance_reconciliations_application_balance_range',
      sql`${table.applicationCalculatedBalanceCents} BETWEEN 0 AND ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'balance_reconciliations_difference_calculation',
      sql`${table.calculatedDifferenceCents} = ${table.statementEndingBalanceCents} - ${table.applicationCalculatedBalanceCents}`,
    ),
    check(
      'balance_reconciliations_adjustment_consistency',
      sql`((${table.reconciliationStatus} = 'reconciled_with_adjustment' AND ${table.approvedAdjustmentTransactionId} IS NOT NULL) OR (${table.reconciliationStatus} <> 'reconciled_with_adjustment' AND ${table.approvedAdjustmentTransactionId} IS NULL))`,
    ),
    check(
      'balance_reconciliations_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z'`,
    ),
  ],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    occurredAtUtc: text('occurred_at_utc').notNull(),
    source: text('source', { enum: AUDIT_SOURCES }).notNull(),
    summary: text('summary').notNull(),
    beforeMetadataJson: text('before_metadata_json'),
    afterMetadataJson: text('after_metadata_json'),
  },
  (table) => [
    index('audit_events_entity_idx').on(table.entityType, table.entityId),
    index('audit_events_occurred_at_idx').on(table.occurredAtUtc),
    check(
      'audit_events_source_valid',
      sql`${table.source} IN (${sqlList(AUDIT_SOURCES)})`,
    ),
    check('audit_events_timestamp_format', sql`${table.occurredAtUtc} LIKE '%Z'`),
  ],
);

export const schema = {
  auditEvents,
  balanceReconciliations,
  balanceSnapshots,
  debtTerms,
  debtTransactions,
  debts,
  transactionAllocations,
};
