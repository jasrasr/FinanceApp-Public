import { describe, expect, it } from 'vitest';
import {
  calculateExtraCashAllocation,
  type ExtraCashAllocationInput,
} from './extra-cash-allocation';

const debt = (id: string, balance: number, rate: number) => ({
  debtId: id,
  debtName: id === 'a' ? 'Alpha debt' : 'Beta debt',
  creditor: 'Generated lender',
  debtType: 'personal',
  startingBalanceCents: balance,
  maturityDate: null,
  terms: [
    {
      effectiveStartDate: '2026-01-01',
      effectiveEndDate: null,
      interestRateType: 'fixed',
      interestRateMicros: rate,
      requiredPaymentCents: 10000,
      paymentFrequency: 'monthly',
      dayCountConvention: 'monthly',
      calculationConvention: 'amortized_monthly',
    },
  ],
});
const base = (
  strategy: ExtraCashAllocationInput['strategy'],
): ExtraCashAllocationInput => ({
  debts: [debt('a', 100000, 50000), debt('b', 200000, 150000)],
  analysisDate: '2026-08-05',
  lumpSumCents: 50000,
  extraMonthlyPaymentCents: 10000,
  strategy,
  maxProjectionMonths: 120,
});

describe('extra-cash allocation', () => {
  it('uses the highest-rate debt first without negative balances', () => {
    const result = calculateExtraCashAllocation(base('highest_rate'));
    expect(result.initialDebtId).toBe('b');
    expect(result.lumpSumAppliedCents).toBe(50000);
    expect(
      result.projection.debts.every((item) => item.startingBalanceCents >= 0),
    ).toBe(true);
  });

  it('uses the lowest balance and follows custom priority', () => {
    expect(calculateExtraCashAllocation(base('lowest_balance')).initialDebtId).toBe(
      'a',
    );
    expect(
      calculateExtraCashAllocation({ ...base('custom_priority'), priority: ['b', 'a'] })
        .initialDebtId,
    ).toBe('b');
  });

  it('reports unused lump sum when all eligible debt is paid', () => {
    const result = calculateExtraCashAllocation({
      ...base('highest_rate'),
      lumpSumCents: 500000,
    });
    expect(result.unusedLumpSumCents).toBe(200000);
  });

  it('applies a custom split exactly and keeps the projection scenario-only', () => {
    const result = calculateExtraCashAllocation({
      ...base('custom_split'),
      splitCents: { a: 25000, b: 25000 },
    });
    expect(result.lumpSumAppliedCents).toBe(50000);
    expect(result.projection.monthlySchedule.length).toBeGreaterThan(0);
  });
});
