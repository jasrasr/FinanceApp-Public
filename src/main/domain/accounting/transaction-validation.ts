import type { AllocationType, TransactionType } from './constants';

export interface TransactionAllocationInput {
  readonly allocationType: AllocationType;
  readonly amountCents: number;
}

export interface AllocationReconciliation {
  readonly allocationTotalCents: number;
  readonly differenceCents: number;
  readonly isReconciled: boolean;
}

export interface TransactionSignInput {
  readonly transactionType: TransactionType;
  readonly totalAmountCents: number;
  readonly reversalOfTransactionId?: string | null;
}

const POSITIVE_TRANSACTION_TYPES = new Set<TransactionType>([
  'borrowing_draw',
  'purchase',
  'fee',
  'penalty',
  'interest_charge',
  'escrow_disbursement',
  'escrow_refund',
]);

export const calculateAllocationReconciliation = (
  transactionTotalCents: number,
  allocations: readonly TransactionAllocationInput[],
): AllocationReconciliation => {
  if (!Number.isSafeInteger(transactionTotalCents)) {
    throw new RangeError('Transaction total must be safe-integer cents.');
  }

  let allocationTotalCents = 0;

  for (const allocation of allocations) {
    if (!Number.isSafeInteger(allocation.amountCents)) {
      throw new RangeError('Allocation amount must be safe-integer cents.');
    }

    allocationTotalCents += allocation.amountCents;

    if (!Number.isSafeInteger(allocationTotalCents)) {
      throw new RangeError('Allocation total exceeds the safe-integer range.');
    }
  }

  const differenceCents = transactionTotalCents - allocationTotalCents;

  return {
    allocationTotalCents,
    differenceCents,
    isReconciled: differenceCents === 0,
  };
};

export const validateTransactionSignConvention = (
  transaction: TransactionSignInput,
  allocations: readonly TransactionAllocationInput[],
): readonly string[] => {
  const errors: string[] = [];
  const { totalAmountCents, transactionType, reversalOfTransactionId } = transaction;

  if (!Number.isSafeInteger(totalAmountCents) || totalAmountCents === 0) {
    errors.push('Transaction total must be nonzero safe-integer cents.');
  }

  if (transactionType === 'payment' && totalAmountCents >= 0) {
    errors.push('Payments must have a negative transaction total.');
  }

  if (POSITIVE_TRANSACTION_TYPES.has(transactionType) && totalAmountCents <= 0) {
    errors.push(`${transactionType} transactions must have a positive total.`);
  }

  if (transactionType === 'reversal' && !reversalOfTransactionId) {
    errors.push('A reversal must reference the original transaction.');
  }

  if (transactionType !== 'reversal' && reversalOfTransactionId) {
    errors.push('Only a reversal may reference reversalOfTransactionId.');
  }

  for (const allocation of allocations) {
    if (allocation.amountCents === 0) {
      errors.push('Allocation amounts must be nonzero.');
    } else if (
      totalAmountCents !== 0 &&
      Math.sign(allocation.amountCents) !== Math.sign(totalAmountCents)
    ) {
      errors.push('Allocation signs must match the transaction total sign.');
    }
  }

  const reconciliation = calculateAllocationReconciliation(
    totalAmountCents,
    allocations,
  );

  if (!reconciliation.isReconciled) {
    errors.push('Transaction allocations must equal the transaction total.');
  }

  return errors;
};
