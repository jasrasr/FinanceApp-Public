import { useState } from 'react';
import type { DataHealthDto } from '../../../shared/debt-contracts';

export interface DataHealthProps {
  readonly health: DataHealthDto;
  readonly onSelectDebt: (debtId: string) => void;
  readonly onAcceptCurrentBalance: (debtId: string) => void;
}

const statusLabel = (status: DataHealthDto['rows'][number]['status']): string =>
  status.charAt(0).toUpperCase() + status.slice(1);

const statusClass = (status: DataHealthDto['rows'][number]['status']): string => {
  if (status === 'attention') return 'border-red-200 bg-red-50 text-red-900';
  if (status === 'review') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-emerald-200 bg-emerald-50 text-emerald-900';
};

export const DataHealth = ({
  health,
  onSelectDebt,
  onAcceptCurrentBalance,
}: DataHealthProps): React.JSX.Element => {
  const [pendingDebtId, setPendingDebtId] = useState<string | null>(null);
  const pendingRow = health.rows.find((row) => row.debtId === pendingDebtId) ?? null;
  const canAcceptCurrentBalance = (row: DataHealthDto['rows'][number]): boolean =>
    row.reasons.some((reason) =>
      [
        'never_reconciled',
        'activity_since_reconciliation',
        'edited_or_voided_activity',
        'refinance_activity',
        'stale_reconciliation',
        'reconciliation_exception',
      ].includes(reason.code),
    );

  return (
    <section aria-labelledby="data-health-heading" className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <p className="text-sm font-medium text-slate-500">Data management</p>
        <h2
          className="mt-1 text-3xl font-semibold tracking-tight"
          id="data-health-heading"
        >
          Reconciliation and data health
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          A concise review queue for active debts. Balances are application-calculated
          as of {health.effectiveDate}.
        </p>
      </div>

      <section aria-label="Data health summary" className="grid gap-4 md:grid-cols-3">
        {(['current', 'review', 'attention'] as const).map((status) => (
          <div
            className={`rounded-xl border p-5 shadow-sm ${statusClass(status)}`}
            key={status}
          >
            <p className="text-xs font-semibold tracking-wide uppercase">
              {statusLabel(status)}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {health.counts[status]}
            </p>
            <p className="mt-1 text-sm">
              {status === 'current' ? 'No review reason' : 'Debt(s) needing review'}
            </p>
          </div>
        ))}
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        aria-label="Data health distribution"
      >
        <h3 className="text-lg font-semibold">Status distribution</h3>
        <div
          className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`${health.counts.attention} attention, ${health.counts.review} review, ${health.counts.current} current`}
        >
          {(['attention', 'review', 'current'] as const).map((status) => (
            <div
              className={
                status === 'attention'
                  ? 'bg-red-500'
                  : status === 'review'
                    ? 'bg-amber-400'
                    : 'bg-emerald-500'
              }
              key={status}
              style={{
                width: `${health.rows.length ? (health.counts[status] / health.rows.length) * 100 : 0}%`,
              }}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Debt review queue</h3>
        {health.rows.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            No active debts require review.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Debt</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last reconciliation</th>
                  <th className="px-3 py-2">Days</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2">Activity</th>
                  <th className="px-3 py-2">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {health.rows.map((row) => (
                  <tr className="border-t border-slate-100" key={row.debtId}>
                    <td className="px-3 py-3">
                      <button
                        className="text-left font-semibold underline"
                        onClick={() => onSelectDebt(row.debtId)}
                        type="button"
                      >
                        {row.debtName}
                      </button>
                      <p className="text-xs text-slate-500">{row.creditor}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.lastReconciliationDate ?? 'Never'}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.daysSinceReconciliation ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {row.currentBalance}
                    </td>
                    <td className="px-3 py-3">{row.activitySinceLastReconciliation}</td>
                    <td className="max-w-sm px-3 py-3">
                      {row.reasons.length
                        ? row.reasons.map((reason) => reason.label).join('; ')
                        : 'No review reason'}
                      {canAcceptCurrentBalance(row) ? (
                        <button
                          className="mt-2 block font-semibold underline"
                          onClick={() => setPendingDebtId(row.debtId)}
                          type="button"
                        >
                          Accept current balance
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {pendingRow ? (
        <div
          aria-labelledby="accept-current-balance-heading"
          aria-modal="true"
          className="fixed inset-0 z-10 flex items-center justify-center bg-slate-950/30 p-6"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-xl font-semibold" id="accept-current-balance-heading">
              Accept current balance
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Debt</dt>
                <dd>{pendingRow.debtName}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">
                  Application-calculated balance
                </dt>
                <dd className="font-mono">{pendingRow.currentBalance}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Effective date</dt>
                <dd>{pendingRow.effectiveDate}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-slate-700">
              This accepts the application-calculated principal balance as the current
              control balance. It does not verify the balance with a lender and does not
              change transactions or ledger calculations.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold"
                onClick={() => setPendingDebtId(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => {
                  onAcceptCurrentBalance(pendingRow.debtId);
                  setPendingDebtId(null);
                }}
                type="button"
              >
                Accept current balance
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
