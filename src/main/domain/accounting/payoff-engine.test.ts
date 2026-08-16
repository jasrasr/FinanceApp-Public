// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { projectPayoffScenario, type PayoffDebtInput } from './payoff-engine';

const debt = (overrides: Partial<PayoffDebtInput> = {}): PayoffDebtInput => ({
  debtId: overrides.debtId ?? '11111111-1111-4111-8111-111111111111',
  debtName: overrides.debtName ?? 'Generated Term Note',
  creditor: overrides.creditor ?? 'Generated Lender',
  debtType: overrides.debtType ?? 'business',
  startingBalanceCents: overrides.startingBalanceCents ?? 10_000_00,
  maturityDate: overrides.maturityDate ?? null,
  terms: overrides.terms ?? [
    {
      effectiveStartDate: '2026-01-01',
      effectiveEndDate: null,
      interestRateType: 'fixed',
      interestRateMicros: 60_000,
      requiredPaymentCents: 500_00,
      paymentFrequency: 'monthly',
      dayCountConvention: 'monthly',
      calculationConvention: 'amortized_monthly',
    },
  ],
});

describe('payoff projection engine', () => {
  it('starts recurring extra payments on the requested date', () => {
    const immediate = projectPayoffScenario([debt()], {
      scenarioStartDate: '2026-01-01',
      extraMonthlyPaymentStartDate: '2026-01-01',
      strategy: 'avalanche',
      extraMonthlyPaymentCents: 100_00,
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 120,
    });
    const delayed = projectPayoffScenario([debt()], {
      scenarioStartDate: '2026-01-01',
      extraMonthlyPaymentStartDate: '2026-03-01',
      strategy: 'avalanche',
      extraMonthlyPaymentCents: 100_00,
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 120,
    });
    expect(delayed.monthlySchedule[0]?.extraPaymentCents).toBe(0);
    expect(delayed.monthlySchedule[2]?.extraPaymentCents).toBeGreaterThan(0);
    expect(immediate.totalProjectedInterestCents).toBeLessThan(
      delayed.totalProjectedInterestCents,
    );
  });

  it('keeps projected activity scenario-only while calculating payoff savings', () => {
    const result = projectPayoffScenario([debt()], {
      scenarioStartDate: '2026-01-01',
      strategy: 'avalanche',
      extraMonthlyPaymentCents: 250_00,
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 120,
    });

    expect(result.calculationEngineVersion).toBe('payoff-engine-v2');
    expect(result.projectedPayoffDate).toBe('2027-02-01');
    expect(result.totalProjectedInterestCents).toBeLessThan(
      result.baselineInterestCents,
    );
    expect(result.interestSavingsCents).toBe(
      result.baselineInterestCents - result.totalProjectedInterestCents,
    );
    expect(result.assumptions).toContain(
      'Projected activity is scenario-only and is not written to the posted ledger.',
    );
  });

  it('applies avalanche before snowball when rates and balances differ', () => {
    const higherRateDebt = debt({
      debtId: '22222222-2222-4222-8222-222222222222',
      debtName: 'Generated Higher Rate Note',
      startingBalanceCents: 20_000_00,
      terms: [
        {
          effectiveStartDate: '2026-01-01',
          effectiveEndDate: null,
          interestRateType: 'fixed',
          interestRateMicros: 120_000,
          requiredPaymentCents: 500_00,
          paymentFrequency: 'monthly',
          dayCountConvention: 'monthly',
          calculationConvention: 'amortized_monthly',
        },
      ],
    });
    const lowerBalanceDebt = debt({
      debtId: '33333333-3333-4333-8333-333333333333',
      debtName: 'Generated Lower Balance Note',
      startingBalanceCents: 5_000_00,
    });

    const avalanche = projectPayoffScenario([higherRateDebt, lowerBalanceDebt], {
      scenarioStartDate: '2026-01-01',
      strategy: 'avalanche',
      extraMonthlyPaymentCents: 1_000_00,
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 120,
    });
    const snowball = projectPayoffScenario([higherRateDebt, lowerBalanceDebt], {
      scenarioStartDate: '2026-01-01',
      strategy: 'snowball',
      extraMonthlyPaymentCents: 1_000_00,
      customPriority: [],
      variableRateOverrides: {},
      maxProjectionMonths: 120,
    });

    expect(avalanche.totalProjectedInterestCents).toBeLessThan(
      snowball.totalProjectedInterestCents,
    );
  });

  it('uses actual/365 daily interest when term data supports it', () => {
    const result = projectPayoffScenario(
      [
        debt({
          startingBalanceCents: 10_000_00,
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'fixed',
              interestRateMicros: 365_000,
              requiredPaymentCents: 100_00,
              paymentFrequency: 'monthly',
              dayCountConvention: 'actual_365',
              calculationConvention: 'simple_daily',
            },
          ],
        }),
      ],
      {
        scenarioStartDate: '2026-01-01',
        strategy: 'baseline',
        extraMonthlyPaymentCents: 0,
        customPriority: [],
        variableRateOverrides: {},
        maxProjectionMonths: 1,
      },
    );

    expect(result.debts[0]?.projectedInterestCents).toBe(310_00);
    expect(result.debts[0]?.warnings.join(' ')).toContain(
      'Required payment does not cover projected interest',
    );
  });

  it('uses actual/360 daily interest when term data supports it', () => {
    const result = projectPayoffScenario(
      [
        debt({
          startingBalanceCents: 10_000_00,
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'fixed',
              interestRateMicros: 360_000,
              requiredPaymentCents: 1_000_00,
              paymentFrequency: 'monthly',
              dayCountConvention: 'actual_360',
              calculationConvention: 'simple_daily',
            },
          ],
        }),
      ],
      {
        scenarioStartDate: '2026-01-01',
        strategy: 'baseline',
        extraMonthlyPaymentCents: 0,
        customPriority: [],
        variableRateOverrides: {},
        maxProjectionMonths: 1,
      },
    );

    expect(result.debts[0]?.projectedInterestCents).toBe(310_00);
  });

  it('projects explicit zero-interest obligations without interest', () => {
    const result = projectPayoffScenario(
      [
        debt({
          startingBalanceCents: 1_000_00,
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'zero',
              interestRateMicros: 0,
              requiredPaymentCents: 100_00,
              paymentFrequency: 'monthly',
              dayCountConvention: 'monthly',
              calculationConvention: 'amortized_monthly',
            },
          ],
        }),
      ],
      {
        scenarioStartDate: '2026-01-01',
        strategy: 'baseline',
        extraMonthlyPaymentCents: 0,
        customPriority: [],
        variableRateOverrides: {},
        maxProjectionMonths: 12,
      },
    );

    expect(result.debts[0]?.projectionStatus).toBe('projected');
    expect(result.debts[0]?.projectedInterestCents).toBe(0);
    expect(result.debts[0]?.warnings.join(' ')).toContain(
      'Zero-interest obligation accrues no projected interest',
    );
  });

  it('marks variable-rate debts unsupported without explicit scenario assumptions', () => {
    const result = projectPayoffScenario(
      [
        debt({
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'variable',
              interestRateMicros: 180_000,
              requiredPaymentCents: 500_00,
              paymentFrequency: 'monthly',
              dayCountConvention: 'monthly',
              calculationConvention: 'amortized_monthly',
            },
          ],
        }),
      ],
      {
        scenarioStartDate: '2026-01-01',
        strategy: 'baseline',
        extraMonthlyPaymentCents: 0,
        customPriority: [],
        variableRateOverrides: {},
        maxProjectionMonths: 12,
      },
    );

    expect(result.debts[0]?.projectionStatus).toBe('unsupported');
    expect(result.debts[0]?.projectedInterestCents).toBeNull();
    expect(result.projectedPayoffDate).toBeNull();
    expect(result.warnings.join(' ')).toContain('unsupported');
  });

  it('projects variable-rate debts with explicit scenario assumptions', () => {
    const debtId = '55555555-5555-4555-8555-555555555555';
    const result = projectPayoffScenario(
      [
        debt({
          debtId,
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'variable',
              interestRateMicros: 180_000,
              requiredPaymentCents: 500_00,
              paymentFrequency: 'monthly',
              dayCountConvention: 'monthly',
              calculationConvention: 'amortized_monthly',
            },
          ],
        }),
      ],
      {
        scenarioStartDate: '2026-01-01',
        strategy: 'baseline',
        extraMonthlyPaymentCents: 0,
        customPriority: [],
        variableRateOverrides: { [debtId]: 120_000 },
        maxProjectionMonths: 3,
      },
    );

    expect(result.debts[0]?.projectionStatus).toBe('projected');
    expect(result.debts[0]?.projectedInterestCents).not.toBeNull();
  });

  it('marks irregular payment schedules unsupported', () => {
    const result = projectPayoffScenario(
      [
        debt({
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'fixed',
              interestRateMicros: 60_000,
              requiredPaymentCents: 500_00,
              paymentFrequency: 'irregular',
              dayCountConvention: 'monthly',
              calculationConvention: 'amortized_monthly',
            },
          ],
        }),
      ],
      {
        scenarioStartDate: '2026-01-01',
        strategy: 'baseline',
        extraMonthlyPaymentCents: 0,
        customPriority: [],
        variableRateOverrides: {},
        maxProjectionMonths: 12,
      },
    );

    expect(result.debts[0]?.projectionStatus).toBe('unsupported');
    expect(result.debts[0]?.warnings.join(' ')).toContain(
      'Payment frequency irregular is not yet supported',
    );
  });

  it('marks balloon maturity projections unsupported when balance remains at maturity', () => {
    const result = projectPayoffScenario(
      [
        debt({
          startingBalanceCents: 50_000_00,
          maturityDate: '2026-03-01',
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'fixed',
              interestRateMicros: 60_000,
              requiredPaymentCents: 500_00,
              paymentFrequency: 'monthly',
              dayCountConvention: 'monthly',
              calculationConvention: 'amortized_monthly',
            },
          ],
        }),
      ],
      {
        scenarioStartDate: '2026-01-01',
        strategy: 'baseline',
        extraMonthlyPaymentCents: 0,
        customPriority: [],
        variableRateOverrides: {},
        maxProjectionMonths: 12,
      },
    );

    expect(result.debts[0]?.projectionStatus).toBe('unsupported');
    expect(result.debts[0]?.projectedPayoffDate).toBeNull();
    expect(result.debts[0]?.warnings.join(' ')).toContain(
      'Debt reached maturity with a remaining balance',
    );
  });

  it('documents revolving and insufficient-payment warnings without pretending unsupported projections are reliable', () => {
    const result = projectPayoffScenario(
      [
        debt({
          debtType: 'credit_card',
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'fixed',
              interestRateMicros: 180_000,
              requiredPaymentCents: 100_00,
              paymentFrequency: 'monthly',
              dayCountConvention: 'monthly',
              calculationConvention: 'amortized_monthly',
            },
          ],
        }),
        debt({
          debtId: '44444444-4444-4444-8444-444444444444',
          debtName: 'Generated Zero Interest Note',
          startingBalanceCents: 1_000_00,
          terms: [
            {
              effectiveStartDate: '2026-01-01',
              effectiveEndDate: null,
              interestRateType: 'zero',
              interestRateMicros: 0,
              requiredPaymentCents: 100_00,
              paymentFrequency: 'monthly',
              dayCountConvention: 'monthly',
              calculationConvention: 'amortized_monthly',
            },
          ],
        }),
      ],
      {
        scenarioStartDate: '2026-01-01',
        strategy: 'baseline',
        extraMonthlyPaymentCents: 0,
        customPriority: [],
        variableRateOverrides: {},
        maxProjectionMonths: 2,
      },
    );

    expect(result.debts[0]?.warnings.join(' ')).toContain(
      'Revolving debt is projected using current balance',
    );
    expect(result.debts[0]?.warnings.join(' ')).toContain(
      'Required payment does not cover projected interest',
    );
    expect(result.debts[1]?.warnings.join(' ')).toContain(
      'Zero-interest obligation accrues no projected interest',
    );
    expect(result.projectedPayoffDate).toBeNull();
  });
});
