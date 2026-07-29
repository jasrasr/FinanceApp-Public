import { useState } from 'react';
import type {
  DebtReportsDto,
  GetDebtReportsRequest,
} from '../../../shared/debt-contracts';
import { REPORTING_HISTORY_START_DATE } from '../../../shared/reporting-constants';
import { formatDollarString } from './display-format';

export interface AdvancedReportsProps {
  readonly reports: DebtReportsDto | null;
  readonly loading: boolean;
  readonly onApplyFilters: (request: GetDebtReportsRequest) => void;
  readonly onSelectDebt: (id: string) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const defaultStart = (): string => `${today().slice(0, 4)}-01-01`;
const clampReportingStartDate = (value: string): string =>
  value < REPORTING_HISTORY_START_DATE ? REPORTING_HISTORY_START_DATE : value;

type DatePreset =
  | 'current_year'
  | 'prior_year'
  | 'current_month'
  | 'prior_month'
  | 'year_to_date'
  | 'last_12_months'
  | 'all_activity'
  | 'custom';

const isoFromDate = (date: Date): string => date.toISOString().slice(0, 10);
const monthStart = (date: Date): string =>
  isoFromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
const monthEnd = (date: Date): string =>
  isoFromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));

const dateRangeForPreset = (
  preset: DatePreset,
): { readonly startDate: string; readonly endDate: string } | null => {
  const now = new Date(`${today()}T00:00:00.000Z`);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  switch (preset) {
    case 'current_year':
    case 'year_to_date':
      return { startDate: `${year}-01-01`, endDate: today() };
    case 'prior_year':
      return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
    case 'current_month':
      return { startDate: monthStart(now), endDate: today() };
    case 'prior_month': {
      const prior = new Date(Date.UTC(year, month - 1, 1));
      return { startDate: monthStart(prior), endDate: monthEnd(prior) };
    }
    case 'last_12_months': {
      const start = new Date(Date.UTC(year, month - 11, 1));
      return { startDate: monthStart(start), endDate: today() };
    }
    case 'all_activity':
      return { startDate: REPORTING_HISTORY_START_DATE, endDate: today() };
    case 'custom':
      return null;
  }
};

