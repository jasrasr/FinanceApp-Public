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
  it('keeps the baseline unapplied and fully applies a $1,000 selected HELOC', () => {
    const debts = [
      {
        ...debt('heloc', 200000, 180000),
        debtName: 'HELOC',
      },
      {
        ...debt('hvac', 50000, 0),
        debtName: 'HVAC',
      },
    ];
    const baseline = calculateExtraCashAllocation({
      ...base('baseline'),
      debts,
      lumpSumCents: 100000,
    });
    const selected = calculateExtraCashAllocation({
      ...base('selected_debt'),
      debts,
      lumpSumCents: 100000,
      selectedDebtId: 'heloc',
    });
    expect(baseline.initialDebtId).toBeNull();
    expect(baseline.lumpSumAppliedCents).toBe(0);
    expect(baseline.unusedLumpSumCents).toBe(100000);
    expect(selected.initialDebtId).toBe('heloc');
    expect(selected.lumpSumAppliedCents).toBe(100000);
    expect(selected.unusedLumpSumCents).toBe(0);
    expect(
      selected.projection?.debts.find((item) => item.debtId === 'heloc')
        ?.startingBalanceCents,
    ).toBe(100000);
  });

  it('attributes zero-rate target savings to downstream rollover', () => {
    const result = calculateExtraCashAllocation({
      ...base('lowest_balance'),
      debts: [debt('hvac', 50000, 0), debt('heloc', 200000, 180000)],
      lumpSumCents: 100000,
      extraMonthlyPaymentCents: 0,
      maxProjectionMonths: 600,
    });
    expect(result.initialDebtId).toBe('hvac');
    expect(
      result.projection?.payoffOrder.find((item) => item.debtId === 'hvac')
        ?.projectedPayoffDate,
    ).toBe('2026-08-05');
    expect(
      result.projection?.monthlySchedule.some(
        (entry) => (entry.freedRequiredPaymentCents ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it('does not project an incomplete custom split', () => {
    const result = calculateExtraCashAllocation({
      ...base('custom_split'),
      lumpSumCents: 100000,
      splitCents: { a: 25000 },
    });
    expect(result.status).toBe('not_configured');
    expect(result.projection).toBeNull();
    expect(result.configurationMessage).toContain('remain unallocated');
  });

  it('uses the highest-rate debt first without negative balances', () => {
    const result = calculateExtraCashAllocation(base('highest_rate'));
    expect(result.initialDebtId).toBe('b');
    expect(result.lumpSumAppliedCents).toBe(50000);
    expect(
      result.projection!.debts.every((item) => item.startingBalanceCents >= 0),
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
    expect(result.projection!.monthlySchedule.length).toBeGreaterThan(0);
  });
});
