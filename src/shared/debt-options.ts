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

export const USER_SELECTABLE_DEBT_TYPES = [
  'mortgage',
  'heloc',
  'auto',
  'personal',
  'business',
  'credit_card',
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

export const ALLOCATION_TYPES = [
  'principal',
  'interest',
  'escrow',
  'fee',
  'penalty',
  'extra_principal',
  'other',
] as const;

export const POSTED_ACTIVITY_TRANSACTION_TYPES = [
  'payment',
  'borrowing_draw',
  'fee',
  'penalty',
  'interest_charge',
  'principal_adjustment',
  'escrow_disbursement',
  'escrow_adjustment',
  'escrow_refund',
  'other',
] as const;

export const MANUAL_ENTRY_SOURCE_TYPES = ['manual', 'statement'] as const;

export const BALANCE_SNAPSHOT_SOURCE_TYPES = ['manual', 'statement'] as const;

export const RECONCILIATION_STATUSES = [
  'unreconciled',
  'in_progress',
  'reconciled',
  'reconciled_with_adjustment',
  'exception',
] as const;

export const RECONCILIATION_LIFECYCLE_STATUSES = [
  'current',
  'superseded',
  'voided',
] as const;

export const PAYOFF_STRATEGIES = [
  'baseline',
  'avalanche',
  'snowball',
  'custom',
] as const;

export const PAYOFF_SCENARIO_STATUSES = ['active', 'archived'] as const;

export type DebtType = (typeof DEBT_TYPES)[number];
export type UserSelectableDebtType = (typeof USER_SELECTABLE_DEBT_TYPES)[number];
export type DebtStatus = (typeof DEBT_STATUSES)[number];
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];
export type TaxCategory = (typeof TAX_CATEGORIES)[number];
export type InterestRateType = (typeof INTEREST_RATE_TYPES)[number];
export type DayCountConvention = (typeof DAY_COUNT_CONVENTIONS)[number];
export type InterestCalculationConvention =
  (typeof INTEREST_CALCULATION_CONVENTIONS)[number];
export type AllocationType = (typeof ALLOCATION_TYPES)[number];
export type PostedActivityTransactionType =
  (typeof POSTED_ACTIVITY_TRANSACTION_TYPES)[number];
export type TransactionSourceType = (typeof MANUAL_ENTRY_SOURCE_TYPES)[number];
export type BalanceSnapshotSourceType = (typeof BALANCE_SNAPSHOT_SOURCE_TYPES)[number];
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];
export type ReconciliationLifecycleStatus =
  (typeof RECONCILIATION_LIFECYCLE_STATUSES)[number];
export type PayoffStrategy = (typeof PAYOFF_STRATEGIES)[number];
export type PayoffScenarioStatus = (typeof PAYOFF_SCENARIO_STATUSES)[number];
