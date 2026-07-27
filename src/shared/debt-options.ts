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

export type DebtType = (typeof DEBT_TYPES)[number];
export type DebtStatus = (typeof DEBT_STATUSES)[number];
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];
export type TaxCategory = (typeof TAX_CATEGORIES)[number];
export type InterestRateType = (typeof INTEREST_RATE_TYPES)[number];
export type DayCountConvention = (typeof DAY_COUNT_CONVENTIONS)[number];
export type InterestCalculationConvention =
  (typeof INTEREST_CALCULATION_CONVENTIONS)[number];
