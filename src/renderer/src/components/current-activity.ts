import type { DebtDetailDto, DebtTransactionDto } from '../../../shared/debt-contracts';

export const isCurrentActivityTransaction = (
  transaction: DebtTransactionDto,
): boolean =>
  transaction.status === 'posted' && transaction.transactionType !== 'reversal';

const dollarsToCents = (value: string): number => {
  const isNegative = value.startsWith('-');
  const absoluteValue = isNegative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = absoluteValue.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  return isNegative ? -cents : cents;
};

export const centsToDollarString = (value: number): string => {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
};

export const escrowActivityAmountCents = (
  transaction: DebtTransactionDto,
): number | null => {
  const escrowAllocation = transaction.allocations.find(
    (allocation) => allocation.allocationType === 'escrow',
  );
  if (!escrowAllocation) return null;

  const amountCents = dollarsToCents(escrowAllocation.amount);
  if (
    transaction.transactionType === 'payment' ||
    transaction.transactionType === 'escrow_disbursement' ||
    transaction.transactionType === 'escrow_refund'
  ) {
    return -amountCents;
  }

  return amountCents;
};

export const currentEscrowTransactions = (
  debt: DebtDetailDto,
): readonly DebtTransactionDto[] =>
  debt.transactions
    .filter(isCurrentActivityTransaction)
    .filter((transaction) => escrowActivityAmountCents(transaction) !== null)
    .sort((left, right) => {
      const dateComparison = left.effectiveDate.localeCompare(right.effectiveDate);
      if (dateComparison !== 0) return dateComparison;
      return left.createdAtUtc.localeCompare(right.createdAtUtc);
    });

export interface EscrowActivityDisplayRow {
  readonly transaction: DebtTransactionDto;
  readonly escrowAmountCents: number;
  readonly runningBalanceCents: number;
}

export const currentEscrowActivityRows = (
  debt: DebtDetailDto,
): readonly EscrowActivityDisplayRow[] => {
  let runningBalanceCents = 0;

  return currentEscrowTransactions(debt).flatMap((transaction) => {
    const escrowAmountCents = escrowActivityAmountCents(transaction);
    if (escrowAmountCents === null) return [];
    runningBalanceCents += escrowAmountCents;

    return [
      {
        transaction,
        escrowAmountCents,
        runningBalanceCents,
      },
    ];
  });
};
