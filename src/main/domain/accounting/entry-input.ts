import { assertFinancialDate } from './financial-date';
import { percentStringToBasisPoints, percentStringToRateMicros } from './interest-rate';
import { dollarsToCents } from './money';

const CURRENCY_INPUT_PATTERN = /^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
const SIGNED_CURRENCY_INPUT_PATTERN = /^-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
const PERCENTAGE_INPUT_PATTERN = /^\d+(?:\.\d+)?%?$/;

const normalizeCurrencyInput = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, '');

  if (!CURRENCY_INPUT_PATTERN.test(normalized)) {
    throw new TypeError('Enter a nonnegative currency amount such as 1250.00.');
  }

  return normalized.replace('$', '').replaceAll(',', '');
};

const normalizePercentageInput = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, '');

  if (!PERCENTAGE_INPUT_PATTERN.test(normalized)) {
    throw new TypeError('Enter a nonnegative percentage such as 5.49.');
  }

  return normalized.replace('%', '');
};

export const currencyInputToCents = (value: string): number =>
  dollarsToCents(normalizeCurrencyInput(value));

export const signedCurrencyInputToCents = (value: string): number => {
  const normalized = value.trim().replace(/\s+/g, '');

  if (!SIGNED_CURRENCY_INPUT_PATTERN.test(normalized)) {
    throw new TypeError('Enter a signed currency amount such as -1250.00.');
  }

  const magnitude = normalized.replace('-', '').replace('$', '').replaceAll(',', '');
  const cents = dollarsToCents(magnitude);

  return normalized.startsWith('-') ? -cents : cents;
};

export const percentageInputToRateMicros = (value: string): number =>
  percentStringToRateMicros(normalizePercentageInput(value));

export const percentageInputToBasisPoints = (value: string): number =>
  percentStringToBasisPoints(normalizePercentageInput(value));

export const previousFinancialDate = (value: string): string => {
  const financialDate = assertFinancialDate(value);
  const [yearText, monthText, dayText] = financialDate.split('-');
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
