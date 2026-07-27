export const DEBT_TYPES = [
  'mortgage',
  'heloc',
  'auto',
  'student',
  'personal',
  'business',
  'credit_card',
  'medical',
  'tax',
  'other',
] as const;

export const DEBT_STATUSES = ['active', 'paid_off', 'closed'] as const;

export const PAYMENT_FREQUENCIES = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'annually',
  'irregular',
  'other',
] as const;

export const TAX_CATEGORIES = [
  'personal_nondeductible',
  'mortgage_interest',
  'investment_interest',
  'business',
  'student_loan',
  'other',
  'unknown',
] as const;

export const INTEREST_RATE_TYPES = [
  'fixed',
  'variable',
  'promotional',
  'zero',
] as const;

export const DAY_COUNT_CONVENTIONS = [
  'actual_365',
  'actual_360',
  'thirty_360',
  'monthly',
] as const;

export const INTEREST_CALCULATION_CONVENTIONS = [
  'simple_daily',
  'amortized_monthly',
  'interest_only',
  'simple',
  'other',
] as const;

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
