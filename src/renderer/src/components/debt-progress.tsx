import { useState } from 'react';
import type {
  DebtReportsDto,
  DebtSummaryDto,
  GetDebtReportsRequest,
} from '../../../shared/debt-contracts';
import { REPORTING_HISTORY_START_DATE } from '../../../shared/reporting-constants';
import { formatDollarString } from './display-format';

type Preset = 'ytd' | 'prior-year' | 'last-12-months' | 'all-time' | 'custom';

export interface DebtProgressProps {
  readonly debts: readonly DebtSummaryDto[];
  readonly loading: boolean;
  readonly reports: DebtReportsDto | null;
  readonly onApplyFilters: (request: GetDebtReportsRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const dateRangeForPreset = (preset: Preset): { startDate: string; endDate: string } => {
  const endDate = today();
  const year = Number(endDate.slice(0, 4));
  switch (preset) {
    case 'ytd':
      return { startDate: `${year}-01-01`, endDate };
    case 'prior-year':
      return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
    case 'last-12-months': {
      const start = new Date(Date.UTC(year, Number(endDate.slice(5, 7)) - 12, 1));
      return { startDate: start.toISOString().slice(0, 10), endDate };
    }
    case 'all-time':
      return { startDate: REPORTING_HISTORY_START_DATE, endDate };
    case 'custom':
      return { startDate: `${year}-01-01`, endDate };
  }
};

const numeric = (value: string | undefined): number => Number(value ?? '0');
const money = (value: number): string => value.toFixed(2);

const ProgressChart = ({
  rows,
}: {
  readonly rows: readonly DebtReportsDto['monthlyRollforward']['rows'][number][];
}): React.JSX.Element => {
  const width = 900;
  const height = 280;
  const left = 58;
  const right = 18;
  const top = 24;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const values = rows.flatMap((row) => [
    Math.abs(numeric(row.principalReduction)),
    Math.abs(numeric(row.purchases)),
    Math.abs(numeric(row.borrowings)),
    Math.abs(
      numeric(row.principalReduction) -
        numeric(row.purchases) -
        numeric(row.borrowings),
    ),
  ]);
  const maximum = Math.max(1, ...values);
  const slot = chartWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(3, Math.min(12, slot / 6));
  const series = [
    { key: 'principalReduction', label: 'Principal paid', color: '#2563eb' },
    { key: 'purchases', label: 'Purchases / Charges', color: '#d97706' },
    { key: 'borrowings', label: 'New borrowing', color: '#dc2626' },
    { key: 'netDebtReduction', label: 'Net debt reduction', color: '#059669' },
  ] as const;
  const valueFor = (
    row: (typeof rows)[number],
    key: (typeof series)[number]['key'],
  ): number =>
    key === 'netDebtReduction'
      ? numeric(row.principalReduction) -
        numeric(row.purchases) -
        numeric(row.borrowings)
      : numeric(row[key]);

  return (
    <div
      aria-label="Monthly debt progress trend chart. Tabular detail follows."
      className="mt-3 rounded-lg border border-slate-200 bg-white p-4"
      role="img"
    >
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-700">
        {series.map((item) => (
          <span className="inline-flex items-center gap-1" key={item.key}>
            <span className="h-3 w-3" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`}>
        <line
          stroke="#cbd5e1"
          x1={left}
          x2={width - right}
          y1={height - bottom}
          y2={height - bottom}
        />
        {rows.map((row, rowIndex) =>
          series.map((item, seriesIndex) => {
            const value = valueFor(row, item.key);
            const barHeight = (Math.abs(value) / maximum) * chartHeight;
            const x =
              left + rowIndex * slot + slot / 2 + (seriesIndex - 1.5) * (barWidth + 1);
            const y = value >= 0 ? height - bottom - barHeight : height - bottom;
            return (
              <rect
                fill={item.color}
                height={barHeight}
                key={`${row.period}-${item.key}`}
                width={barWidth}
                x={x}
                y={y}
              >
                <title>{`${row.period} — ${item.label}: ${formatDollarString(money(value))}`}</title>
              </rect>
            );
          }),
        )}
        {rows.map((row, index) => (
          <text
            fill="#475569"
            fontSize="10"
            key={row.period}
            textAnchor="middle"
            x={left + index * slot + slot / 2}
            y={height - 16}
          >
            {row.period.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
};

const BalanceChart = ({
  rows,
}: {
  readonly rows: readonly DebtReportsDto['monthlyRollforward']['rows'][number][];
}): React.JSX.Element => {
  const width = 900;
  const height = 220;
  const left = 64;
  const right = 20;
  const top = 18;
  const bottom = 34;
  const values = rows.flatMap((row) => [
    numeric(row.beginningBalance),
    numeric(row.endingBalance),
  ]);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const xFor = (index: number): number =>
    left + (index / Math.max(rows.length - 1, 1)) * (width - left - right);
  const yFor = (value: number): number =>
    height -
    bottom -
    ((value - minimum) / (maximum - minimum)) * (height - top - bottom);
  const points = (key: 'beginningBalance' | 'endingBalance'): string =>
    rows.map((row, index) => `${xFor(index)},${yFor(numeric(row[key]))}`).join(' ');

  return (
    <div
      aria-label="Total debt balance trend chart. Tabular detail follows."
      className="mt-3 rounded-lg border border-slate-200 bg-white p-4"
      role="img"
    >
      <div className="mb-3 flex gap-4 text-xs text-slate-700">
        <span className="text-slate-500">Beginning balance</span>
        <span className="font-semibold text-slate-900">Ending balance</span>
      </div>
      <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`}>
        <line
          stroke="#cbd5e1"
          x1={left}
          x2={width - right}
          y1={height - bottom}
          y2={height - bottom}
        />
        <polyline
          fill="none"
          points={points('beginningBalance')}
          stroke="#94a3b8"
          strokeDasharray="4 3"
          strokeWidth="2"
        />
        <polyline
          fill="none"
          points={points('endingBalance')}
          stroke="#0f172a"
          strokeWidth="3"
        />
        {rows.map((row, index) => (
          <circle
            cx={xFor(index)}
            cy={yFor(numeric(row.endingBalance))}
            fill="#0f172a"
            key={row.period}
            r="3"
          >
            <title>{`${row.period} — ending balance: ${formatDollarString(row.endingBalance)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
};

export const DebtProgress = ({
  debts,
  loading,
  onApplyFilters,
  reports,
}: DebtProgressProps): React.JSX.Element => {
  const [preset, setPreset] = useState<Preset>('ytd');
  const [debtId, setDebtId] = useState<string | null>(null);
  const initialRange = dateRangeForPreset('ytd');
  const [customStartDate, setCustomStartDate] = useState(initialRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(initialRange.endDate);
  const range =
    preset === 'custom'
      ? { startDate: customStartDate, endDate: customEndDate }
      : dateRangeForPreset(preset);
  const apply = (nextPreset: Preset = preset, nextDebtId = debtId): void => {
    const nextRange =
      nextPreset === 'custom'
        ? { startDate: customStartDate, endDate: customEndDate }
        : dateRangeForPreset(nextPreset);
    onApplyFilters({
      startDate: nextRange.startDate,
      endDate: nextRange.endDate,
      debtId: nextDebtId,
      ownerEntity: null,
      debtType: null,
      status: null,
    });
  };
  const rows = reports?.monthlyRollforward.rows ?? [];
  const first = rows[0];
  const last = rows.at(-1);
  const principalPaid = rows.reduce(
    (total, row) => total + numeric(row.principalReduction),
    0,
  );
  const purchases = rows.reduce((total, row) => total + numeric(row.purchases), 0);
  const borrowings = rows.reduce((total, row) => total + numeric(row.borrowings), 0);
  const interest = rows.reduce(
    (total, row) => total + numeric(row.interestActivity),
    0,
  );
  const netTransfers = rows.reduce(
    (total, row) => total + numeric(row.netTransfers),
    0,
  );
  const netReduction = principalPaid - purchases - borrowings;
  const isIndividual = debtId !== null;

  return (
    <section aria-labelledby="debt-progress-heading">
      <p className="text-sm font-medium text-slate-500">Analysis</p>
      <h2
        className="mt-1 text-3xl font-semibold tracking-tight"
        id="debt-progress-heading"
      >
        Debt Progress / Trends
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        How much debt am I actually reducing over time? Transfers are shown separately
        and excluded from portfolio net debt reduction.
      </p>

      <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">
          Period
          <select
            className="mt-1 block w-full rounded-md border border-slate-300 p-2"
            onChange={(event) => {
              const value = event.target.value as Preset;
              setPreset(value);
              if (value !== 'custom') apply(value);
            }}
            value={preset}
          >
            <option value="ytd">Year to date</option>
            <option value="prior-year">Prior year</option>
            <option value="last-12-months">Last 12 months</option>
            <option value="all-time">All time</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Debt
          <select
            className="mt-1 block w-full rounded-md border border-slate-300 p-2"
            onChange={(event) => {
              const value = event.target.value || null;
              setDebtId(value);
              apply(preset, value);
            }}
            value={debtId ?? ''}
          >
            <option value="">Entire portfolio</option>
            {debts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {debt.name}
              </option>
            ))}
          </select>
        </label>
        {preset === 'custom' ? (
          <>
            <label className="text-sm font-medium text-slate-700">
              Start
              <input
                className="mt-1 block w-full rounded-md border border-slate-300 p-2"
                onChange={(event) => setCustomStartDate(event.target.value)}
                type="date"
                value={customStartDate}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              End
              <input
                className="mt-1 block w-full rounded-md border border-slate-300 p-2"
                onChange={(event) => setCustomEndDate(event.target.value)}
                type="date"
                value={customEndDate}
              />
            </label>
            <button
              className="self-end rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => apply()}
              type="button"
            >
              Apply range
            </button>
          </>
        ) : null}
      </div>

      {loading && !reports ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading debt progress…
        </p>
      ) : null}
      {reports && rows.length > 0 ? (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {range.startDate} through {range.endDate}. Beginning and ending balances use
            the existing application-calculated principal ledger.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-4 lg:grid-cols-7">
            {[
              ['Beginning debt', first?.beginningBalance ?? '0.00'],
              ['Ending debt', last?.endingBalance ?? '0.00'],
              ['Principal paid', money(principalPaid)],
              ['Net debt reduction', money(netReduction)],
              ['Interest paid', money(interest)],
              ['New borrowing', money(borrowings)],
              ['Purchases / Charges', money(purchases)],
            ].map(([label, value]) => (
              <section
                aria-label={`${label}: ${formatDollarString(value ?? '0.00')}`}
                className={`rounded-lg border bg-white p-4 shadow-sm ${label === 'Net debt reduction' ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'}`}
                key={label}
              >
                <h3 className="text-sm font-semibold text-slate-600">{label}</h3>
                <p className="mt-2 text-xl font-semibold">
                  {formatDollarString(value ?? '0.00')}
                </p>
              </section>
            ))}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section>
              <h3 className="text-lg font-semibold">Monthly debt progress</h3>
              <ProgressChart rows={rows} />
            </section>
            <section>
              <h3 className="text-lg font-semibold">Total debt balance</h3>
              <BalanceChart rows={rows} />
            </section>
          </div>
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold">Monthly breakdown</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <tr>
                    {[
                      'Month',
                      'Beginning balance',
                      'Principal paid',
                      'Purchases / Charges',
                      'New borrowing',
                      'Transfer in',
                      'Transfer out',
                      'Interest',
                      'Fees',
                      'Net debt reduction',
                      'Ending balance',
                    ].map((heading) => (
                      <th
                        className="whitespace-nowrap px-3 py-2 font-semibold"
                        key={heading}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className="border-b border-slate-100" key={row.period}>
                      <td className="px-3 py-2 font-semibold">{row.period}</td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.beginningBalance)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.principalReduction)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.purchases ?? '0.00')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.borrowings)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.transferIn ?? '0.00')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.transferOut ?? '0.00')}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.interestActivity)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.fees ?? '0.00')}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatDollarString(
                          money(
                            numeric(row.principalReduction) -
                              numeric(row.purchases) -
                              numeric(row.borrowings),
                          ),
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDollarString(row.endingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold">Reconciliation</p>
            <p className="mt-1">
              Beginning balance + purchases/charges + new borrowing + net transfers −
              principal paid = ending principal balance. Each source report row must
              have a zero rollforward difference.
            </p>
            <p className="mt-1">
              Portfolio net transfers: {formatDollarString(money(netTransfers))}.{' '}
              {isIndividual
                ? 'For an individual debt, Transfer In and Transfer Out remain visible because they affect that account.'
                : 'For the portfolio, Transfer In and Transfer Out net to zero and are excluded from net debt reduction.'}
            </p>
          </div>
          {reports.progressSummary?.comparison ? (
            <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold">Prior equivalent period</h3>
              <p className="mt-1 text-xs text-slate-500">
                {reports.progressSummary.comparison.startDate} through{' '}
                {reports.progressSummary.comparison.endDate}
              </p>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Principal paid</dt>
                  <dd className="font-semibold">
                    {formatDollarString(
                      reports.progressSummary.comparison.principalPaid,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Net debt reduction</dt>
                  <dd className="font-semibold">
                    {formatDollarString(
                      reports.progressSummary.comparison.netDebtReduction,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Interest paid</dt>
                  <dd className="font-semibold">
                    {formatDollarString(
                      reports.progressSummary.comparison.interestPaid,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Ending debt</dt>
                  <dd className="font-semibold">
                    {formatDollarString(reports.progressSummary.comparison.endingDebt)}
                  </dd>
                </div>
              </dl>
            </section>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              No prior equivalent period is available for comparison.
            </p>
          )}
        </>
      ) : reports ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No activity rows match this period or debt filter.
        </p>
      ) : null}
    </section>
  );
};
