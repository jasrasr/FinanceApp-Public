export const PAYOFF_ENGINE_VERSION = 'payoff-engine-v2';

export type PayoffStrategy = 'baseline' | 'avalanche' | 'snowball' | 'custom';
export type PayoffProjectionStatus = 'projected' | 'unsupported';

export interface PayoffDebtInput {
  readonly debtId: string;
  readonly debtName: string;
  readonly creditor: string;
  readonly debtType: string;
  readonly startingBalanceCents: number;
  readonly maturityDate: string | null;
  readonly terms: readonly {
    readonly effectiveStartDate: string;
    readonly effectiveEndDate: string | null;
    readonly interestRateType: string;
    readonly interestRateMicros: number;
    readonly requiredPaymentCents: number;
    readonly paymentFrequency: string;
    readonly dayCountConvention: string;
    readonly calculationConvention: string;
  }[];
}

export interface PayoffAssumptions {
  readonly scenarioStartDate: string;
  readonly strategy: PayoffStrategy;
  readonly extraMonthlyPaymentCents: number;
  readonly customPriority: readonly string[];
  readonly variableRateOverrides: Readonly<Record<string, number>>;
  readonly maxProjectionMonths: number;
}

export interface PayoffDebtResult {
  readonly debtId: string;
  readonly debtName: string;
  readonly creditor: string;
  readonly startingBalanceCents: number;
  readonly projectionStatus: PayoffProjectionStatus;
  readonly projectedPayoffDate: string | null;
  readonly projectedInterestCents: number | null;
  readonly requiredMonthlyPaymentCents: number;
  readonly warnings: readonly string[];
}

export interface PayoffProjectionResult {
  readonly calculationEngineVersion: string;
  readonly scenarioStartDate: string;
  readonly projectedPayoffDate: string | null;
  readonly totalProjectedInterestCents: number;
  readonly monthlyCashRequirementCents: number;
  readonly baselineInterestCents: number;
  readonly interestSavingsCents: number;
  readonly assumptions: readonly string[];
  readonly debts: readonly PayoffDebtResult[];
  readonly warnings: readonly string[];
}

const MONTHS_PER_YEAR = 12;

const addMonths = (financialDate: string, months: number): string => {
  const [yearText, monthText, dayText] = financialDate.split('-');
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1 + months, Number(dayText)),
  );
  return date.toISOString().slice(0, 10);
};

const daysBetween = (startDate: string, endDate: string): number => {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
};

const monthlyPaymentCents = (amountCents: number, frequency: string): number | null => {
  if (frequency === 'monthly') return amountCents;
  if (frequency === 'semimonthly') return amountCents * 2;
  if (frequency === 'weekly') return Math.round((amountCents * 52) / 12);
  if (frequency === 'biweekly') return Math.round((amountCents * 26) / 12);
  if (frequency === 'quarterly') return Math.round(amountCents / 3);
  if (frequency === 'annually') return Math.round(amountCents / 12);
  return null;
};

const termForDate = (debt: PayoffDebtInput, date: string) => {
  const active = debt.terms.find(
    (term) =>
      term.effectiveStartDate <= date &&
      (term.effectiveEndDate === null || term.effectiveEndDate >= date),
  );

  if (active) return active;

  return [...debt.terms]
    .filter((term) => term.effectiveStartDate <= date)
    .sort((a, b) => b.effectiveStartDate.localeCompare(a.effectiveStartDate))[0];
};

const rateForDebt = (
  debt: PayoffDebtInput,
  term: PayoffDebtInput['terms'][number],
  assumptions: PayoffAssumptions,
): { readonly rateMicros: number; readonly unsupportedReason: string | null } => {
  if (term.interestRateType === 'zero') {
    return { rateMicros: 0, unsupportedReason: null };
  }

  if (term.interestRateType !== 'variable') {
    return { rateMicros: term.interestRateMicros, unsupportedReason: null };
  }

  const override = assumptions.variableRateOverrides[debt.debtId];
  if (override !== undefined) {
    return { rateMicros: override, unsupportedReason: null };
  }

  return {
    rateMicros: 0,
    unsupportedReason:
      'Variable-rate debt is unsupported without an explicit scenario rate override.',
  };
};

