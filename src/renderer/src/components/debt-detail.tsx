import type { DebtDetailDto } from '../../../shared/debt-contracts';
import { formatDollarString, formatTimestamp } from './display-format';
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
}

export const DebtDetail = ({
  debt,
  onAddTerm,
  onArchiveOrRestore,
  onBack,
  onEdit,
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
            {debt.name}
          </h2>
          {debt.archivedAtUtc ? (
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Archived
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-slate-600">{debt.creditor}</p>
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

    <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-labelledby="core-information-heading"
      >
        <h3 className="text-lg font-semibold" id="core-information-heading">
          Core debt information
        </h3>
        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <Definition label="Owner or entity" value={debt.ownerEntity} />
          <Definition label="Debt type" value={labelFromValue(debt.debtType)} />
          <Definition label="Status" value={labelFromValue(debt.status)} />
          <Definition label="Purpose" value={debt.purpose} />
          <Definition
            label="Original principal"
            value={formatDollarString(debt.originalPrincipal)}
          />
          <Definition label="Origination date" value={debt.originationDate} />
          <Definition
            label="Maturity date"
            value={debt.maturityDate ?? 'Not provided'}
          />
          <Definition
            label="Opening minimum payment"
            value={`${formatDollarString(debt.minimumPayment)} · ${labelFromValue(debt.paymentFrequency)}`}
          />
          <Definition
            label="Credit limit"
            value={
              debt.creditLimit ? formatDollarString(debt.creditLimit) : 'Not applicable'
            }
          />
          <Definition
            label="Collateral"
            value={debt.collateralDescription ?? 'Not provided'}
          />
          <Definition label="Tax category" value={labelFromValue(debt.taxCategory)} />
          <Definition
            label="Deductible percentage"
            value={`${debt.deductiblePercentage}%`}
          />
          <Definition label="Notes" value={debt.notes ?? 'No notes'} />
          <Definition label="Created" value={formatTimestamp(debt.createdAtUtc)} />
          <Definition label="Last updated" value={formatTimestamp(debt.updatedAtUtc)} />
          {debt.archivedAtUtc ? (
            <Definition label="Archived" value={formatTimestamp(debt.archivedAtUtc)} />
          ) : null}
        </dl>
      </section>

      <aside className="rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h3 className="font-semibold text-blue-950">Balance information</h3>
        <p className="mt-2 text-sm leading-6 text-blue-900">
          This phase records original principal and contractual terms only. No current,
          calculated, confirmed, projected, or scenario balance is displayed.
        </p>
        <p className="mt-4 text-sm leading-6 text-blue-900">
          Transactions and reconciliations will appear here after their controlled entry
          workflows are implemented.
        </p>
      </aside>
    </div>

    <section
      className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="terms-heading"
    >
      <div>
        <h3 className="text-lg font-semibold" id="terms-heading">
          Effective-dated debt terms
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Historical periods are preserved. End dates are inclusive.
        </p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="py-3 pr-4 font-semibold" scope="col">
                Effective period
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Rate
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Conventions
              </th>
              <th className="px-4 py-3 text-right font-semibold" scope="col">
                Required payment
              </th>
              <th className="py-3 pl-4 font-semibold" scope="col">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {debt.terms.map((term, index) => (
              <tr key={term.id}>
                <td className="py-4 pr-4">
                  <span className="font-medium">{term.effectiveStartDate}</span>
                  <span className="block text-slate-500">
                    through {term.effectiveEndDate ?? 'open'}
                  </span>
                  {index === 0 ? (
                    <span className="mt-1 block text-xs font-semibold text-slate-500">
                      Initial term
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-4 tabular-nums">
                  {term.annualInterestRatePercent}%
                  <span className="block text-slate-500">
                    {labelFromValue(term.interestRateType)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {labelFromValue(term.dayCountConvention)}
                  <span className="block text-slate-500">
                    {labelFromValue(term.calculationConvention)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right tabular-nums">
                  {formatDollarString(term.requiredPayment)}
                  <span className="block text-slate-500">
                    {labelFromValue(term.paymentFrequency)}
                  </span>
                </td>
                <td className="py-4 pl-4 text-slate-600">{term.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </section>
);
