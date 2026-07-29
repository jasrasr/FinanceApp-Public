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

const TrendChart = ({
  chartType,
  rows,
}: {
  readonly chartType: 'bar' | 'line';
  readonly rows: DebtReportsDto['activityTrends']['rows'];
}): React.JSX.Element | null => {
  if (rows.length === 0) return null;
  const values = rows.flatMap((row) => [
    Number(row.principalReduction),
    Number(row.interestActivity),
  ]);
  const maximum = Math.max(...values, 1);
  const width = Math.max(360, rows.length * 72);
  const height = 220;
  const chartTop = 20;
  const chartBottom = 170;
  const chartHeight = chartBottom - chartTop;
  const xFor = (index: number): number =>
    rows.length === 1 ? 48 : 48 + (index * (width - 96)) / (rows.length - 1);
  const yFor = (value: string): number =>
    chartBottom - (Number(value) / maximum) * chartHeight;
  const principalPoints = rows
    .map((row, index) => `${xFor(index)},${yFor(row.principalReduction)}`)
    .join(' ');
  const interestPoints = rows
    .map((row, index) => `${xFor(index)},${yFor(row.interestActivity)}`)
    .join(' ');

  const barWidth = Math.max(8, Math.min(22, (width - 120) / rows.length / 3));

  return (
    <div
      className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white p-4"
      role="img"
      aria-label={`${chartType === 'line' ? 'Line' : 'Bar'} chart of principal reduction and interest expense by period from ${rows.at(0)?.period} through ${rows.at(-1)?.period}. Tabular detail follows.`}
    >
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-700">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 bg-blue-700" aria-hidden="true" />
          Principal reduction
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-0.5 w-5 border-t-2 border-dashed border-amber-700"
            aria-hidden="true"
          />
          Interest expense
        </span>
      </div>
      <svg
        className="min-w-full"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <title>
          Principal and interest activity by period, displayed as positive user-facing
          activity amounts.
        </title>
        <desc>
          X axis is report period. Y axis is dollars. Principal reduction and interest
          expense are separate series.
        </desc>
        <line
          stroke="#cbd5e1"
          strokeWidth="1"
          x1="48"
          x2={width - 24}
          y1={chartBottom}
          y2={chartBottom}
        />
        <line
          stroke="#cbd5e1"
          strokeWidth="1"
          x1="48"
          x2="48"
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
            <polyline
              fill="none"
              points={principalPoints}
              stroke="#1d4ed8"
              strokeWidth="3"
            />
            <polyline
              fill="none"
              points={interestPoints}
              stroke="#b45309"
              strokeDasharray="6 4"
              strokeWidth="3"
            />
            {rows.map((row, index) => (
              <g key={row.period}>
                <circle
                  cx={xFor(index)}
                  cy={yFor(row.principalReduction)}
                  fill="#1d4ed8"
                  r="3"
                />
                <circle
                  cx={xFor(index)}
                  cy={yFor(row.interestActivity)}
                  fill="#fff7ed"
                  r="3"
                  stroke="#b45309"
                  strokeWidth="2"
                />
                <text
                  fill="#475569"
                  fontSize="10"
                  textAnchor="middle"
                  x={xFor(index)}
                  y={chartBottom + 16}
                >
                  {row.period.slice(-2)}
                </text>
              </g>
            ))}
          </>
        ) : (
          <>
            {rows.map((row, index) => {
              const x = xFor(index);
              const principalY = yFor(row.principalReduction);
              const interestY = yFor(row.interestActivity);

              return (
                <g key={row.period}>
                  <rect
                    fill="#1d4ed8"
                    height={chartBottom - principalY}
                    width={barWidth}
                    x={x - barWidth - 2}
                    y={principalY}
                  />
                  <rect
                    fill="#fef3c7"
                    height={chartBottom - interestY}
                    stroke="#b45309"
                    strokeDasharray="3 2"
                    width={barWidth}
                    x={x + 2}
                    y={interestY}
                  />
                  <text
                    fill="#475569"
                    fontSize="10"
                    textAnchor="middle"
                    x={x}
                    y={chartBottom + 16}
                  >
                    {row.period.slice(-2)}
                  </text>
                </g>
              );
            })}
          </>
        )}
      </svg>
      <p className="mt-2 text-xs text-slate-500">
        Principal reduction and interest expense are displayed as positive activity
        values. The table below provides the accessible detail for each period.
      </p>
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
  const [trendChartType, setTrendChartType] = useState<'bar' | 'line'>('bar');

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
          <ReportTrends
            chartType={trendChartType}
            onChartTypeChange={setTrendChartType}
            reports={reports}
          />
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
  children,
  title,
}: {
  readonly basis: DebtReportsDto['monthlyRollforward']['basis'];
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element => (
  <details className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <summary className="cursor-pointer text-lg font-semibold">{title}</summary>
    <BasisNote basis={basis} />
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
              <th className="px-3 py-2 text-right">Payments</th>
              <th className="px-3 py-2 text-right">Principal reduction</th>
              <th className="px-3 py-2 text-right">Interest</th>
              <th className="px-3 py-2 text-right">Adj./other</th>
              <th className="px-3 py-2 text-right">Ending</th>
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

const ReportTrends = ({
  chartType,
  onChartTypeChange,
  reports,
}: {
  readonly chartType: 'bar' | 'line';
  readonly onChartTypeChange: (chartType: 'bar' | 'line') => void;
  readonly reports: DebtReportsDto;
}): React.JSX.Element => (
  <ReportShell
    basis={reports.activityTrends.basis}
    title="Principal, interest, borrowing, and payment trends"
  >
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">
          Principal and interest trends
        </h4>
        <p className="mt-1 text-xs text-slate-600">
          Uses the active report date range and filters. Amounts are displayed as
          positive activity values.
        </p>
      </div>
      <fieldset className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
        <legend className="px-1 text-xs font-semibold text-slate-600">
          Chart type
        </legend>
        <label className="inline-flex items-center gap-2">
          <input
            checked={chartType === 'bar'}
            name="trend-chart-type"
            onChange={() => onChartTypeChange('bar')}
            type="radio"
            value="bar"
          />
          Bar chart
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            checked={chartType === 'line'}
            name="trend-chart-type"
            onChange={() => onChartTypeChange('line')}
            type="radio"
            value="line"
          />
          Line chart
        </label>
      </fieldset>
    </div>
    <TrendChart chartType={chartType} rows={reports.activityTrends.rows} />
    {reports.activityTrends.rows.length === 0 ? <EmptyState /> : null}
    {reports.activityTrends.rows.length > 0 ? (
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2 text-right">Principal</th>
              <th className="px-3 py-2 text-right">Interest</th>
              <th className="px-3 py-2 text-right">Borrowings</th>
              <th className="px-3 py-2 text-right">Payments</th>
            </tr>
          </thead>
          <tbody>
            {reports.activityTrends.rows.map((row) => (
              <tr className="border-t border-slate-100" key={row.period}>
                <td className="px-3 py-2">{row.period}</td>
                <MoneyCell value={row.principalReduction} />
                <MoneyCell value={row.interestActivity} />
                <MoneyCell value={row.borrowings} />
                <MoneyCell value={row.payments} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null}
  </ReportShell>
);

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
    {section.rows.length === 0 ? <EmptyState /> : null}
    {section.rows.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Case</th>
              <th className="px-3 py-2">Payoff date</th>
              <th className="px-3 py-2 text-right">Interest</th>
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
                <td className="px-3 py-2">
                  {row.projectedPayoffDate ?? 'Not reliable'}
                </td>
                <MoneyCell value={row.totalProjectedInterest} />
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
}): React.JSX.Element => (
  <ReportShell
    basis={reports.actualVersusPlanVariance.basis}
    title="Actual-versus-plan variance using saved payoff scenarios"
  >
    {reports.actualVersusPlanVariance.rows.length === 0 ? <EmptyState /> : null}
    {reports.actualVersusPlanVariance.rows.length > 0 ? (
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
            {reports.actualVersusPlanVariance.rows.map((row) => (
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