const interestForPeriod = (
  balanceCents: number,
  annualRateMicros: number,
  term: PayoffDebtInput['terms'][number],
  startDate: string,
  endDate: string,
): { readonly interestCents: number; readonly unsupportedReason: string | null } => {
  if (annualRateMicros === 0 || term.interestRateType === 'zero') {
    return { interestCents: 0, unsupportedReason: null };
  }

  if (
    term.calculationConvention === 'simple_daily' &&
    (term.dayCountConvention === 'actual_365' ||
      term.dayCountConvention === 'actual_360')
  ) {
    const yearDays = term.dayCountConvention === 'actual_365' ? 365 : 360;
    const periodDays = daysBetween(startDate, endDate);
    return {
      interestCents: Math.max(
        0,
        Math.round(
          (balanceCents * annualRateMicros * periodDays) / 1_000_000 / yearDays,
        ),
      ),
      unsupportedReason: null,
    };
  }

  if (
    term.dayCountConvention === 'monthly' &&
    (term.calculationConvention === 'amortized_monthly' ||
      term.calculationConvention === 'simple' ||
      term.calculationConvention === 'interest_only')
  ) {
    return {
      interestCents: Math.max(
        0,
        Math.round((balanceCents * annualRateMicros) / 1_000_000 / MONTHS_PER_YEAR),
      ),
      unsupportedReason: null,
    };
  }

  return {
    interestCents: 0,
    unsupportedReason: `The ${term.calculationConvention} calculation convention with ${term.dayCountConvention} day-count convention is not yet supported for reliable payoff projection.`,
  };
};

const initialSupportCheck = (
  debt: PayoffDebtInput,
  assumptions: PayoffAssumptions,
): {
  readonly paymentCents: number;
  readonly unsupportedReasons: readonly string[];
  readonly warnings: readonly string[];
} => {
  const warnings = new Set<string>();
  const unsupportedReasons = new Set<string>();
  const term = termForDate(debt, assumptions.scenarioStartDate);

  if (!term) {
    unsupportedReasons.add('No effective term exists for the scenario start date.');
    return {
      paymentCents: 0,
      unsupportedReasons: [...unsupportedReasons],
      warnings: [],
    };
  }

  const payment = monthlyPaymentCents(term.requiredPaymentCents, term.paymentFrequency);
  if (payment === null) {
    unsupportedReasons.add(
      `Payment frequency ${term.paymentFrequency} is not yet supported for reliable payoff projection.`,
    );
  }

  const rate = rateForDebt(debt, term, assumptions);
  if (rate.unsupportedReason) unsupportedReasons.add(rate.unsupportedReason);

  const interest = interestForPeriod(
    debt.startingBalanceCents,
    rate.rateMicros,
    term,
    assumptions.scenarioStartDate,
    addMonths(assumptions.scenarioStartDate, 1),
  );
  if (interest.unsupportedReason) unsupportedReasons.add(interest.unsupportedReason);

  if (debt.debtType === 'credit_card' || debt.debtType === 'heloc') {
    warnings.add(
      'Revolving debt is projected using current balance, terms, and no future draws.',
    );
  }

  if (debt.maturityDate) {
    warnings.add(
      'Maturity date is enforced; any balance remaining at maturity makes the payoff projection unsupported beyond that date.',
    );
  }

  if (term.interestRateType === 'zero') {
    warnings.add(
      'Zero-interest obligation accrues no projected interest while zero-rate terms apply.',
    );
  }

  return {
    paymentCents: payment ?? 0,
    unsupportedReasons: [...unsupportedReasons],
    warnings: [...warnings],
  };
};

const priorityOrder = (
  debts: readonly PayoffDebtInput[],
  balances: ReadonlyMap<string, number>,
  unsupportedDebtIds: ReadonlySet<string>,
  assumptions: PayoffAssumptions,
  date: string,
): readonly string[] => {
  const active = debts.filter(
    (debt) =>
      (balances.get(debt.debtId) ?? 0) > 0 && !unsupportedDebtIds.has(debt.debtId),
  );

  if (assumptions.strategy === 'custom') {
    const custom = assumptions.customPriority.filter(
      (id) => (balances.get(id) ?? 0) > 0 && !unsupportedDebtIds.has(id),
    );
    const remaining = active
      .map((debt) => debt.debtId)
      .filter((id) => !custom.includes(id));
    return [...custom, ...remaining];
  }

  if (assumptions.strategy === 'snowball') {
    return active
      .sort(
        (left, right) =>
          (balances.get(left.debtId) ?? 0) - (balances.get(right.debtId) ?? 0),
      )
      .map((debt) => debt.debtId);
  }

  if (assumptions.strategy === 'avalanche') {
    return active
      .sort((left, right) => {
        const leftTerm = termForDate(left, date);
        const rightTerm = termForDate(right, date);
        return (
          (rightTerm?.interestRateMicros ?? 0) - (leftTerm?.interestRateMicros ?? 0)
        );
      })
      .map((debt) => debt.debtId);
  }

  return active.map((debt) => debt.debtId);
};

