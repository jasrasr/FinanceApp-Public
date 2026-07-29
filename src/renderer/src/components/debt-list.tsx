import type { DebtSummaryDto } from '../../../shared/debt-contracts';
import { combinedDebtLabel } from './debt-label';
import { formatDollarString } from './display-format';
import { labelFromValue } from './form-utils';

export interface DebtListProps {
  readonly debts: readonly DebtSummaryDto[];
  readonly includeArchived: boolean;
  readonly onCreate: () => void;
  readonly onIncludeArchivedChange: (includeArchived: boolean) => void;
  readonly onSelect: (id: string) => void;
}

export const DebtList = ({
  debts,
  includeArchived,
  onCreate,
  onIncludeArchivedChange,
  onSelect,
}: DebtListProps): React.JSX.Element => (
  <section aria-labelledby="debts-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-500">Debt maintenance</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight" id="debts-heading">
          Debts
        </h2>
      </div>
      <button
        className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus:ring-2 focus:ring-blue-300 focus:outline-none"
        onClick={onCreate}
        type="button"
      >
        Add debt
      </button>
    </div>

    <label className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <input
        checked={includeArchived}
        className="size-4 rounded border-slate-300"
        onChange={(event) => onIncludeArchivedChange(event.currentTarget.checked)}
        type="checkbox"
      />
      Include archived debts
    </label>

    {debts.length === 0 ? (
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
        <h3 className="text-lg font-semibold text-slate-900">No debts to display</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
          Create the first debt and its initial effective-dated terms, or include
          archived records if you expect to find an older obligation.
        </p>
        <button
          className="mt-5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          onClick={onCreate}
          type="button"
        >
          Create first debt
        </button>
      </div>
    ) : (
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <caption className="sr-only">
            Debt records with current calculated balances and current effective terms.
            Select a row to open debt detail.
          </caption>
          <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-600 uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold" scope="col">
                Debt
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Type
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Current principal
              </th>
              <th className="px-4 py-3 text-right font-semibold" scope="col">
                Current rate
              </th>
              <th className="px-4 py-3 text-right font-semibold" scope="col">
                Current payment
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Maturity
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {debts.map((debt) => (
              <tr
                aria-label={`Open ${combinedDebtLabel(debt)}`}
                className="cursor-pointer align-top hover:bg-slate-50 focus:bg-slate-50 focus:outline focus:outline-2 focus:outline-blue-500"
                key={debt.id}
                onClick={() => onSelect(debt.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(debt.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <td className="px-4 py-4">
                  <span className="block font-semibold text-slate-950">
                    {combinedDebtLabel(debt)}
                  </span>
                  {debt.archivedAtUtc ? (
                    <span className="mt-2 inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      Archived
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-slate-700">
                  {labelFromValue(debt.debtType)}
                </td>
                <td className="px-4 py-4 text-right font-variant-numeric tabular-nums">
                  {formatDollarString(debt.currentBalance)}
                  <span className="block text-xs text-slate-500">
                    as of {debt.currentBalanceEffectiveDate}
                  </span>
                  {debt.calculatedEscrowBalance !== '0.00' ? (
                    <span className="mt-1 block text-xs text-slate-500">
                      Escrow {formatDollarString(debt.calculatedEscrowBalance)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-right tabular-nums">
                  {debt.currentTerm.annualInterestRatePercent}%
                  <span className="block text-xs text-slate-500">
                    from {debt.currentTerm.effectiveStartDate}
                  </span>
                </td>
                <td className="px-4 py-4 text-right tabular-nums">
                  {formatDollarString(debt.currentTerm.requiredPayment)}
                  <span className="block text-xs text-slate-500">
                    {labelFromValue(debt.currentTerm.paymentFrequency)}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-700">
                  {debt.maturityDate ?? labelFromValue(debt.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);
