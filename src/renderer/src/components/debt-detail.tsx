import type {
  BalanceReconciliationDto,
  DebtDetailDto,
  DebtTransactionDto,
} from '../../../shared/debt-contracts';
import { combinedDebtLabel } from './debt-label';
import {
  formatAbsoluteDollarString,
  formatDollarString,
  formatTimestamp,
} from './display-format';
import { labelFromValue } from './form-utils';

const Definition = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element => (
  <div>
    <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
      {label}
    </dt>
    <dd className="mt-1 text-sm leading-6 text-slate-900">{value}</dd>
  </div>
);

export interface DebtDetailProps {
  readonly debt: DebtDetailDto;
  readonly onAddTerm: () => void;
  readonly onArchiveOrRestore: () => void;
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onRecordReconciliation: () => void;
  readonly onCorrectReconciliation: (reconciliation: BalanceReconciliationDto) => void;
  readonly onVoidReconciliation: (reconciliation: BalanceReconciliationDto) => void;
  readonly onRecordTransaction: () => void;
  readonly onEditTransaction: (transaction: DebtTransactionDto) => void;
  readonly onReverseTransaction: (
    transactionId: string,
    expectedUpdatedAtUtc: string,
    defaultReversalDate: string,
  ) => void;
}

export const DebtDetail = ({
  debt,
  onAddTerm,
  onArchiveOrRestore,
  onBack,
  onEdit,
  onRecordReconciliation,
  onCorrectReconciliation,
  onVoidReconciliation,
  onRecordTransaction,
  onEditTransaction,
  onReverseTransaction,
}: DebtDetailProps): React.JSX.Element => (
  <section aria-labelledby="debt-detail-heading">
    <button
      className="text-sm font-semibold text-blue-700 hover:text-blue-900"
      onClick={onBack}
      type="button"
    >
      ← Back to debts
    </button>

    <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2
            className="text-3xl font-semibold tracking-tight"
            id="debt-detail-heading"
          >
            {combinedDebtLabel(debt)}
          </h2>
          {debt.archivedAtUtc ? (
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Archived
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!debt.archivedAtUtc ? (
          <>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={onEdit}
              type="button"
            >
              Edit details
            </button>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={onAddTerm}
              type="button"
            >
              Add term period
            </button>
            <button
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              onClick={onRecordTransaction}
              type="button"
            >
              Record transaction
            </button>
            {debt.debtType === 'mortgage' ? (
              <button
                className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
                onClick={onRecordTransaction}
                type="button"
              >
                Record escrow activity
              </button>
            ) : null}
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={onRecordReconciliation}
              type="button"
            >
              Reconcile balance
            </button>
          </>
        ) : null}
        <button
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          onClick={onArchiveOrRestore}
          type="button"
        >
          {debt.archivedAtUtc ? 'Restore debt' : 'Archive debt'}
        </button>
      </div>
    </div>

    <div className="mt-8">
      <section
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-labelledby="core-information-heading"
      >
        <h3 className="text-lg font-semibold" id="core-information-heading">
          Core debt information
        </h3>
        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <Definition label="Debt" value={combinedDebtLabel(debt)} />
          <Definition
            label="Current principal balance"
            value={`${formatDollarString(debt.currentBalance)} as of ${debt.currentBalanceEffectiveDate}`}
          />
          <Definition
            label="Current interest rate"
            value={`${debt.currentTerm.annualInterestRatePercent}%`}
          />
          <Definition
            label="Current required payment"
            value={`${formatDollarString(debt.currentTerm.requiredPayment)} ${labelFromValue(debt.currentTerm.paymentFrequency)}`}
          />
          <Definition label="Debt type" value={labelFromValue(debt.debtType)} />
          <Definition label="Origination date" value={debt.originationDate} />
          <Definition
            label="Maturity date"
            value={debt.maturityDate ?? 'Not provided'}
          />
          {debt.calculatedEscrowBalance !== '0.00' ? (
            <Definition
              label="Current escrow balance"
              value={formatDollarString(debt.calculatedEscrowBalance)}
            />
          ) : null}
          <Definition label="Status" value={labelFromValue(debt.status)} />
          {debt.archivedAtUtc ? (
            <Definition label="Archived" value={formatTimestamp(debt.archivedAtUtc)} />
          ) : null}
        </dl>
      </section>
    </div>

    <section
      className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="reconciliations-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold" id="reconciliations-heading">
            Balance reconciliations
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Statement balances are compared to the application-calculated ledger balance
            through the same date. Differences are calculated by the main process.
          </p>
        </div>
      </div>

      {debt.balanceReconciliations.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center">
          <h4 className="text-base font-semibold text-slate-900">
            No reconciliations yet
          </h4>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Use Reconcile balance when statement evidence is available. The workflow
            records the verified lender balance as a supporting confirmed snapshot.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="py-3 pr-4 font-semibold" scope="col">
                  Statement date
                </th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">
                  Statement balance
                </th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">
                  Calculated balance
                </th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">
                  Difference
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Status
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Support
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {debt.balanceReconciliations.map(
                (reconciliation: BalanceReconciliationDto) => (
                  <tr key={reconciliation.id}>
                    <td className="py-4 pr-4 align-top font-medium text-slate-900">
                      {reconciliation.statementDate}
                      <span className="mt-1 block text-xs text-slate-500">
                        Recorded {formatTimestamp(reconciliation.createdAtUtc)}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top text-right tabular-nums">
                      {formatDollarString(reconciliation.statementEndingBalance)}
                    </td>
                    <td className="px-4 py-4 align-top text-right tabular-nums">
                      {formatDollarString(reconciliation.applicationCalculatedBalance)}
                    </td>
                    <td className="px-4 py-4 align-top text-right tabular-nums">
                      {formatDollarString(reconciliation.calculatedDifference)}
                    </td>
                    <td className="px-4 py-4 align-top text-slate-700">
                      <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                        {labelFromValue(reconciliation.reconciliationStatus)}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {labelFromValue(reconciliation.lifecycleStatus)}
                      </span>
                      {reconciliation.approvedAdjustmentTransactionId ? (
                        <span className="mt-1 block text-xs text-slate-500">
                          Adjustment linked
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top text-slate-700">
                      {reconciliation.sourceReference ?? 'No statement reference'}
                      <span className="mt-1 block text-xs text-slate-500">
                        {reconciliation.explanation ??
                          reconciliation.supportingNotes ??
                          'No explanation entered'}
                      </span>
                      {reconciliation.lifecycleStatus === 'current' ? (
                        <span className="mt-2 flex flex-wrap gap-3">
                          <button
                            className="text-xs font-semibold text-blue-700 hover:text-blue-900 focus:underline focus:outline-none"
                            onClick={() => onCorrectReconciliation(reconciliation)}
                            type="button"
                          >
                            Correct
                          </button>
                          <button
                            className="text-xs font-semibold text-blue-700 hover:text-blue-900 focus:underline focus:outline-none"
                            onClick={() => onVoidReconciliation(reconciliation)}
                            type="button"
                          >
                            Void
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <section
      className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="transactions-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold" id="transactions-heading">
            Posted transactions
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            This ledger stores posted activity only. The current balance shown above is
            calculated from balance-affecting allocations and is not a confirmed lender
            balance.
          </p>
        </div>
      </div>

      {debt.transactions.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center">
          <h4 className="text-base font-semibold text-slate-900">
            No posted activity yet
          </h4>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Record a payment, draw, fee, escrow activity, or other posted transaction
            using positive user-entered amounts. The transaction type communicates
            direction.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="py-3 pr-4 font-semibold" scope="col">
                  Transaction date
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Type
                </th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">
                  Total
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Description
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Allocations
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Status
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {debt.transactions.map((transaction: DebtTransactionDto) => (
                <tr key={transaction.id}>
                  <td className="py-4 pr-4 align-top">
                    <span className="block font-medium text-slate-900">
                      {transaction.effectiveDate}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-700">
                    {labelFromValue(transaction.transactionType)}
                  </td>
                  <td className="px-4 py-4 align-top text-right tabular-nums">
                    {formatAbsoluteDollarString(transaction.totalAmount)}
                  </td>
                  <td className="px-4 py-4 align-top text-slate-700">
                    {transaction.description}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <ul className="space-y-1 text-xs text-slate-700">
                      {transaction.allocations.map((allocation) => (
                        <li
                          className="flex items-center justify-between gap-3"
                          key={allocation.id}
                        >
                          <span>{labelFromValue(allocation.allocationType)}</span>
                          <span className="tabular-nums">
                            {formatAbsoluteDollarString(allocation.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-700">
                    <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                      {labelFromValue(transaction.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top text-right">
                    {!debt.archivedAtUtc &&
                    transaction.status === 'posted' &&
                    transaction.transactionType !== 'reversal' &&
                    transaction.transactionType !==
                      'approved_reconciliation_adjustment' ? (
                      <div className="flex justify-end gap-3">
                        <button
                          className="font-semibold text-blue-700 hover:text-blue-900 focus:underline focus:outline-none"
                          onClick={() => onEditTransaction(transaction)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="font-semibold text-blue-700 hover:text-blue-900 focus:underline focus:outline-none"
                          onClick={() =>
                            onReverseTransaction(
                              transaction.id,
                              transaction.updatedAtUtc,
                              transaction.effectiveDate,
                            )
                          }
                          type="button"
                        >
                          Reverse
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {transaction.transactionType === 'reversal'
                          ? 'Reversals cannot be edited'
                          : transaction.transactionType ===
                              'approved_reconciliation_adjustment'
                            ? 'Use reconciliation correction'
                            : 'Not available'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <section
      className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="escrow-activity-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold" id="escrow-activity-heading">
            Escrow activity
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Escrow deposits, disbursements, refunds, and adjustments are tracked
            separately from mortgage principal.
          </p>
        </div>
      </div>

      {debt.transactions.filter((transaction) =>
        transaction.allocations.some(
          (allocation) => allocation.allocationType === 'escrow',
        ),
      ).length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-8 py-10 text-center">
          <h4 className="text-base font-semibold text-slate-900">
            No escrow activity recorded
          </h4>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Mortgage escrow deposits and disbursements will appear here when they are
            posted.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="py-3 pr-4 font-semibold" scope="col">
                  Transaction date
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Activity
                </th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">
                  Escrow amount
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {debt.transactions
                .filter((transaction) =>
                  transaction.allocations.some(
                    (allocation) => allocation.allocationType === 'escrow',
                  ),
                )
                .map((transaction: DebtTransactionDto) => {
                  const escrowAllocation = transaction.allocations.find(
                    (allocation) => allocation.allocationType === 'escrow',
                  );

                  return (
                    <tr key={`escrow-${transaction.id}`}>
                      <td className="py-4 pr-4 align-top">
                        <span className="block font-medium text-slate-900">
                          {transaction.effectiveDate}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top text-slate-700">
                        {labelFromValue(transaction.transactionType)}
                      </td>
                      <td className="px-4 py-4 align-top text-right tabular-nums">
                        {escrowAllocation
                          ? formatAbsoluteDollarString(escrowAllocation.amount)
                          : '—'}
                      </td>
                      <td className="px-4 py-4 align-top text-slate-700">
                        {transaction.description}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </section>
);
