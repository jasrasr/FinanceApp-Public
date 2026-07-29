import type { DebtDetailDto, DebtTransactionDto } from '../../../shared/debt-contracts';
import { combinedDebtLabel } from './debt-label';
import { formatAbsoluteDollarString, formatDollarString } from './display-format';
import { labelFromValue } from './form-utils';

export interface EscrowDetailProps {
  readonly debts: readonly DebtDetailDto[];
  readonly effectiveDate: string;
  readonly loading: boolean;
  readonly onBackToDashboard: () => void;
  readonly onSelectDebt: (id: string) => void;
}

const escrowTransactions = (debt: DebtDetailDto): readonly DebtTransactionDto[] =>
  debt.transactions.filter((transaction) =>
    transaction.allocations.some(
      (allocation) => allocation.allocationType === 'escrow',
    ),
  );

export const EscrowDetail = ({
  debts,
  effectiveDate,
  loading,
  onBackToDashboard,
  onSelectDebt,
}: EscrowDetailProps): React.JSX.Element => (
  <section aria-labelledby="escrow-detail-heading">
    <button
      className="text-sm font-semibold text-blue-700 hover:text-blue-900 focus:underline focus:outline-none"
      onClick={onBackToDashboard}
      type="button"
    >
      ← Back to dashboard
    </button>

    <div className="mt-5">
      <p className="text-sm font-medium text-slate-500">Escrow detail</p>
      <h2
        className="mt-1 text-3xl font-semibold tracking-tight"
        id="escrow-detail-heading"
      >
        Escrow balances and activity
      </h2>
      <p className="sr-only">
        Escrow amounts are calculated from posted escrow allocations and remain separate
        from debt principal balances as of {effectiveDate}.
      </p>
    </div>

    {loading ? (
      <section
        aria-label="Loading escrow detail"
        className="mt-8 rounded-xl border border-slate-200 bg-white p-10"
      >
        <p className="text-sm font-medium text-slate-600">Loading escrow detail…</p>
      </section>
    ) : null}

    {!loading && debts.length === 0 ? (
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
        <h3 className="text-lg font-semibold text-slate-900">
          No escrow activity recorded
        </h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
          Mortgage escrow deposits, disbursements, refunds, and adjustments will appear
          here after they are posted.
        </p>
      </div>
    ) : null}

    {!loading ? (
      <div className="mt-6 space-y-6">
        {debts.map((debt) => (
          <section
            aria-labelledby={`escrow-${debt.id}`}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            key={debt.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold" id={`escrow-${debt.id}`}>
                  <button
                    className="text-left hover:text-blue-800 focus:underline focus:outline-none"
                    onClick={() => onSelectDebt(debt.id)}
                    type="button"
                  >
                    {combinedDebtLabel(debt)}
                  </button>
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Balance as of {effectiveDate}
                </p>
              </div>
              <p className="text-right">
                <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Current escrow balance
                </span>
                <span className="mt-1 block text-xl font-semibold tabular-nums">
                  {formatDollarString(debt.calculatedEscrowBalance)}
                </span>
              </p>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="py-3 pr-4 font-semibold" scope="col">
                      Date
                    </th>
                    <th className="px-4 py-3 font-semibold" scope="col">
                      Activity
                    </th>
                    <th className="px-4 py-3 text-right font-semibold" scope="col">
                      Escrow amount
                    </th>
                    <th className="px-4 py-3 font-semibold" scope="col">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {escrowTransactions(debt).map((transaction) => {
                    const escrowAllocation = transaction.allocations.find(
                      (allocation) => allocation.allocationType === 'escrow',
                    );

                    return (
                      <tr key={transaction.id}>
                        <td className="py-4 pr-4 align-top font-medium">
                          {transaction.effectiveDate}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {labelFromValue(transaction.transactionType)}
                        </td>
                        <td className="px-4 py-4 text-right align-top tabular-nums">
                          {escrowAllocation
                            ? formatAbsoluteDollarString(escrowAllocation.amount)
                            : '—'}
                        </td>
                        <td className="px-4 py-4 align-top text-slate-600">
                          {transaction.description}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    ) : null}
  </section>
);