const BasisNote = ({
  basis,
}: {
  readonly basis: DebtReportsDto['monthlyRollforward']['basis'];
}): React.JSX.Element => (
  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
    <p>
      <span className="font-semibold">Date range:</span> {basis.dateRange}.{' '}
      <span className="font-semibold">Effective date:</span> {basis.effectiveDate}.
    </p>
    <p>
      <span className="font-semibold">Balance basis:</span> {basis.balanceBasis}
    </p>
    {basis.assumptions.length > 0 ? (
      <ul className="mt-1 list-disc pl-5">
        {basis.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
    ) : null}
    {basis.warnings.length > 0 ? (
      <ul className="mt-1 list-disc pl-5 text-amber-800">
        {basis.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    ) : null}
  </div>
);

const MoneyCell = ({ value }: { readonly value: string }): React.JSX.Element => (
  <td className="px-3 py-2 text-right font-mono tabular-nums">
    {formatDollarString(value)}
  </td>
);

const EmptyState = (): React.JSX.Element => (
  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
    No rows match the current report filters.
  </p>
);

const periodLabel = (period: string): string => {
  if (/^\d{4}$/.test(period)) return period;
  const [year, month] = period.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString(
    undefined,
    { month: 'short', year: 'numeric', timeZone: 'UTC' },
  );
};

const BalanceTrendChart = ({
  chartType,
  rows,
}: {
  readonly chartType: 'bar' | 'line';
  readonly rows: DebtReportsDto['balanceTrends']['rows'];
}): React.JSX.Element | null => {
  if (rows.length === 0) return null;
  const values = rows.map((row) => Number(row.endingBalance));
  const maximum = Math.max(...values, 1);
  const width = 720;
  const height = 220;
  const chartTop = 20;
  const chartBottom = 170;
  const chartHeight = chartBottom - chartTop;
  const xFor = (index: number): number =>
    rows.length === 1 ? 72 : 72 + (index * (width - 120)) / (rows.length - 1);
  const yFor = (value: string): number =>
    chartBottom - (Number(value) / maximum) * chartHeight;
  const points = rows
    .map((row, index) => `${xFor(index)},${yFor(row.endingBalance)}`)
    .join(' ');

  const barWidth = Math.max(10, Math.min(28, (width - 140) / rows.length / 2));

  return (
    <div
      className="mt-4 rounded-lg border border-slate-200 bg-white p-4"
      role="img"
      aria-label={`${chartType === 'line' ? 'Line' : 'Bar'} chart of ending principal balance from ${periodLabel(rows.at(0)?.period ?? '')} through ${periodLabel(rows.at(-1)?.period ?? '')}. Tabular detail follows.`}
    >
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-700">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 bg-blue-700" aria-hidden="true" />
          Ending principal balance
        </span>
      </div>
      <svg
        aria-hidden="true"
        className="h-auto w-full"
        focusable="false"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <title>Application-calculated ending principal balance by period.</title>
        <desc>
          X axis is period end. Y axis is dollars. Tooltips identify period-end date,
          balance, and change from prior period.
        </desc>
        <line
          stroke="#cbd5e1"
          strokeWidth="1"
          x1="72"
          x2={width - 24}
          y1={chartBottom}
          y2={chartBottom}
        />
        <line
          stroke="#cbd5e1"
          strokeWidth="1"
          x1="72"
          x2="72"
          y1={chartTop}
          y2={chartBottom}
        />
        <text fill="#475569" fontSize="11" x="4" y="16">
          Dollars
        </text>
        <text fill="#475569" fontSize="11" x={width - 70} y={height - 8}>
          Period
        </text>
        <text fill="#475569" fontSize="11" x="4" y={chartTop + 4}>
          {formatDollarString(maximum.toFixed(2))}
        </text>
        {chartType === 'line' ? (
          <>
            <polyline fill="none" points={points} stroke="#1d4ed8" strokeWidth="3" />
            {rows.map((row, index) => (
              <g key={row.period}>
                <title>{`${row.periodEndDate}: ${formatDollarString(row.endingBalance)} ending principal balance; change ${row.changeFromPriorPeriod ? formatDollarString(row.changeFromPriorPeriod) : 'not applicable'}.`}</title>
                <circle
                  cx={xFor(index)}
                  cy={yFor(row.endingBalance)}
                  fill="#1d4ed8"
                  r="3"
                />
                <text
                  fill="#475569"
                  fontSize="10"
                  textAnchor="middle"
                  x={xFor(index)}
                  y={chartBottom + 16}
                >
                  {periodLabel(row.period)}
                </text>
              </g>
            ))}
          </>
        ) : (
          <>
            {rows.map((row, index) => {
              const x = xFor(index);
              const y = yFor(row.endingBalance);

              return (
                <g key={row.period}>
                  <title>{`${row.periodEndDate}: ${formatDollarString(row.endingBalance)} ending principal balance; change ${row.changeFromPriorPeriod ? formatDollarString(row.changeFromPriorPeriod) : 'not applicable'}.`}</title>
                  <rect
                    fill="#1d4ed8"
                    height={chartBottom - y}
                    width={barWidth}
                    x={x - barWidth / 2}
                    y={y}
                  />
                  <text
                    fill="#475569"
                    fontSize="10"
                    textAnchor="middle"
                    x={x}
                    y={chartBottom + 16}
                  >
                    {periodLabel(row.period)}
                  </text>
                </g>
              );
            })}
          </>
        )}
      </svg>
      <p className="mt-2 text-xs text-slate-500">
        Ending balance is application-calculated principal at period end. The table
        below provides exact values and period-over-period changes.
      </p>
    </div>
  );
};

const InterestMiniChart = ({
  chartType,
  label,
  rows,
}: {
  readonly chartType: 'bar' | 'line';
  readonly label: string;
  readonly rows: readonly { readonly label: string; readonly value: string }[];
}): React.JSX.Element | null => {
  if (rows.length === 0) return null;
  const width = 520;
  const height = 180;
  const chartTop = 20;
  const chartBottom = 132;
  const maximum = Math.max(...rows.map((row) => Number(row.value)), 1);
  const xFor = (index: number): number =>
    rows.length === 1 ? 64 : 64 + (index * (width - 108)) / (rows.length - 1);
  const yFor = (value: string): number =>
    chartBottom - (Number(value) / maximum) * (chartBottom - chartTop);
  const points = rows
    .map((row, index) => `${xFor(index)},${yFor(row.value)}`)
    .join(' ');
  const barWidth = Math.max(10, Math.min(26, (width - 120) / rows.length / 2));

  return (
    <div className="mt-3" role="img" aria-label={`${label}. Tabular detail follows.`}>
      <svg
        aria-hidden="true"
        className="h-auto w-full"
        focusable="false"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <title>{label}</title>
        <line
          stroke="#cbd5e1"
          strokeWidth="1"
          x1="64"
          x2={width - 20}
          y1={chartBottom}
          y2={chartBottom}
        />
        <line
          stroke="#cbd5e1"
          strokeWidth="1"
          x1="64"
          x2="64"
          y1={chartTop}
          y2={chartBottom}
        />
        <text fill="#475569" fontSize="11" x="4" y="16">
          Dollars
        </text>
        <text fill="#475569" fontSize="11" x="4" y={chartTop + 4}>
          {formatDollarString(maximum.toFixed(2))}
        </text>
        {chartType === 'line' ? (
          <polyline fill="none" points={points} stroke="#b45309" strokeWidth="3" />
        ) : null}
        {rows.map((row, index) => {
          const x = xFor(index);
          const y = yFor(row.value);
          return (
            <g key={row.label}>
              <title>{`${row.label}: ${formatDollarString(row.value)} interest expense.`}</title>
              {chartType === 'bar' ? (
                <rect
                  fill="#fef3c7"
                  height={chartBottom - y}
                  stroke="#b45309"
                  width={barWidth}
                  x={x - barWidth / 2}
                  y={y}
                />
              ) : (
                <circle
                  cx={x}
                  cy={y}
                  fill="#fff7ed"
                  r="3"
                  stroke="#b45309"
                  strokeWidth="2"
                />
              )}
              <text fill="#475569" fontSize="10" textAnchor="middle" x={x} y="152">
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const monthName = (monthIndex: number): string =>
  new Date(Date.UTC(2026, monthIndex, 1)).toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });

type ActivityTrendRow = DebtReportsDto['activityTrends']['rows'][number];

const interestRowsWithActivity = (
  rows: DebtReportsDto['activityTrends']['rows'],
): readonly ActivityTrendRow[] =>
  rows.filter((row) => Number(row.interestActivity) !== 0);

const recentInterestRows = (
  rows: DebtReportsDto['activityTrends']['rows'],
): readonly ActivityTrendRow[] => {
  const activeRows = interestRowsWithActivity(rows);
  return activeRows.slice(Math.max(0, activeRows.length - 24));
};

const InterestComparisonChart = ({
  rows,
}: {
  readonly rows: readonly ActivityTrendRow[];
}): React.JSX.Element | null => {
  if (rows.length === 0) return null;
  const width = 720;
  const height = 240;
  const chartTop = 20;
  const chartBottom = 180;
  const years = [...new Set(rows.map((row) => row.period.slice(0, 4)))].sort();
  const valuesByYearMonth = new Map(
    rows.map((row) => [
      `${row.period.slice(0, 4)}-${row.period.slice(5, 7)}`,
      Number(row.interestActivity),
    ]),
  );
  const maximum = Math.max(...[...valuesByYearMonth.values()], 1);
  const monthSlot = (width - 96) / 12;
  const barWidth = Math.max(4, Math.min(12, monthSlot / Math.max(years.length, 1) - 2));
  const yFor = (value: number): number =>
    chartBottom - (value / maximum) * (chartBottom - chartTop);

  return (
    <div
      className="mt-3 rounded-lg border border-slate-200 bg-white p-4"
      role="img"
      aria-label="Grouped bar chart comparing monthly interest expense across years. Tabular detail follows."
    >
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-700">
        {years.map((year, index) => (
          <span className="inline-flex items-center gap-1" key={year}>
            <span
              className="inline-block h-3 w-3 border border-slate-700"
              style={{ backgroundColor: index % 2 === 0 ? '#fef3c7' : '#fed7aa' }}
            />
            {year}
          </span>
        ))}
      </div>
      <svg
        aria-hidden="true"
        className="h-auto w-full"
        focusable="false"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <line
          stroke="#cbd5e1"
          x1="64"
          x2={width - 16}
          y1={chartBottom}
          y2={chartBottom}
        />
        <line stroke="#cbd5e1" x1="64" x2="64" y1={chartTop} y2={chartBottom} />
        <text fill="#475569" fontSize="11" x="4" y="16">
          Dollars
        </text>
        <text fill="#475569" fontSize="11" x="4" y={chartTop + 4}>
          {formatDollarString(maximum.toFixed(2))}
        </text>
        {Array.from({ length: 12 }).map((_, monthIndex) => {
          const month = `${monthIndex + 1}`.padStart(2, '0');
          const baseX = 64 + monthIndex * monthSlot + monthSlot / 2;
          return (
            <g key={month}>
              {years.map((year, yearIndex) => {
                const value = valuesByYearMonth.get(`${year}-${month}`) ?? 0;
                const y = yFor(value);
                const x =
                  baseX - (years.length * barWidth) / 2 + yearIndex * (barWidth + 2);
                return (
                  <g key={year}>
                    <title>{`${monthName(monthIndex)} ${year}: ${formatDollarString(value.toFixed(2))} interest expense.`}</title>
                    <rect
                      fill={yearIndex % 2 === 0 ? '#fef3c7' : '#fed7aa'}
                      height={chartBottom - y}
                      stroke="#b45309"
                      strokeDasharray={yearIndex % 2 === 0 ? undefined : '3 2'}
                      width={barWidth}
                      x={x}
                      y={y}
                    />
                  </g>
                );
              })}
              <text fill="#475569" fontSize="10" textAnchor="middle" x={baseX} y="204">
                {monthName(monthIndex)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const AdvancedReports = ({
  reports,
  loading,
  onApplyFilters,
  onSelectDebt,
}: AdvancedReportsProps): React.JSX.Element => {
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(today());
  const [datePreset, setDatePreset] = useState<DatePreset>('current_year');
  const [debtType, setDebtType] = useState('');
  const [status, setStatus] = useState('');
  const [balanceChartType, setBalanceChartType] = useState<'bar' | 'line'>('line');

  const apply = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const requestedStartDate = clampReportingStartDate(startDate);
    if (requestedStartDate !== startDate) setStartDate(requestedStartDate);
    onApplyFilters({
      startDate: requestedStartDate,
      endDate,
      debtId: null,
      ownerEntity: null,
      debtType:
        debtType === '' ? null : (debtType as GetDebtReportsRequest['debtType']),
      status: status === '' ? null : (status as GetDebtReportsRequest['status']),
    });
  };

  return (
    <section aria-labelledby="advanced-reports-heading" className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <p className="text-sm font-medium text-slate-500">Advanced reports</p>
        <h2
          className="mt-1 text-3xl font-semibold tracking-tight"
          id="advanced-reports-heading"
        >
          Debt reporting
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Reports are read-only. Each section states its date range, effective date,
          balance basis, and assumptions. Calculated ledger balances, confirmed
          snapshots, and saved scenario results remain explicitly labeled.
        </p>
      </div>

      <form
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-5"
        onSubmit={apply}
      >
        <label className="text-sm font-medium text-slate-700">
          Date preset
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) => {
              const preset = event.target.value as DatePreset;
              setDatePreset(preset);
              const range = dateRangeForPreset(preset);
              if (range) {
                setStartDate(range.startDate);
                setEndDate(range.endDate);
              }
            }}
            value={datePreset}
          >
            <option value="current_year">Current year</option>
            <option value="prior_year">Prior year</option>
            <option value="current_month">Current month</option>
            <option value="prior_month">Prior month</option>
            <option value="year_to_date">Year to date</option>
            <option value="last_12_months">Last 12 months</option>
            <option value="all_activity">All activity</option>
            <option value="custom">Custom date range</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Start date
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) => {
              setDatePreset('custom');
              setStartDate(clampReportingStartDate(event.target.value));
            }}
            min={REPORTING_HISTORY_START_DATE}
            type="date"
            value={startDate}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          End date
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) => {
              setDatePreset('custom');
              setEndDate(event.target.value);
            }}
            type="date"
            value={endDate}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Debt type
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) => setDebtType(event.target.value)}
            value={debtType}
          >
            <option value="">All</option>
            <option value="mortgage">Mortgage</option>
            <option value="heloc">HELOC</option>
            <option value="auto">Auto</option>
            <option value="personal">Personal</option>
            <option value="business">Business</option>
            <option value="credit_card">Credit card</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Status
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="paid_off">Paid off</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <div className="md:col-span-5">
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            type="submit"
          >
            Apply filters
          </button>
        </div>
      </form>

      {loading ? (
        <section className="rounded-xl border border-slate-200 bg-white p-10">
          <p className="text-sm font-medium text-slate-600">Loading reports…</p>
        </section>
      ) : null}

      {!loading && reports ? (
        <div className="space-y-6">
          <ReportRollforward
            title="Monthly debt rollforward"
            section={reports.monthlyRollforward}
          />
          <ReportRollforward
            title="Annual debt rollforward"
            section={reports.annualRollforward}
          />
          <ReportBalanceHistory reports={reports} onSelectDebt={onSelectDebt} />
          <ReportBalanceTrends
            chartType={balanceChartType}
            onChartTypeChange={setBalanceChartType}
            reports={reports}
          />
          <ReportInterestAnalysis reports={reports} />
          <ReportSchedule reports={reports} onSelectDebt={onSelectDebt} />
          <ReportSensitivity
            title="Interest-rate sensitivity"
            section={reports.interestRateSensitivity}
          />
          <ReportSensitivity
            title="Extra-payment sensitivity"
            section={reports.extraPaymentSensitivity}
          />
          <ReportVariance reports={reports} onSelectDebt={onSelectDebt} />
          <ReportExceptions reports={reports} onSelectDebt={onSelectDebt} />
        </div>
      ) : null}
    </section>
  );
};

const ReportShell = ({
  basis,
  basisMode = 'expanded',
  children,
  title,
}: {
  readonly basis: DebtReportsDto['monthlyRollforward']['basis'];
  readonly basisMode?: 'expanded' | 'compact';
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element => (
  <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <summary className="cursor-pointer text-lg font-semibold">{title}</summary>
    {basisMode === 'expanded' ? (
      <BasisNote basis={basis} />
    ) : (
      <details className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold">
          Basis and assumptions
        </summary>
        <BasisNote basis={basis} />
      </details>
    )}
    <div className="mt-4">{children}</div>
  </details>
);

const ReportRollforward = ({
  section,
  title,
}: {
  readonly section: DebtReportsDto['monthlyRollforward'];
  readonly title: string;
}): React.JSX.Element => (
  <ReportShell basis={section.basis} title={title}>
    {section.rows.length === 0 ? <EmptyState /> : null}
    {section.rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2 text-right">Beginning</th>
              <th className="px-3 py-2 text-right">Borrowings</th>
              <th className="px-3 py-2 text-right">Cash payments</th>
              <th className="px-3 py-2 text-right">Principal reduction</th>
              <th className="px-3 py-2 text-right">Interest</th>
              <th className="px-3 py-2 text-right">Principal adjustments</th>
              <th className="px-3 py-2 text-right">Ending</th>
              <th className="px-3 py-2 text-right">Check</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr className="border-t border-slate-100" key={row.period}>
                <td className="px-3 py-2">{row.period}</td>
                <MoneyCell value={row.beginningBalance} />
                <MoneyCell value={row.borrowings} />
                <MoneyCell value={row.payments} />
                <MoneyCell value={row.principalReduction} />
                <MoneyCell value={row.interestActivity} />
                <MoneyCell value={row.adjustmentsAndOther} />
                <MoneyCell value={row.endingBalance} />
                <MoneyCell value={row.rollforwardCheck} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </ReportShell>
);

const DebtButton = ({
  id,
  name,
  onSelectDebt,
}: {
  readonly id: string;
  readonly name: string;
  readonly onSelectDebt: (id: string) => void;
}): React.JSX.Element => (
  <button
    className="font-semibold text-slate-900 underline"
    onClick={() => onSelectDebt(id)}
    type="button"
  >
    {name}
  </button>
);

const ReportBalanceHistory = ({
  reports,
  onSelectDebt,
}: {
  readonly reports: DebtReportsDto;
  readonly onSelectDebt: (id: string) => void;
}): React.JSX.Element => (
  <ReportShell
    basis={reports.balanceHistory.basis}
    title="Debt balance history by obligation"
  >
    {reports.balanceHistory.rows.length === 0 ? <EmptyState /> : null}
    {reports.balanceHistory.rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Debt</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Calculated balance</th>
              <th className="px-3 py-2 text-right">Confirmed balance</th>
              <th className="px-3 py-2">Basis</th>
            </tr>
          </thead>
          <tbody>
            {reports.balanceHistory.rows.map((row) => (
              <tr
                className="border-t border-slate-100"
                key={`${row.debtId}-${row.effectiveDate}`}
              >
                <td className="px-3 py-2">
                  <DebtButton
                    id={row.debtId}
                    name={row.debtName}
                    onSelectDebt={onSelectDebt}
                  />
                </td>
                <td className="px-3 py-2">{row.effectiveDate}</td>
                <MoneyCell value={row.calculatedBalance} />
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {row.confirmedBalance
                    ? formatDollarString(row.confirmedBalance)
                    : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{row.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </ReportShell>
);

const ReportBalanceTrends = ({
  chartType,
  onChartTypeChange,
  reports,
}: {
  readonly chartType: 'bar' | 'line';
  readonly onChartTypeChange: (chartType: 'bar' | 'line') => void;
  readonly reports: DebtReportsDto;
}): React.JSX.Element => (
  <ReportShell basis={reports.balanceTrends.basis} title="Debt balance trend">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">
          Ending principal balance trend
        </h4>
        <p className="mt-1 text-xs text-slate-600">
          Total debt is shown by default using month-end or year-end
          application-calculated principal balances.
        </p>
      </div>
      <fieldset className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
        <legend className="px-1 text-xs font-semibold text-slate-600">
          Chart type
        </legend>
        <label className="inline-flex items-center gap-2">
          <input
            checked={chartType === 'bar'}
            name="balance-trend-chart-type"
            onChange={() => onChartTypeChange('bar')}
            type="radio"
            value="bar"
          />
          Bar chart
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            checked={chartType === 'line'}
            name="balance-trend-chart-type"
            onChange={() => onChartTypeChange('line')}
            type="radio"
            value="line"
          />
          Line chart
        </label>
      </fieldset>
    </div>
    <BalanceTrendChart chartType={chartType} rows={reports.balanceTrends.rows} />
    {reports.balanceTrends.rows.length === 0 ? <EmptyState /> : null}
    {reports.balanceTrends.rows.length > 0 ? (
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Period end</th>
              <th className="px-3 py-2">Grouping</th>
              <th className="px-3 py-2 text-right">Ending balance</th>
              <th className="px-3 py-2 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {reports.balanceTrends.rows.map((row) => (
              <tr className="border-t border-slate-100" key={row.period}>
                <td className="px-3 py-2">{periodLabel(row.period)}</td>
                <td className="px-3 py-2">{row.periodEndDate}</td>
                <td className="px-3 py-2">{row.grouping}</td>
                <MoneyCell value={row.endingBalance} />
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {row.changeFromPriorPeriod
                    ? formatDollarString(row.changeFromPriorPeriod)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </ReportShell>
);

const ReportInterestAnalysis = ({
  reports,
}: {
  readonly reports: DebtReportsDto;
}): React.JSX.Element => {
  const [interestView, setInterestView] = useState<'trend' | 'comparison'>('trend');
  const annualTotals = new Map<string, number>();
  for (const row of reports.activityTrends.rows) {
    const year = row.period.slice(0, 4);
    annualTotals.set(
      year,
      (annualTotals.get(year) ?? 0) + Number(row.interestActivity),
    );
  }
  const monthlyRows = recentInterestRows(reports.activityTrends.rows);
  const comparisonRows = interestRowsWithActivity(reports.activityTrends.rows);
  const annualRows = [...annualTotals.entries()]
    .filter(([, total]) => total !== 0)
    .map(([year, total], index, rows) => {
      const prior = index === 0 ? null : (rows[index - 1]?.[1] ?? null);
      const change = prior === null ? null : total - prior;
      const percentChange =
        prior === null || prior === 0 || change === null
          ? null
          : (change / prior) * 100;
      return { year, total, change, percentChange };
    });
  const omittedZeroYears = [...annualTotals.entries()]
    .filter(([, total]) => total === 0)
    .map(([year]) => year);

  return (
    <ReportShell
      basis={reports.activityTrends.basis}
      basisMode="compact"
      title="Interest expense analysis"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-slate-600">
          Interest expense is shown as positive activity and excludes zero-only periods
          from charts when they add no analytical value.
        </p>
        <fieldset className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <legend className="px-1 text-xs font-semibold text-slate-600">
            Monthly view
          </legend>
          <label className="inline-flex items-center gap-2">
            <input
              checked={interestView === 'trend'}
              name="interest-view"
              onChange={() => setInterestView('trend')}
              type="radio"
              value="trend"
            />
            Chronological trend
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              checked={interestView === 'comparison'}
              name="interest-view"
              onChange={() => setInterestView('comparison')}
              type="radio"
              value="comparison"
            />
            Compare months across years
          </label>
        </fieldset>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">
            {interestView === 'trend'
              ? 'Monthly interest expense trend'
              : 'Month-by-month comparison across years'}
          </h4>
          {interestView === 'trend' ? (
            monthlyRows.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                No interest activity exists in the selected report range.
              </p>
            ) : (
              <InterestMiniChart
                chartType="line"
                label="Line chart of monthly interest expense"
                rows={monthlyRows.map((row) => ({
                  label: periodLabel(row.period),
                  value: row.interestActivity,
                }))}
              />
            )
          ) : comparisonRows.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              No interest activity exists for month-by-month comparison.
            </p>
          ) : (
            <InterestComparisonChart rows={comparisonRows} />
          )}
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">
            Annual interest expense comparison
          </h4>
          {annualRows.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              No annual interest activity exists in the selected report range.
            </p>
          ) : (
            <InterestMiniChart
              chartType="bar"
              label="Bar chart of annual interest expense"
              rows={annualRows.map((row) => ({
                label: row.year,
                value: row.total.toFixed(2),
              }))}
            />
          )}
          {omittedZeroYears.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              Omitted zero-interest years: {omittedZeroYears.join(', ')}.
            </p>
          ) : null}
        </div>
      </div>
      {reports.activityTrends.rows.length === 0 ? <EmptyState /> : null}
      {reports.activityTrends.rows.length > 0 ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Interest expense</th>
                  <th className="px-3 py-2 text-right">Principal reduction</th>
                  <th className="px-3 py-2 text-right">Borrowings</th>
                  <th className="px-3 py-2 text-right">Cash payments</th>
                </tr>
              </thead>
              <tbody>
                {reports.activityTrends.rows.map((row) => (
                  <tr className="border-t border-slate-100" key={row.period}>
                    <td className="px-3 py-2">{periodLabel(row.period)}</td>
                    <MoneyCell value={row.interestActivity} />
                    <MoneyCell value={row.principalReduction} />
                    <MoneyCell value={row.borrowings} />
                    <MoneyCell value={row.payments} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Year</th>
                  <th className="px-3 py-2 text-right">Interest expense</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-3 py-2 text-right">% change</th>
                </tr>
              </thead>
              <tbody>
                {annualRows.map((row) => (
                  <tr className="border-t border-slate-100" key={row.year}>
                    <td className="px-3 py-2">{row.year}</td>
                    <MoneyCell value={row.total.toFixed(2)} />
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {row.change === null
                        ? '—'
                        : formatDollarString(row.change.toFixed(2))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {row.percentChange === null
                        ? '—'
                        : `${row.percentChange.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </ReportShell>
  );
};

const ReportSchedule = ({
  reports,
  onSelectDebt,
}: {
  readonly reports: DebtReportsDto;
  readonly onSelectDebt: (id: string) => void;
}): React.JSX.Element => (
  <ReportShell
    basis={reports.maturitySchedule.basis}
    title="Maturity and required-payment schedule"
  >
    {reports.maturitySchedule.rows.length === 0 ? <EmptyState /> : null}
    {reports.maturitySchedule.rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Debt</th>
              <th className="px-3 py-2">Maturity</th>
              <th className="px-3 py-2 text-right">Monthly payment</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {reports.maturitySchedule.rows.map((row) => (
              <tr className="border-t border-slate-100" key={row.debtId}>
                <td className="px-3 py-2">
                  <DebtButton
                    id={row.debtId}
                    name={row.debtName}
                    onSelectDebt={onSelectDebt}
                  />
                </td>
                <td className="px-3 py-2">{row.maturityDate ?? 'No maturity'}</td>
                <MoneyCell value={row.requiredMonthlyPayment} />
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {row.currentInterestRate}%
                </td>
                <MoneyCell value={row.calculatedBalance} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </ReportShell>
);

const ReportSensitivity = ({
  section,
  title,
}: {
  readonly section: DebtReportsDto['interestRateSensitivity'];
  readonly title: string;
}): React.JSX.Element => (
  <ReportShell basis={section.basis} title={title}>
    {section.rows.length === 0 ? (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
        This report is unavailable for the current data. Reliable sensitivity output
        requires supported payoff inputs; rate sensitivity also requires at least one
        variable-rate debt.
      </p>
    ) : null}
    {section.rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Case</th>
              <th className="px-3 py-2">Baseline / change</th>
              <th className="px-3 py-2">Payoff date</th>
              <th className="px-3 py-2 text-right">Timing change</th>
              <th className="px-3 py-2 text-right">Interest</th>
              <th className="px-3 py-2 text-right">Interest change</th>
              <th className="px-3 py-2 text-right">Interest saved</th>
              <th className="px-3 py-2 text-right">Monthly cash</th>
              <th className="px-3 py-2">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr className="border-t border-slate-100" key={row.scenarioLabel}>
                <td className="px-3 py-2">
                  <p className="font-semibold">{row.scenarioLabel}</p>
                  <p className="text-xs text-slate-500">{row.assumption}</p>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {row.baselineRate ? `Baseline rate ${row.baselineRate}%` : '—'}
                  {row.rateChange ? (
                    <span className="block">Scenario change {row.rateChange}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {row.projectedPayoffDate ?? 'Not reliable'}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {row.payoffTimingChangeMonths === null
                    ? '—'
                    : `${row.payoffTimingChangeMonths} mo.`}
                </td>
                <MoneyCell value={row.totalProjectedInterest} />
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {row.changeFromBaselineInterest
                    ? formatDollarString(row.changeFromBaselineInterest)
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {row.interestSaved ? formatDollarString(row.interestSaved) : '—'}
                </td>
                <MoneyCell value={row.monthlyCashRequirement} />
                <td className="px-3 py-2 text-xs text-amber-800">
                  {row.warnings.join(' ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </ReportShell>
);

const ReportVariance = ({
  reports,
  onSelectDebt,
}: {
  readonly reports: DebtReportsDto;
  readonly onSelectDebt: (id: string) => void;
}): React.JSX.Element => {
  const rows = reports.actualVersusPlanVariance.rows;
  const unavailable =
    rows.length === 0 || rows.every((row) => row.plannedPrincipalReduction === null);

  return (
    <ReportShell
      basis={reports.actualVersusPlanVariance.basis}
      title="Actual-versus-plan variance using saved payoff scenarios"
    >
      {unavailable ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          Actual-versus-plan variance is unavailable because saved payoff scenarios do
          not currently persist period-level planned balances and principal reductions.
          A future scenario engine enhancement must store period-level baselines before
          this report can present reliable planned ending balances or dollar and
          percentage variances.
        </p>
      ) : null}
      {!unavailable ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Scenario</th>
                <th className="px-3 py-2">Debt</th>
                <th className="px-3 py-2 text-right">Actual reduction</th>
                <th className="px-3 py-2 text-right">Planned reduction</th>
                <th className="px-3 py-2 text-right">Variance</th>
                <th className="px-3 py-2">Basis / warnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className="border-t border-slate-100"
                  key={`${row.scenarioId}-${row.debtId}`}
                >
                  <td className="px-3 py-2">{row.scenarioName}</td>
                  <td className="px-3 py-2">
                    <DebtButton
                      id={row.debtId}
                      name={row.debtName}
                      onSelectDebt={onSelectDebt}
                    />
                  </td>
                  <MoneyCell value={row.actualPrincipalReduction} />
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.plannedPrincipalReduction
                      ? formatDollarString(row.plannedPrincipalReduction)
                      : 'Limited'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {row.variance ? formatDollarString(row.variance) : 'Limited'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {row.basis} {row.warnings.join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ReportShell>
  );
};

const ReportExceptions = ({
  reports,
  onSelectDebt,
}: {
  readonly reports: DebtReportsDto;
  readonly onSelectDebt: (id: string) => void;
}): React.JSX.Element => (
  <ReportShell
    basis={reports.reconciliationAndDataQuality.basis}
    title="Reconciliation and data-quality exceptions"
  >
    {reports.reconciliationAndDataQuality.rows.length === 0 ? <EmptyState /> : null}
    {reports.reconciliationAndDataQuality.rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Debt</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {reports.reconciliationAndDataQuality.rows.map((row) => (
              <tr
                className="border-t border-slate-100"
                key={`${row.sourceId}-${row.category}`}
              >
                <td className="px-3 py-2 capitalize">{row.severity}</td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2">
                  {row.debtId && row.debtName ? (
                    <DebtButton
                      id={row.debtId}
                      name={row.debtName}
                      onSelectDebt={onSelectDebt}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">{row.effectiveDate ?? '—'}</td>
                <td className="px-3 py-2">{row.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </ReportShell>
);
