import { describe, expect, it } from 'vitest';
import { assertFinancialDate, isFinancialDate } from './financial-date';
import {
  percentStringToRateMicros,
  rateMicrosToDecimalString,
  rateMicrosToPercentString,
} from './interest-rate';
import { centsToDollars, dollarsToCents, formatCents } from './money';
import { calculateReconciliationDifference } from './reconciliation';
import {
  calculateAllocationReconciliation,
  validateTransactionSignConvention,
} from './transaction-validation';

describe('money boundaries', () => {
  it('converts decimal strings to cents with half-away-from-zero rounding', () => {
    expect(dollarsToCents('12.344')).toBe(1_234);
    expect(dollarsToCents('12.345')).toBe(1_235);
    expect(dollarsToCents('-12.345')).toBe(-1_235);
    expect(centsToDollars(-1_235)).toBe('-12.35');
    expect(formatCents(123_456)).toBe('$1,234.56');
  });

  it('rejects non-decimal and unsafe inputs', () => {
    expect(() => dollarsToCents('12 dollars')).toThrow();
    expect(() => centsToDollars(Number.MAX_VALUE)).toThrow();
  });
});

describe('interest-rate boundaries', () => {
  it('scales annual rates without floating-point storage', () => {
    expect(percentStringToRateMicros('5.49')).toBe(54_900);
    expect(rateMicrosToPercentString(54_900)).toBe('5.49');
    expect(rateMicrosToDecimalString(54_900)).toBe('0.054900');
  });

  it('rounds percentage input to the documented scale', () => {
    expect(percentStringToRateMicros('5.49005')).toBe(54_901);
    expect(() => percentStringToRateMicros('-1')).toThrow();
  });
});

describe('financial dates', () => {
  it('accepts valid timezone-free ISO dates', () => {
    expect(isFinancialDate('2028-02-29')).toBe(true);
    expect(assertFinancialDate('2028-02-29')).toBe('2028-02-29');
  });

  it('rejects invalid calendar dates and timestamps', () => {
    expect(isFinancialDate('2027-02-29')).toBe(false);
    expect(isFinancialDate('2026-06-15T00:00:00Z')).toBe(false);
    expect(() => assertFinancialDate('2026-13-01')).toThrow();
  });
});

describe('allocation reconciliation and sign conventions', () => {
  const paymentAllocations = [
    { allocationType: 'principal' as const, amountCents: -8_000 },
    { allocationType: 'interest' as const, amountCents: -2_000 },
  ];

  it('requires signed allocations to equal the transaction total', () => {
    expect(calculateAllocationReconciliation(-10_000, paymentAllocations)).toEqual({
      allocationTotalCents: -10_000,
      differenceCents: 0,
      isReconciled: true,
    });

    expect(
      calculateAllocationReconciliation(-9_999, paymentAllocations).isReconciled,
    ).toBe(false);
  });

  it('enforces transaction signs and reversal relationships', () => {
    expect(
      validateTransactionSignConvention(
        {
          transactionType: 'payment',
          totalAmountCents: -10_000,
        },
        paymentAllocations,
      ),
    ).toEqual([]);

    expect(
      validateTransactionSignConvention(
        {
          transactionType: 'payment',
          totalAmountCents: 10_000,
        },
        [
          {
            allocationType: 'principal',
            amountCents: 10_000,
          },
        ],
      ),
    ).toContain('Payments must have a negative transaction total.');
  });
});

describe('balance reconciliation', () => {
  it('calculates statement balance less application balance', () => {
    expect(calculateReconciliationDifference(1_005_000, 1_000_000)).toBe(5_000);
    expect(calculateReconciliationDifference(995_000, 1_000_000)).toBe(-5_000);
  });
});
