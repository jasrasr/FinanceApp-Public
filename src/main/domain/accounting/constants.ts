export {
  BALANCE_SNAPSHOT_SOURCE_TYPES,
  DAY_COUNT_CONVENTIONS,
  DEBT_STATUSES,
  DEBT_TYPES,
  INTEREST_CALCULATION_CONVENTIONS,
  INTEREST_RATE_TYPES,
  PAYMENT_FREQUENCIES,
  POSTED_ACTIVITY_TRANSACTION_TYPES,
  TAX_CATEGORIES,
  MANUAL_ENTRY_SOURCE_TYPES,
} from '../../../shared/debt-options';

export const TRANSACTION_TYPES = [
  'payment',
  'borrowing_draw',
  'fee',
  'penalty',
  'interest_charge',
  'principal_adjustment',
  'approved_reconciliation_adjustment',
  'reversal',
  'other',
] as const;

export const POSTED_TRANSACTION_STATUSES = [
  'posted',
  'reversed',
  'superseded',
] as const;

export const TRANSACTION_SOURCE_TYPES = [
  'manual',
  'import',
  'statement',
  'system',
  'reconciliation',
] as const;

export const ALLOCATION_TYPES = [
  'principal',
  'interest',
  'escrow',
  'fee',
  'penalty',
  'extra_principal',
  'other',
] as const;

export const RECONCILIATION_STATUSES = [
  'unreconciled',
  'in_progress',
  'reconciled',
  'reconciled_with_adjustment',
  'exception',
] as const;

export const SNAPSHOT_SOURCE_TYPES = ['manual', 'statement', 'import'] as const;

export const AUDIT_SOURCES = ['user', 'import', 'system', 'migration'] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionStatus = (typeof POSTED_TRANSACTION_STATUSES)[number];
export type AllocationType = (typeof ALLOCATION_TYPES)[number];
