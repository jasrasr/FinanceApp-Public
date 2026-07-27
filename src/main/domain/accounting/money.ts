import { decimalStringToScaledInteger, scaledIntegerToDecimalString } from './decimal';

export const MONEY_SCALE = 100;

export const dollarsToCents = (value: string): number =>
  decimalStringToScaledInteger(value, 2);

export const centsToDollars = (cents: number): string =>
  scaledIntegerToDecimalString(cents, 2);

export const formatCents = (
  cents: number,
  locale = 'en-US',
  currency = 'USD',
): string => {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('Money must be represented by safe-integer cents.');
  }

  return new Intl.NumberFormat(locale, {
    currency,
    style: 'currency',
  }).format(cents / MONEY_SCALE);
};
