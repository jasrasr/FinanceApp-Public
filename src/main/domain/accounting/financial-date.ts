const FINANCIAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const isFinancialDate = (value: string): boolean => {
  const match = FINANCIAL_DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const assertFinancialDate = (value: string): string => {
  if (!isFinancialDate(value)) {
    throw new TypeError('Financial date must be a valid ISO YYYY-MM-DD date.');
  }

  return value;
};

export const isUtcTimestamp = (value: string): boolean =>
  UTC_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));

export const currentUtcTimestamp = (): string => new Date().toISOString();
