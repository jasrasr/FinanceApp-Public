import type { DashboardDto } from '../../../shared/debt-contracts';
import { formatDollarString } from './display-format';
import { labelFromValue } from './form-utils';

export interface DashboardProps {
  readonly dashboard: DashboardDto;
  readonly onSelectDebt: (id: string) => void;
}

const MetricCard = ({
  basis,
  label,
  value,
}: {
  readonly basis: string;
  readonly label: string;
  readonly value: string;
}): React.JSX.Element => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-600">{label}</h3>
    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    <p className="mt-3 text-xs leading-5 text-slate-500">{basis}</p>
  </section>
);

const DebtLinkButton = ({
  children,
  debtId,
  onSelectDebt,
}: {
  readonly children: string;
  readonly debtId: string;
  readonly onSelectDebt: (id: string) => void;
}): React.JSX.Element => (
  <button
    className="font-semibold text-blue-700 hover:text-blue-900 focus:underline focus:outline-none"
    onClick={() => onSelectDebt(debtId)}
    type="button"
  >
    {children}
  </button>
);

export const Dashboard = ({
  dashboard,
  onSelectDebt,
}: DashboardProps): React.JSX.Element => {
  const metricCards = [
    {
      label: 'Total active debt',
      value: formatDollarString(dashboard.totals.activeDebt),
      basis: dashboard.metricBasis.activeDebt,
    },
    {
      label: 'Principal reduction YTD',
      value: formatDollarString(dashboard.totals.principalReductionYtd),
      basis: dashboard.metricBasis.principalReductionYtd,
    },
    {
      label: 'New borrowings YTD',
      value: formatDollarString(dashboard.totals.newBorrowingsYtd),
      basis: dashboard.metricBasis.newBorrowingsYtd,
    },
    {
      label: 'Interest activity YTD',
      value: formatDollarString(dashboard.totals.interestActivityYtd),
      basis: dashboard.metricBasis.interestActivityYtd,
    },
    {
      label: 'Current escrow balance',
      value: formatDollarString(dashboard.totals.escrowBalance),
      basis: dashboard.metricBasis.escrowBalance,
    },
    {
      label: 'Required monthly payments',
      value: formatDollarString(dashboard.totals.requiredMonthlyPayments),
      basis: dashboard.metricBasis.requiredMonthlyPayments,
    },
    {
      label: 'Weighted-average rate',
      value: dashboard.totals.weightedAverageInterestRate
        ? `${dashboard.totals.weightedAverageInterestRate}%`
        : 'Not available',
      basis: dashboard.metricBasis.weightedAverageInterestRate,
    },
  ];

  return (
    <section aria-labelledby="dashboard-heading">
      <div>
        <p className="text-sm font-medium text-slate-500">Dashboard</p>
        <h2
          className="mt-1 text-3xl font-semibold tracking-tight"
          id="dashboard-heading"
        >
          Debt overview
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Metrics use active debts only and are effective as of{' '}
          {dashboard.effectiveDate}. Year-to-date values begin{' '}
          {dashboard.yearToDateStartDate}.
        </p>
      </div>

      {dashboard.activeDebtCount === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
          <h3 className="text-lg font-semibold text-slate-900">
            No active debts to summarize
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            Create an active debt before dashboard totals can be calculated.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {metricCards.map((metric) => (
              <MetricCard
                basis={metric.basis}
                key={metric.label}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </div>

          <section
            className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            aria-labelledby="dashboard-escrow-heading"
          >
            <h3 className="text-lg font-semibold" id="dashboard-escrow-heading">
              Escrow balances
            </h3>
            {dashboard.escrowBalances.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No active debts have posted escrow activity as of the dashboard
                effective date.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="py-3 pr-4 font-semibold" scope="col">
                        Debt
                      </th>
                      <th className="px-4 py-3 text-right font-semibold" scope="col">
                        Escrow balance
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        Basis
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dashboard.escrowBalances.map((item) => (
                      <tr key={`${item.debtId}-${item.effectiveDate}-escrow`}>
                        <td className="py-4 pr-4 align-top">
                          <DebtLinkButton
                            debtId={item.debtId}
                            onSelectDebt={onSelectDebt}
                          >
                            {item.debtName}
                          </DebtLinkButton>
                          <span className="mt-1 block text-slate-500">
                            {item.creditor}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right align-top tabular-nums">
                          {formatDollarString(item.amount)}
                        </td>
                        <td className="px-4 py-4 align-top text-slate-600">
                          {item.basis}
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
            aria-labelledby="dashboard-attention-heading"
          >
            <h3 className="text-lg font-semibold" id="dashboard-attention-heading">
              Items requiring attention
            </h3>
            {dashboard.attentionItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No unreconciled, in-progress, or exception reconciliation items for
                active debts.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="py-3 pr-4 font-semibold" scope="col">
                        Debt
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        Statement date
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right font-semibold" scope="col">
                        Difference
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        Basis
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dashboard.attentionItems.map((item) => (
                      <tr key={`${item.debtId}-${item.statementDate}-${item.status}`}>
                        <td className="py-4 pr-4 align-top">
                          <DebtLinkButton
                            debtId={item.debtId}
                            onSelectDebt={onSelectDebt}
                          >
                            {item.debtName}
                          </DebtLinkButton>
                          <span className="mt-1 block text-slate-500">
                            {item.creditor}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top tabular-nums">
                          {item.statementDate}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {labelFromValue(item.status)}
                        </td>
                        <td className="px-4 py-4 text-right align-top tabular-nums">
                          {formatDollarString(item.difference)}
                        </td>
                        <td className="px-4 py-4 align-top text-slate-600">
                          {item.basis}
                          {item.sourceReference ? (
                            <span className="mt-1 block text-xs text-slate-500">
                              Source {item.sourceReference}
                            </span>
                          ) : null}
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
            aria-labelledby="dashboard-maturities-heading"
          >
            <h3 className="text-lg font-semibold" id="dashboard-maturities-heading">
              Upcoming maturities
            </h3>
            {dashboard.upcomingMaturities.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No active debts mature within 12 months of the dashboard effective date.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="py-3 pr-4 font-semibold" scope="col">
                        Debt
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        Maturity date
                      </th>
                      <th className="px-4 py-3 text-right font-semibold" scope="col">
                        Calculated balance
                      </th>
                      <th className="px-4 py-3 font-semibold" scope="col">
                        Basis
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dashboard.upcomingMaturities.map((item) => (
                      <tr key={`${item.debtId}-${item.effectiveDate}`}>
                        <td className="py-4 pr-4 align-top">
                          <DebtLinkButton
                            debtId={item.debtId}
                            onSelectDebt={onSelectDebt}
                          >
                            {item.debtName}
                          </DebtLinkButton>
                          <span className="mt-1 block text-slate-500">
                            {item.creditor}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top tabular-nums">
                          {item.effectiveDate}
                        </td>
                        <td className="px-4 py-4 text-right align-top tabular-nums">
                          {formatDollarString(item.amount)}
                        </td>
                        <td className="px-4 py-4 align-top text-slate-600">
                          {item.basis}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
};
