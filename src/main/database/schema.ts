import { isNull, sql } from 'drizzle-orm';
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
import {
  PAYOFF_SCENARIO_STATUSES,
  PAYOFF_STRATEGIES,
  RECONCILIATION_LIFECYCLE_STATUSES,
} from '../../shared/debt-options';

const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const FINANCIAL_DATE_GLOB = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
const MAX_SAFE_INTEGER_SQL = sql.raw(String(MAX_SAFE_INTEGER));
const FINANCIAL_DATE_GLOB_SQL = sql.raw(`'${FINANCIAL_DATE_GLOB}'`);
const sqlList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));
const IMPORT_BATCH_STATUSES = ['open', 'reviewed', 'closed'] as const;
const IMPORT_RECORD_TYPES = [
  'debt',
  'transaction',
  'term',
  'balance_snapshot',
  'unknown',
] as const;
const IMPORT_REVIEW_STATUSES = [
  'needs_review',
  'approved',
  'rejected',
  'deferred',
] as const;
const IMPORT_ROW_CLASSIFICATIONS = ['actual', 'projected', 'ambiguous'] as const;
const IMPORT_POSTING_ENTITY_TYPES = [
  'debt',
  'debt_term',
  'debt_transaction',
  'transaction_allocation',
  'balance_snapshot',
] as const;
const REFINANCE_ESCROW_HANDLING = [
  'carry_forward',
  'reset_opening_balance',
  'refund',
  'new_deposit',
] as const;

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
    paymentDueDay: integer('payment_due_day'),
    paymentScheduleStartDate: text('payment_schedule_start_date'),
    creditLimitCents: integer('credit_limit_cents'),
    collateralDescription: text('collateral_description'),
    taxCategory: text('tax_category', { enum: TAX_CATEGORIES }).notNull(),
    deductiblePercentageBps: integer('deductible_percentage_bps').notNull(),
    financingChainName: text('financing_chain_name'),
    refinancedFromDebtId: text('refinanced_from_debt_id').references(
      (): AnySQLiteColumn => debts.id,
      { onDelete: 'set null', onUpdate: 'cascade' },
    ),
    refinancedIntoDebtId: text('refinanced_into_debt_id').references(
      (): AnySQLiteColumn => debts.id,
      { onDelete: 'set null', onUpdate: 'cascade' },
    ),
    refinanceDate: text('refinance_date'),
    notes: text('notes'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
    archivedAtUtc: text('archived_at_utc'),
  },
  (table) => [
    index('debts_creditor_idx').on(table.creditor),
    index('debts_owner_entity_idx').on(table.ownerEntity),
    index('debts_status_idx').on(table.status),
    index('debts_refinanced_from_idx').on(table.refinancedFromDebtId),
    index('debts_refinanced_into_idx').on(table.refinancedIntoDebtId),
    index('debts_financing_chain_idx').on(table.financingChainName),
    check('debts_type_valid', sql`${table.debtType} IN (${sqlList(DEBT_TYPES)})`),
    check('debts_status_valid', sql`${table.status} IN (${sqlList(DEBT_STATUSES)})`),
    check(
      'debts_payment_frequency_valid',
      sql`${table.paymentFrequency} IN (${sqlList(PAYMENT_FREQUENCIES)})`,
    ),
    check(
      'debts_payment_due_day_range',
      sql`${table.paymentDueDay} IS NULL OR ${table.paymentDueDay} BETWEEN 1 AND 31`,
    ),
    check(
      'debts_payment_schedule_start_date_format',
      sql`${table.paymentScheduleStartDate} IS NULL OR ${table.paymentScheduleStartDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
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
      'debts_refinance_not_self',
      sql`(${table.refinancedFromDebtId} IS NULL OR ${table.refinancedFromDebtId} <> ${table.id}) AND (${table.refinancedIntoDebtId} IS NULL OR ${table.refinancedIntoDebtId} <> ${table.id})`,
    ),
    check(
      'debts_refinance_date_format',
      sql`${table.refinanceDate} IS NULL OR ${table.refinanceDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
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

export const paymentScheduleOverrides = sqliteTable(
  'payment_schedule_overrides',
  {
    id: text('id').primaryKey(),
    debtId: text('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    satisfiedDueDate: text('satisfied_due_date').notNull(),
    reason: text('reason').notNull(),
    confirmedAtUtc: text('confirmed_at_utc').notNull(),
    createdAtUtc: text('created_at_utc').notNull(),
    removedAtUtc: text('removed_at_utc'),
  },
  (table) => [
    uniqueIndex('payment_schedule_overrides_active_uq')
      .on(table.debtId, table.satisfiedDueDate)
      .where(isNull(table.removedAtUtc)),
    index('payment_schedule_overrides_debt_idx').on(table.debtId),
    check(
      'payment_schedule_overrides_date_format',
      sql`${table.satisfiedDueDate} GLOB ${FINANCIAL_DATE_GLOB_SQL} AND ${table.confirmedAtUtc} LIKE '%Z' AND ${table.createdAtUtc} LIKE '%Z' AND (${table.removedAtUtc} IS NULL OR ${table.removedAtUtc} LIKE '%Z')`,
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
      table.sourceReference,
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
    lifecycleStatus: text('lifecycle_status', {
      enum: RECONCILIATION_LIFECYCLE_STATUSES,
    })
      .notNull()
      .default('current'),
    supersedesReconciliationId: text('supersedes_reconciliation_id').references(
      (): AnySQLiteColumn => balanceReconciliations.id,
      {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ),
    supersededByReconciliationId: text('superseded_by_reconciliation_id').references(
      (): AnySQLiteColumn => balanceReconciliations.id,
      {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ),
    voidedAtUtc: text('voided_at_utc'),
    supersededAtUtc: text('superseded_at_utc'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('balance_reconciliations_debt_statement_uq')
      .on(table.debtId, table.statementDate)
      .where(sql`${table.lifecycleStatus} = 'current'`),
    index('balance_reconciliations_status_idx').on(table.reconciliationStatus),
    index('balance_reconciliations_lifecycle_idx').on(table.lifecycleStatus),
    check(
      'balance_reconciliations_status_valid',
      sql`${table.reconciliationStatus} IN (${sqlList(RECONCILIATION_STATUSES)})`,
    ),
    check(
      'balance_reconciliations_lifecycle_valid',
      sql`${table.lifecycleStatus} IN (${sqlList(RECONCILIATION_LIFECYCLE_STATUSES)})`,
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
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z' AND (${table.voidedAtUtc} IS NULL OR ${table.voidedAtUtc} LIKE '%Z') AND (${table.supersededAtUtc} IS NULL OR ${table.supersededAtUtc} LIKE '%Z')`,
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

export const importBatches = sqliteTable(
  'import_batches',
  {
    id: text('id').primaryKey(),
    sourceWorkbookName: text('source_workbook_name').notNull(),
    sourceWorkbookFingerprint: text('source_workbook_fingerprint').notNull(),
    sourceWorkbookModifiedAtUtc: text('source_workbook_modified_at_utc'),
    status: text('status', { enum: IMPORT_BATCH_STATUSES }).notNull(),
    importedAtUtc: text('imported_at_utc').notNull(),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    index('import_batches_imported_at_idx').on(table.importedAtUtc),
    check(
      'import_batches_status_valid',
      sql`${table.status} IN (${sqlList(IMPORT_BATCH_STATUSES)})`,
    ),
    check(
      'import_batches_timestamp_format',
      sql`${table.importedAtUtc} LIKE '%Z' AND ${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z' AND (${table.sourceWorkbookModifiedAtUtc} IS NULL OR ${table.sourceWorkbookModifiedAtUtc} LIKE '%Z')`,
    ),
  ],
);

export const importSheetMappings = sqliteTable(
  'import_sheet_mappings',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => importBatches.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    sourceSheetName: text('source_sheet_name').notNull(),
    proposedRecordType: text('proposed_record_type', {
      enum: IMPORT_RECORD_TYPES,
    }).notNull(),
    reviewStatus: text('review_status', {
      enum: IMPORT_REVIEW_STATUSES,
    }).notNull(),
    fieldMappingJson: text('field_mapping_json').notNull(),
    notes: text('notes'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('import_sheet_mappings_batch_sheet_uq').on(
      table.batchId,
      table.sourceSheetName,
    ),
    index('import_sheet_mappings_batch_idx').on(table.batchId),
    check(
      'import_sheet_mappings_record_type_valid',
      sql`${table.proposedRecordType} IN (${sqlList(IMPORT_RECORD_TYPES)})`,
    ),
    check(
      'import_sheet_mappings_review_status_valid',
      sql`${table.reviewStatus} IN (${sqlList(IMPORT_REVIEW_STATUSES)})`,
    ),
    check(
      'import_sheet_mappings_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z'`,
    ),
  ],
);

export const stagedImportRows = sqliteTable(
  'staged_import_rows',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => importBatches.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    sheetMappingId: text('sheet_mapping_id')
      .notNull()
      .references(() => importSheetMappings.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    sourceSheetName: text('source_sheet_name').notNull(),
    sourceRowNumber: integer('source_row_number').notNull(),
    sourceCellReferencesJson: text('source_cell_references_json').notNull(),
    sourceDisplayedValuesJson: text('source_displayed_values_json').notNull(),
    sourceFormulasJson: text('source_formulas_json').notNull(),
    proposedRecordType: text('proposed_record_type', {
      enum: IMPORT_RECORD_TYPES,
    }).notNull(),
    activityClassification: text('activity_classification', {
      enum: IMPORT_ROW_CLASSIFICATIONS,
    }).notNull(),
    normalizedValuesJson: text('normalized_values_json').notNull(),
    validationMessagesJson: text('validation_messages_json').notNull(),
    duplicateCandidateJson: text('duplicate_candidate_json'),
    reconciliationExceptionJson: text('reconciliation_exception_json'),
    reviewStatus: text('review_status', {
      enum: IMPORT_REVIEW_STATUSES,
    }).notNull(),
    reviewNotes: text('review_notes'),
    reviewedAtUtc: text('reviewed_at_utc'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('staged_import_rows_source_uq').on(
      table.batchId,
      table.sourceSheetName,
      table.sourceRowNumber,
    ),
    index('staged_import_rows_batch_idx').on(table.batchId),
    index('staged_import_rows_mapping_idx').on(table.sheetMappingId),
    index('staged_import_rows_review_status_idx').on(table.reviewStatus),
    check(
      'staged_import_rows_record_type_valid',
      sql`${table.proposedRecordType} IN (${sqlList(IMPORT_RECORD_TYPES)})`,
    ),
    check(
      'staged_import_rows_activity_classification_valid',
      sql`${table.activityClassification} IN (${sqlList(IMPORT_ROW_CLASSIFICATIONS)})`,
    ),
    check(
      'staged_import_rows_review_status_valid',
      sql`${table.reviewStatus} IN (${sqlList(IMPORT_REVIEW_STATUSES)})`,
    ),
    check('staged_import_rows_row_number_valid', sql`${table.sourceRowNumber} > 0`),
    check(
      'staged_import_rows_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z' AND (${table.reviewedAtUtc} IS NULL OR ${table.reviewedAtUtc} LIKE '%Z')`,
    ),
  ],
);

export const importPostings = sqliteTable(
  'import_postings',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => importBatches.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    stagedRowId: text('staged_row_id')
      .notNull()
      .references(() => stagedImportRows.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    liveEntityType: text('live_entity_type', {
      enum: IMPORT_POSTING_ENTITY_TYPES,
    }).notNull(),
    liveEntityId: text('live_entity_id').notNull(),
    postedAtUtc: text('posted_at_utc').notNull(),
    createdAtUtc: text('created_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('import_postings_live_entity_uq').on(
      table.liveEntityType,
      table.liveEntityId,
    ),
    index('import_postings_batch_idx').on(table.batchId),
    index('import_postings_staged_row_idx').on(table.stagedRowId),
    check(
      'import_postings_entity_type_valid',
      sql`${table.liveEntityType} IN (${sqlList(IMPORT_POSTING_ENTITY_TYPES)})`,
    ),
    check(
      'import_postings_timestamp_format',
      sql`${table.postedAtUtc} LIKE '%Z' AND ${table.createdAtUtc} LIKE '%Z'`,
    ),
  ],
);

export const refinanceEvents = sqliteTable(
  'refinance_events',
  {
    id: text('id').primaryKey(),
    debtId: text('debt_id')
      .notNull()
      .references(() => debts.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    refinanceDate: text('refinance_date').notNull(),
    preRefinancePrincipalCents: integer('pre_refinance_principal_cents').notNull(),
    lenderPayoffBalanceCents: integer('lender_payoff_balance_cents'),
    newRefinancedPrincipalCents: integer('new_refinanced_principal_cents').notNull(),
    principalChangeCents: integer('principal_change_cents').notNull(),
    financedFeesCents: integer('financed_fees_cents').notNull(),
    cashFeesCents: integer('cash_fees_cents').notNull(),
    escrowHandling: text('escrow_handling', {
      enum: REFINANCE_ESCROW_HANDLING,
    }).notNull(),
    escrowAmountCents: integer('escrow_amount_cents'),
    priorTermId: text('prior_term_id')
      .notNull()
      .references(() => debtTerms.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    newTermId: text('new_term_id')
      .notNull()
      .references(() => debtTerms.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    principalTransactionId: text('principal_transaction_id').references(
      () => debtTransactions.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    cashFeeTransactionId: text('cash_fee_transaction_id').references(
      () => debtTransactions.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    escrowTransactionId: text('escrow_transaction_id').references(
      () => debtTransactions.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    notes: text('notes'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (table) => [
    uniqueIndex('refinance_events_debt_date_uq').on(table.debtId, table.refinanceDate),
    index('refinance_events_debt_idx').on(table.debtId),
    index('refinance_events_date_idx').on(table.refinanceDate),
    check(
      'refinance_events_date_format',
      sql`${table.refinanceDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'refinance_events_nonnegative_amounts',
      sql`${table.preRefinancePrincipalCents} >= 0 AND ${table.newRefinancedPrincipalCents} >= 0 AND ${table.financedFeesCents} >= 0 AND ${table.cashFeesCents} >= 0 AND (${table.lenderPayoffBalanceCents} IS NULL OR ${table.lenderPayoffBalanceCents} >= 0)`,
    ),
    check(
      'refinance_events_principal_change',
      sql`${table.principalChangeCents} = ${table.newRefinancedPrincipalCents} - ${table.preRefinancePrincipalCents}`,
    ),
    check(
      'refinance_events_escrow_handling_valid',
      sql`${table.escrowHandling} IN (${sqlList(REFINANCE_ESCROW_HANDLING)})`,
    ),
    check(
      'refinance_events_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z'`,
    ),
  ],
);

export const payoffScenarios = sqliteTable(
  'payoff_scenarios',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    strategy: text('strategy', { enum: PAYOFF_STRATEGIES }).notNull(),
    status: text('status', { enum: PAYOFF_SCENARIO_STATUSES }).notNull(),
    scenarioStartDate: text('scenario_start_date').notNull(),
    extraMonthlyPaymentCents: integer('extra_monthly_payment_cents').notNull(),
    customPriorityJson: text('custom_priority_json').notNull(),
    assumptionsJson: text('assumptions_json').notNull(),
    resultJson: text('result_json').notNull(),
    calculationEngineVersion: text('calculation_engine_version').notNull(),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
    archivedAtUtc: text('archived_at_utc'),
  },
  (table) => [
    index('payoff_scenarios_status_idx').on(table.status),
    index('payoff_scenarios_start_date_idx').on(table.scenarioStartDate),
    check(
      'payoff_scenarios_strategy_valid',
      sql`${table.strategy} IN (${sqlList(PAYOFF_STRATEGIES)})`,
    ),
    check(
      'payoff_scenarios_status_valid',
      sql`${table.status} IN (${sqlList(PAYOFF_SCENARIO_STATUSES)})`,
    ),
    check(
      'payoff_scenarios_start_date_format',
      sql`${table.scenarioStartDate} GLOB ${FINANCIAL_DATE_GLOB_SQL}`,
    ),
    check(
      'payoff_scenarios_extra_payment_range',
      sql`${table.extraMonthlyPaymentCents} BETWEEN 0 AND ${MAX_SAFE_INTEGER_SQL}`,
    ),
    check(
      'payoff_scenarios_timestamp_format',
      sql`${table.createdAtUtc} LIKE '%Z' AND ${table.updatedAtUtc} LIKE '%Z' AND (${table.archivedAtUtc} IS NULL OR ${table.archivedAtUtc} LIKE '%Z')`,
    ),
  ],
);

export const applicationSettings = sqliteTable('application_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAtUtc: text('updated_at_utc').notNull(),
});

export const schema = {
  auditEvents,
  applicationSettings,
  balanceReconciliations,
  balanceSnapshots,
  debtTerms,
  debtTransactions,
  debts,
  importBatches,
  importPostings,
  importSheetMappings,
  payoffScenarios,
  paymentScheduleOverrides,
  refinanceEvents,
  stagedImportRows,
  transactionAllocations,
};
