import {
  projectPayoffScenario,
  type PayoffAssumptions,
  type PayoffDebtInput,
  type PayoffProjectionResult,
} from './payoff-engine';

export type ExtraCashAllocationStrategy =
  | 'highest_rate'
  | 'lowest_balance'
  | 'selected_debt'
  | 'custom_priority'
  | 'custom_split'
  | 'baseline';

export interface ExtraCashAllocationInput {
  readonly debts: readonly PayoffDebtInput[];
  readonly analysisDate: string;
  readonly extraMonthlyPaymentStartDate?: string;
  readonly lumpSumDate?: string;
  readonly lumpSumCents: number;
  readonly extraMonthlyPaymentCents: number;
  readonly strategy: ExtraCashAllocationStrategy;
  readonly selectedDebtId?: string;
  readonly priority?: readonly string[];
  readonly splitCents?: Readonly<Record<string, number>>;
  readonly maxProjectionMonths: number;
}

export interface ExtraCashAllocationResult {
  readonly strategy: ExtraCashAllocationStrategy;
  readonly initialDebtId: string | null;
  readonly lumpSumAppliedCents: number;
  readonly unusedLumpSumCents: number;
  readonly projection: PayoffProjectionResult | null;
  readonly lumpSumByDebtCents: Readonly<Record<string, number>>;
  readonly status: 'reliable' | 'not_configured' | 'partial';
  readonly configurationMessage: string | null;
}

const termAt = (debt: PayoffDebtInput, date: string) =>
  [...debt.terms]
    .filter(
      (term) =>
        term.effectiveStartDate <= date &&
        (term.effectiveEndDate === null || term.effectiveEndDate >= date),
    )
    .sort((left, right) =>
      right.effectiveStartDate.localeCompare(left.effectiveStartDate),
    )[0];

const orderedIds = (input: ExtraCashAllocationInput): readonly string[] => {
  const debts = input.debts.filter((debt) => debt.startingBalanceCents > 0);
  if (input.strategy === 'custom_priority') {
    return [
      ...(input.priority ?? []).filter((id) =>
        debts.some((debt) => debt.debtId === id),
      ),
      ...debts
        .map((debt) => debt.debtId)
        .filter((id) => !(input.priority ?? []).includes(id)),
    ];
  }
  if (input.strategy === 'selected_debt') {
    return [
      ...(input.selectedDebtId ? [input.selectedDebtId] : []),
      ...debts.map((debt) => debt.debtId).filter((id) => id !== input.selectedDebtId),
    ];
  }
  if (input.strategy === 'lowest_balance') {
    return [...debts]
      .sort((left, right) => left.startingBalanceCents - right.startingBalanceCents)
      .map((debt) => debt.debtId);
  }
  return [...debts]
    .sort(
      (left, right) =>
        (termAt(right, input.analysisDate)?.interestRateMicros ?? 0) -
        (termAt(left, input.analysisDate)?.interestRateMicros ?? 0),
    )
    .map((debt) => debt.debtId);
};

const lumpAllocations = (
  input: ExtraCashAllocationInput,
): {
  readonly allocations: Readonly<Record<string, number>>;
  readonly unused: number;
} => {
  let remaining = Math.max(0, input.lumpSumCents);
  const allocations: Record<string, number> = {};
  if (input.strategy === 'custom_split') {
    for (const debt of input.debts) {
      const requested = Math.max(0, input.splitCents?.[debt.debtId] ?? 0);
      const applied = Math.min(requested, debt.startingBalanceCents);
      allocations[debt.debtId] = applied;
      remaining -= applied;
    }
    return { allocations, unused: Math.max(0, remaining) };
  }
  const order = input.strategy === 'baseline' ? [] : orderedIds(input);
  for (const id of order) {
    if (remaining <= 0) break;
    const debt = input.debts.find((item) => item.debtId === id);
    if (!debt) continue;
    const applied = Math.min(remaining, Math.max(0, debt.startingBalanceCents));
    allocations[id] = applied;
    remaining -= applied;
  }
  return { allocations, unused: remaining };
};

export const calculateExtraCashAllocation = (
  input: ExtraCashAllocationInput,
): ExtraCashAllocationResult => {
  const lump = lumpAllocations(input);
  if (
    input.strategy === 'custom_split' &&
    Object.values(input.splitCents ?? {}).reduce(
      (total, value) => total + Math.max(0, value),
      0,
    ) !== Math.max(0, input.lumpSumCents)
  ) {
    return {
      strategy: input.strategy,
      initialDebtId: null,
      lumpSumAppliedCents: 0,
      unusedLumpSumCents: 0,
      projection: null,
      lumpSumByDebtCents: {},
      status: 'not_configured',
      configurationMessage: `Custom split must allocate the full entered lump sum; ${Math.max(0, input.lumpSumCents - Object.values(input.splitCents ?? {}).reduce((total, value) => total + Math.max(0, value), 0))} cents remain unallocated.`,
    };
  }
  const debts = input.debts;
  const assumptions: PayoffAssumptions = {
    scenarioStartDate: input.analysisDate,
    strategy:
      input.strategy === 'highest_rate'
        ? 'avalanche'
        : input.strategy === 'lowest_balance'
          ? 'snowball'
          : input.strategy === 'baseline'
            ? 'baseline'
            : 'custom',
    extraMonthlyPaymentCents:
      input.strategy === 'baseline' ? 0 : Math.max(0, input.extraMonthlyPaymentCents),
    customPriority: orderedIds(input),
    variableRateOverrides: {},
    maxProjectionMonths: input.maxProjectionMonths,
    extraMonthlyPaymentStartDate:
      input.extraMonthlyPaymentStartDate ?? input.analysisDate,
    initialLumpSumDate: input.lumpSumDate ?? input.analysisDate,
    initialLumpSumCents: input.lumpSumCents - lump.unused,
    initialLumpSumAllocationsCents: lump.allocations,
  };
  const projection = projectPayoffScenario(debts, assumptions);
  const allocationOrder = orderedIds(input);
  const orderedPayoff = allocationOrder.map((debtId, index) => {
    const debt = projection.debts.find((item) => item.debtId === debtId);
    return {
      debtId,
      debtName: debt?.debtName ?? 'Debt',
      priority: index + 1,
      projectedPayoffDate: debt?.projectedPayoffDate ?? null,
      monthsToPayoff: null,
      projectedInterestCents: debt?.projectedInterestCents ?? null,
      interestSavedCents: null,
    };
  });
  return {
    strategy: input.strategy,
    initialDebtId:
      input.strategy === 'baseline' ? null : (orderedIds(input)[0] ?? null),
    lumpSumAppliedCents: input.lumpSumCents - lump.unused,
    unusedLumpSumCents: lump.unused,
    projection: {
      ...projection,
      debts: projection.debts.map((debt) => ({
        ...debt,
        startingBalanceCents: Math.max(
          0,
          debt.startingBalanceCents - (lump.allocations[debt.debtId] ?? 0),
        ),
      })),
      payoffOrder: orderedPayoff,
    },
    lumpSumByDebtCents: lump.allocations,
    status: 'reliable',
    configurationMessage: null,
  };
};