const runProjection = (
  debts: readonly PayoffDebtInput[],
  assumptions: PayoffAssumptions,
  includeExtra: boolean,
): Omit<PayoffProjectionResult, 'baselineInterestCents' | 'interestSavingsCents'> => {
  const balances = new Map(
    debts.map((debt) => [debt.debtId, debt.startingBalanceCents]),
  );
  const interestByDebt = new Map(debts.map((debt) => [debt.debtId, 0]));
  const payoffDateByDebt = new Map<string, string | null>(
    debts.map((debt) => [
      debt.debtId,
      debt.startingBalanceCents === 0 ? assumptions.scenarioStartDate : null,
    ]),
  );
  const warningsByDebt = new Map<string, Set<string>>(
    debts.map((debt) => [debt.debtId, new Set<string>()]),
  );
  const unsupportedDebtIds = new Set<string>();
  const globalWarnings = new Set<string>();
  const monthlyRequirements = new Map<string, number>();

  for (const debt of debts) {
    const support = initialSupportCheck(debt, assumptions);
    monthlyRequirements.set(debt.debtId, support.paymentCents);
    for (const warning of support.warnings)
      warningsByDebt.get(debt.debtId)?.add(warning);
    for (const reason of support.unsupportedReasons) {
      unsupportedDebtIds.add(debt.debtId);
      warningsByDebt.get(debt.debtId)?.add(reason);
      globalWarnings.add(
        'One or more debts are unsupported and excluded from scenario totals.',
      );
    }
  }

  const baseCash = [...monthlyRequirements.entries()]
    .filter(([debtId]) => !unsupportedDebtIds.has(debtId))
    .reduce((total, [, value]) => total + value, 0);
  const monthlyCashRequirementCents =
    baseCash + (includeExtra ? assumptions.extraMonthlyPaymentCents : 0);

  for (let month = 0; month < assumptions.maxProjectionMonths; month += 1) {
    const date = addMonths(assumptions.scenarioStartDate, month);
    const nextDate = addMonths(assumptions.scenarioStartDate, month + 1);
    const activeIds = debts
      .map((debt) => debt.debtId)
      .filter((id) => (balances.get(id) ?? 0) > 0 && !unsupportedDebtIds.has(id));

    if (activeIds.length === 0) break;

    for (const debt of debts.filter((candidate) =>
      activeIds.includes(candidate.debtId),
    )) {
      if (debt.maturityDate && date >= debt.maturityDate) {
        unsupportedDebtIds.add(debt.debtId);
        payoffDateByDebt.set(debt.debtId, null);
        warningsByDebt
          .get(debt.debtId)
          ?.add(
            'Debt reached maturity with a remaining balance; balloon payoff is unsupported without an explicit balloon-payment assumption.',
          );
        globalWarnings.add(
          'One or more debts reached maturity with a remaining balance and were excluded from reliable scenario totals.',
        );
        continue;
      }

      const term = termForDate(debt, date);
      if (!term) {
        unsupportedDebtIds.add(debt.debtId);
        warningsByDebt
          .get(debt.debtId)
          ?.add('No effective term exists for a projected period.');
        continue;
      }
      const rate = rateForDebt(debt, term, assumptions);
      if (rate.unsupportedReason) {
        unsupportedDebtIds.add(debt.debtId);
        warningsByDebt.get(debt.debtId)?.add(rate.unsupportedReason);
        continue;
      }
      const interest = interestForPeriod(
        balances.get(debt.debtId) ?? 0,
        rate.rateMicros,
        term,
        date,
        nextDate,
      );
      if (interest.unsupportedReason) {
        unsupportedDebtIds.add(debt.debtId);
        warningsByDebt.get(debt.debtId)?.add(interest.unsupportedReason);
        continue;
      }
      const requiredPayment = monthlyRequirements.get(debt.debtId) ?? 0;
      if (interest.interestCents > 0 && requiredPayment <= interest.interestCents) {
        warningsByDebt
          .get(debt.debtId)
          ?.add(
            'Required payment does not cover projected interest in at least one period; negative amortization risk exists unless extra payments are applied.',
          );
      }

      balances.set(
        debt.debtId,
        (balances.get(debt.debtId) ?? 0) + interest.interestCents,
      );
      interestByDebt.set(
        debt.debtId,
        (interestByDebt.get(debt.debtId) ?? 0) + interest.interestCents,
      );
    }

    let available = includeExtra ? monthlyCashRequirementCents : baseCash;
    for (const debtId of activeIds.filter((id) => !unsupportedDebtIds.has(id))) {
      const scheduled = Math.min(
        monthlyRequirements.get(debtId) ?? 0,
        balances.get(debtId) ?? 0,
      );
      balances.set(debtId, (balances.get(debtId) ?? 0) - scheduled);
      available -= scheduled;
      if ((balances.get(debtId) ?? 0) === 0 && payoffDateByDebt.get(debtId) === null) {
        payoffDateByDebt.set(debtId, date);
      }
    }

    if (includeExtra && available > 0) {
      for (const debtId of priorityOrder(
        debts,
        balances,
        unsupportedDebtIds,
        assumptions,
        date,
      )) {
        if (available <= 0) break;
        const balance = balances.get(debtId) ?? 0;
        if (balance <= 0) continue;
        const extra = Math.min(balance, available);
        balances.set(debtId, balance - extra);
        available -= extra;
        if (
          (balances.get(debtId) ?? 0) === 0 &&
          payoffDateByDebt.get(debtId) === null
        ) {
          payoffDateByDebt.set(debtId, date);
        }
      }
    }
  }

  for (const debt of debts) {
    if ((balances.get(debt.debtId) ?? 0) > 0 && !unsupportedDebtIds.has(debt.debtId)) {
      warningsByDebt
        .get(debt.debtId)
        ?.add('Debt did not pay off within the maximum projection horizon.');
      globalWarnings.add(
        'At least one supported debt did not pay off within the maximum projection horizon.',
      );
    }
  }

  const debtResults = debts.map((debt): PayoffDebtResult => ({
    debtId: debt.debtId,
    debtName: debt.debtName,
    creditor: debt.creditor,
    startingBalanceCents: debt.startingBalanceCents,
    projectionStatus: unsupportedDebtIds.has(debt.debtId) ? 'unsupported' : 'projected',
    projectedPayoffDate: unsupportedDebtIds.has(debt.debtId)
      ? null
      : (payoffDateByDebt.get(debt.debtId) ?? null),
    projectedInterestCents: unsupportedDebtIds.has(debt.debtId)
      ? null
      : (interestByDebt.get(debt.debtId) ?? 0),
    requiredMonthlyPaymentCents: monthlyRequirements.get(debt.debtId) ?? 0,
    warnings: [...(warningsByDebt.get(debt.debtId) ?? new Set<string>())],
  }));

  const reliableDebtResults = debtResults.filter(
    (debt) => debt.projectionStatus === 'projected',
  );
  const projectedPayoffDate =
    debtResults.length === reliableDebtResults.length &&
    reliableDebtResults.every((debt) => debt.projectedPayoffDate !== null)
      ? (reliableDebtResults
          .map((debt) => debt.projectedPayoffDate!)
          .sort((a, b) => b.localeCompare(a))[0] ?? null)
      : null;

  return {
    calculationEngineVersion: PAYOFF_ENGINE_VERSION,
    scenarioStartDate: assumptions.scenarioStartDate,
    projectedPayoffDate,
    totalProjectedInterestCents: reliableDebtResults.reduce(
      (total, debt) => total + (debt.projectedInterestCents ?? 0),
      0,
    ),
    monthlyCashRequirementCents,
    assumptions: [
      'Uses application-calculated ledger balances as of the scenario start date.',
      'Uses explicit zero-interest treatment for zero-rate obligations.',
      'Supports monthly interest calculations and actual/360 or actual/365 simple daily-interest calculations when term data is sufficient.',
      'Uses the applicable effective-dated term for each monthly projection period.',
      'Required payments are normalized to monthly equivalents by payment frequency; irregular and other schedules are unsupported.',
      'Variable-rate debts require explicit scenario overrides and are unsupported without them.',
      'Extra payments roll to the next debt according to the selected payoff strategy after scheduled payments.',
      'Projected activity is scenario-only and is not written to the posted ledger.',
    ],
    debts: debtResults,
    warnings: [...globalWarnings],
  };
};

export const projectPayoffScenario = (
  debts: readonly PayoffDebtInput[],
  assumptions: PayoffAssumptions,
): PayoffProjectionResult => {
  const baseline = runProjection(
    debts,
    { ...assumptions, strategy: 'baseline', extraMonthlyPaymentCents: 0 },
    false,
  );
  const scenario = runProjection(
    debts,
    assumptions,
    assumptions.strategy !== 'baseline',
  );

  return {
    ...scenario,
    baselineInterestCents: baseline.totalProjectedInterestCents,
    interestSavingsCents:
      baseline.totalProjectedInterestCents - scenario.totalProjectedInterestCents,
  };
};
