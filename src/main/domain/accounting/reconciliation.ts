const assertMoneyCents = (value: number): void => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Balance must be represented by safe-integer cents.');
  }
};

export const calculateReconciliationDifference = (
  statementEndingBalanceCents: number,
  applicationCalculatedBalanceCents: number,
): number => {
  assertMoneyCents(statementEndingBalanceCents);
  assertMoneyCents(applicationCalculatedBalanceCents);

  const difference = statementEndingBalanceCents - applicationCalculatedBalanceCents;

  assertMoneyCents(difference);
  return difference;
};
