import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DebtSummaryDto,
  DebtReportsDto,
  GetDebtReportsRequest,
} from '../../../shared/debt-contracts';
import { REPORTING_HISTORY_START_DATE } from '../../../shared/reporting-constants';
import {
  buildChartScale,
  debtSeriesColor,
  interestYearTreatment,
} from './chart-helpers';
import { formatDollarString } from './display-format';
import {
  defaultReportSessionState,
  type DatePreset,
  type ReportSessionState,
} from './report-session-state';

export interface AdvancedReportsProps {
  readonly reports: DebtReportsDto | null;
  readonly debts: readonly DebtSummaryDto[];
  readonly loading: boolean;
  readonly onApplyFilters: (request: GetDebtReportsRequest) => void;
  readonly onSelectDebt: (id: string) => void;
  readonly state: ReportSessionState;
  readonly onStateChange: (state: ReportSessionState) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const clampReportingStartDate = (value: string): string =>
  value < REPORTING_HISTORY_START_DATE ? REPORTING_HISTORY_START_DATE : value;

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
  <div
    aria-label={`Report calculation metadata. Effective date ${basis.effectiveDate}. Balance basis ${basis.balanceBasis}. ${basis.assumptions.join(' ')} ${basis.warnings.join(' ')}`}
    className="mt-2 text-xs text-slate-600"
  >
    <span className="font-semibold">Date range:</span> {basis.dateRange}.
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

const monthName = (monthIndex: number): string =>
  new Date(Date.UTC(2026, monthIndex, 1)).toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });

type ActivityTrendRow = DebtReportsDto['activityTrends']['rows'][number];

const interestRowsWithActivity = (
  rows: readonly ActivityTrendRow[],
): readonly ActivityTrendRow[] =>
  rows.filter((row) => Number(row.interestActivity) !== 0);

const hasInterestActivity = (rows: readonly ActivityTrendRow[]): boolean =>
  interestRowsWithActivity(rows).length > 0;

const InterestComparisonChart = ({
  onSelectedYearsChange,
  rows,
  selectedYears,
}: {
  readonly onSelectedYearsChange: (years: readonly string[] | null) => void;
  readonly rows: readonly ActivityTrendRow[];
  readonly selectedYears: readonly string[] | null;
}): React.JSX.Element | null => {
  const activeRows = interestRowsWithActivity(rows);
  if (activeRows.length === 0) return null;
  const width = 720;
  const height = 240;
  const chartTop = 20;
  const chartBottom = 180;
  const chartLeft = 64;
  const chartRight = width - 16;
  const years = [...new Set(activeRows.map((row) => row.period.slice(0, 4)))].sort();
  const visibleYears = (selectedYears ?? years).filter((year) => years.includes(year));
  const valuesByYearMonth = new Map(
    rows.map((row) => [
      `${row.period.slice(0, 4)}-${row.period.slice(5, 7)}`,
      Number(row.interestActivity),
    ]),
  );
  const monthSlot = (chartRight - chartLeft) / 12;
  const groupGap = Math.max(8, Math.min(14, monthSlot * 0.18));
  const availableGroupWidth = monthSlot - groupGap;
  const barGap = years.length > 1 ? 1.5 : 0;
  const barWidth = Math.max(
    3,
    Math.min(
      10,
      (availableGroupWidth - barGap * Math.max(0, years.length - 1)) /
        Math.max(years.length, 1),
    ),
  );
  const groupWidth = years.length * barWidth + Math.max(0, years.length - 1) * barGap;
  const chartHeight = chartBottom - chartTop;
  const scale = buildChartScale({
    values: rows
      .filter((row) => visibleYears.includes(row.period.slice(0, 4)))
      .map((row) => Number(row.interestActivity)),
    chartHeight,
    includeZero: true,
    formatLabel: (value) => formatDollarString(value.toFixed(2)),
  });
  const yFor = (value: number): number =>
    chartBottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) * chartHeight;

  return (
    <div
      className="mt-3 rounded-lg border border-slate-200 bg-white p-4"
      role="img"
      aria-label="Grouped bar chart comparing monthly interest expense across years. Tabular detail follows."
    >
      <div
        aria-label="Monthly interest year controls"
        className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-700"
      >
        <button
          className="rounded-md border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50"
          onClick={() => onSelectedYearsChange([])}
          type="button"
        >
          Select none
        </button>
        <button
          className="rounded-md border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50"
          onClick={() => onSelectedYearsChange(null)}
          type="button"
        >
          Select all
        </button>
        {years.map((year, index) => {
          const treatment = interestYearTreatment(index);
          const visible = visibleYears.includes(year);
          return (
            <button
              aria-pressed={visible}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium ${visible ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-45'}`}
              data-testid={`interest-year-treatment-${year}`}
              key={year}
              onClick={() =>
                onSelectedYearsChange(
                  visible
                    ? visibleYears.filter((candidate) => candidate !== year)
                    : [...visibleYears, year],
                )
              }
              type="button"
            >
              <span
                className="inline-block h-3 w-3"
                style={{ backgroundColor: treatment.fill }}
              />
              {year}
            </button>
          );
        })}
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
          x2={chartRight}
          y1={chartBottom}
          y2={chartBottom}
        />
        <line stroke="#cbd5e1" x1="64" x2="64" y1={chartTop} y2={chartBottom} />
        <text fill="#475569" fontSize="11" x="4" y="16">
          Dollars
        </text>
        {scale.tickValues.map((tick, index) => {
          const y =
            chartBottom -
            ((tick - scale.minimum) / (scale.maximum - scale.minimum)) * chartHeight;
          return (
            <g key={tick}>
              <line stroke="#e2e8f0" x1="64" x2={chartRight} y1={y} y2={y} />
              <text
                data-testid="interest-comparison-y-tick"
                fill="#475569"
                fontSize="10"
                textAnchor="end"
                x="58"
                y={y + 4}
              >
                {scale.formattedLabels[index]}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 12 }).map((_, monthIndex) => {
          const month = `${monthIndex + 1}`.padStart(2, '0');
          const baseX = chartLeft + monthIndex * monthSlot + monthSlot / 2;
          return (
            <g data-testid="interest-month-group" key={month}>
              {years.map((year, yearIndex) => {
                if (!visibleYears.includes(year)) return null;
                const value = valuesByYearMonth.get(`${year}-${month}`) ?? 0;
                const y = yFor(value);
                const x = baseX - groupWidth / 2 + yearIndex * (barWidth + barGap);
                return (
                  <g key={year}>
                    <title data-testid="interest-comparison-tooltip">{`${monthName(monthIndex)} ${year}\n${formatDollarString(Math.abs(value).toFixed(2))}`}</title>
                    <rect
                      data-testid="interest-comparison-bar"
                      fill={interestYearTreatment(yearIndex).fill}
                      height={chartBottom - y}
                      tabIndex={0}
                      width={barWidth}
                      x={x}
                      y={y}
                    />
                  </g>
                );
              })}
              <text
                data-testid="interest-comparison-month-label"
                fill="#475569"
                fontSize="10"
                textAnchor="middle"
                x={baseX}
                y="204"
              >
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
  debts,
  reports,
  loading,
  onApplyFilters,
  onSelectDebt,
  onStateChange,
  state,
}: AdvancedReportsProps): React.JSX.Element => {
  const setState = (patch: Partial<ReportSessionState>): void =>
    onStateChange({ ...state, ...patch });
  const apply = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const requestedStartDate = clampReportingStartDate(state.startDate);
    if (requestedStartDate !== state.startDate)
      setState({ startDate: requestedStartDate });
    onApplyFilters({
      startDate: requestedStartDate,
      endDate: state.endDate,
      debtId: state.debtId,
      ownerEntity: null,
      debtType:
        state.debtType === ''
          ? null
          : (state.debtType as GetDebtReportsRequest['debtType']),
      status:
        state.status === '' ? null : (state.status as GetDebtReportsRequest['status']),
    });
  };

  const resetFilters = (): void => {
    const defaults = defaultReportSessionState();
    onStateChange(defaults);
    onApplyFilters({
      startDate: null,
      endDate: null,
      debtId: null,
      ownerEntity: null,
      debtType: null,
      status: null,
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
              const range = dateRangeForPreset(preset);
              if (range) {
                setState({
                  datePreset: preset,
                  startDate: range.startDate,
                  endDate: range.endDate,
                });
              } else {
                setState({ datePreset: preset });
              }
            }}
            value={state.datePreset}
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
              setState({
                datePreset: 'custom',
                startDate: clampReportingStartDate(event.target.value),
              });
            }}
            min={REPORTING_HISTORY_START_DATE}
            type="date"
            value={state.startDate}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          End date
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) => {
              setState({ datePreset: 'custom', endDate: event.target.value });
            }}
            type="date"
            value={state.endDate}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Debt
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) =>
              setState({
                debtId: event.target.value === '' ? null : event.target.value,
              })
            }
            value={state.debtId ?? ''}
          >
            <option value="">All debts</option>
            {debts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {debt.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Debt type
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            onChange={(event) => setState({ debtType: event.target.value })}
            value={state.debtType}
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
            onChange={(event) => setState({ status: event.target.value })}
            value={state.status}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="paid_off">Paid off</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-5">
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            type="submit"
          >
            Apply filters
          </button>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            onClick={resetFilters}
            type="button"
          >
            Reset filters
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
          <ReportBalanceHistory
            isOpen={state.openSections.includes('balance-history')}
            onOpenChange={(open) =>
              setState({
                openSections: open
                  ? [...new Set([...state.openSections, 'balance-history'])]
                  : state.openSections.filter(
                      (section) => section !== 'balance-history',
                    ),
              })
            }
            reports={reports}
            onSelectDebt={onSelectDebt}
          />
          <ReportInterestAnalysis
            interestVisibleYears={state.interestVisibleYears}
            isOpen={state.openSections.includes('interest-analysis')}
            onInterestVisibleYearsChange={(interestVisibleYears) =>
              setState({ interestVisibleYears })
            }
            onOpenChange={(open) =>
              setState({
                openSections: open
                  ? [...new Set([...state.openSections, 'interest-analysis'])]
                  : state.openSections.filter(
                      (section) => section !== 'interest-analysis',
                    ),
              })
            }
            reports={reports}
          />
          <ReportRollforward
            isOpen={state.openSections.includes('monthly-rollforward')}
            onOpenChange={(open) =>
              setState({
                openSections: open
                  ? [...new Set([...state.openSections, 'monthly-rollforward'])]
                  : state.openSections.filter(
                      (section) => section !== 'monthly-rollforward',
                    ),
              })
            }
            title="Monthly debt rollforward"
            section={reports.monthlyRollforward}
          />
          <ReportRollforward
            isOpen={state.openSections.includes('annual-rollforward')}
            onOpenChange={(open) =>
              setState({
                openSections: open
                  ? [...new Set([...state.openSections, 'annual-rollforward'])]
                  : state.openSections.filter(
                      (section) => section !== 'annual-rollforward',
                    ),
              })
            }
            title="Annual debt rollforward"
            section={reports.annualRollforward}
          />
          <ReportSchedule reports={reports} onSelectDebt={onSelectDebt} />
          <ReportExceptions reports={reports} onSelectDebt={onSelectDebt} />
        </div>
      ) : null}
    </section>
  );
};

const ReportShell = ({
  basis,
  children,
  isOpen,
  onOpenChange,
  title,
}: {
  readonly basis: DebtReportsDto['monthlyRollforward']['basis'];
  readonly children: React.ReactNode;
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title: string;
}): React.JSX.Element => (
  <details
    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
    open={isOpen}
  >
    <summary className="cursor-pointer text-lg font-semibold">{title}</summary>
    <BasisNote basis={basis} />
    <div className="mt-4">{children}</div>
  </details>
);

const ReportRollforward = ({
  isOpen,
  onOpenChange,
  section,
  title,
}: {
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly section: DebtReportsDto['monthlyRollforward'];
  readonly title: string;
}): React.JSX.Element => (
  <ReportShell
    basis={section.basis}
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    title={title}
  >
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

type BalanceHistorySeries = {
  readonly key: string;
  readonly label: string;
  readonly debtId: string | null;
  readonly color: string;
  readonly dash: string;
  readonly marker: 'circle' | 'square' | 'diamond';
  readonly values: readonly {
    readonly periodEndDate: string;
    readonly balance: number;
    readonly changeFromPriorPeriod: number | null;
  }[];
};

const balanceHistoryStyle = (
  index: number,
): { readonly color: string; readonly dash: string } => ({
  color: debtSeriesColor(index),
  dash:
    index < 12 ? '0' : index % 3 === 1 ? '8 4' : index % 3 === 2 ? '2 4' : '12 4 2 4',
});

const balanceHistorySeries = (
  rows: DebtReportsDto['balanceHistory']['rows'],
): readonly BalanceHistorySeries[] => {
  const dates = [...new Set(rows.map((row) => row.effectiveDate))].sort();
  const rowsByDebt = new Map<string, typeof rows>();

  for (const row of rows) {
    rowsByDebt.set(row.debtId, [...(rowsByDebt.get(row.debtId) ?? []), row]);
  }

  const individualSeries = [...rowsByDebt.entries()]
    .map(([debtId, debtRows], index): BalanceHistorySeries => {
      const sortedRows = [...debtRows].sort((a, b) =>
        a.effectiveDate.localeCompare(b.effectiveDate),
      );
      const valuesByDate = new Map(
        sortedRows.map((row) => [row.effectiveDate, Number(row.calculatedBalance)]),
      );
      let prior: number | null = null;
      return {
        key: debtId,
        label: sortedRows[0]?.debtName ?? 'Debt',
        debtId,
        ...balanceHistoryStyle(index),
        marker: index % 3 === 0 ? 'circle' : index % 3 === 1 ? 'square' : 'diamond',
        values: dates.map((date) => {
          const balance = valuesByDate.get(date) ?? 0;
          const change = prior === null ? null : balance - prior;
          prior = balance;
          return { periodEndDate: date, balance, changeFromPriorPeriod: change };
        }),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  let priorTotal: number | null = null;
  const totalSeries: BalanceHistorySeries = {
    key: 'total',
    label: 'Total debt balance',
    debtId: null,
    color: '#0f172a',
    dash: '0',
    marker: 'diamond',
    values: dates.map((date) => {
      const balance = individualSeries.reduce((total, series) => {
        const value = series.values.find((item) => item.periodEndDate === date);
        return total + (value?.balance ?? 0);
      }, 0);
      const change = priorTotal === null ? null : balance - priorTotal;
      priorTotal = balance;
      return { periodEndDate: date, balance, changeFromPriorPeriod: change };
    }),
  };

  return [totalSeries, ...individualSeries];
};

const markerForPoint = ({
  marker,
  x,
  y,
}: {
  readonly marker: BalanceHistorySeries['marker'];
  readonly x: number;
  readonly y: number;
}): React.JSX.Element => {
  if (marker === 'square') {
    return <rect height="7" width="7" x={x - 3.5} y={y - 3.5} />;
  }
  if (marker === 'diamond') {
    return (
      <rect
        height="7"
        transform={`rotate(45 ${x} ${y})`}
        width="7"
        x={x - 3.5}
        y={y - 3.5}
      />
    );
  }
  return <circle cx={x} cy={y} r="3.5" />;
};

const visibleTickIndexes = (periodCount: number): readonly number[] => {
  if (periodCount <= 1) return [0];
  const maxTicks =
    periodCount > 36 ? 7 : periodCount > 18 ? 6 : Math.min(8, periodCount);
  const step = Math.max(1, Math.ceil((periodCount - 1) / (maxTicks - 1)));
  const indexes = new Set<number>([0, periodCount - 1]);
  for (let index = step; index < periodCount - 1; index += step) {
    indexes.add(index);
  }
  return [...indexes].sort((a, b) => a - b);
};

const balanceHistoryTickLabel = (
  period: string,
  visiblePeriodCount: number,
): string => {
  const month = period.slice(0, 7);
  if (visiblePeriodCount > 36) {
    const monthNumber = period.slice(5, 7);
    return monthNumber === '01' ? period.slice(0, 4) : periodLabel(month);
  }
  return periodLabel(month);
};

const BalanceHistoryChart = ({
  onSelectDebt,
  rows,
}: {
  readonly onSelectDebt: (id: string) => void;
  readonly rows: DebtReportsDto['balanceHistory']['rows'];
}): React.JSX.Element => {
  const series = useMemo(() => balanceHistorySeries(rows), [rows]);
  const allKeys = useMemo(() => series.map((item) => item.key), [series]);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    readonly pointerId: number;
    readonly originX: number;
    readonly start: number;
    readonly end: number;
    dragging: boolean;
  } | null>(null);
  const priorBodyUserSelectRef = useRef<string | null>(null);
  const periods = useMemo(
    () => [...new Set(rows.map((row) => row.effectiveDate))].sort(),
    [rows],
  );
  const [visibleKeys, setVisibleKeys] = useState<readonly string[]>(allKeys);
  const [zoom, setZoom] = useState({ start: 0, end: Math.max(0, periods.length - 1) });
  const [isDraggingChart, setIsDraggingChart] = useState(false);

  const visibleSeries = series.filter((item) => visibleKeys.includes(item.key));
  const visiblePeriods = periods.slice(zoom.start, zoom.end + 1);
  const visibleValues = visibleSeries.flatMap((item) =>
    item.values.slice(zoom.start, zoom.end + 1).map((value) => value.balance),
  );
  const width = 820;
  const height = 320;
  const chartLeft = 86;
  const chartRight = width - 28;
  const chartTop = 28;
  const chartBottom = height - 74;
  const chartHeight = chartBottom - chartTop;
  const scale = buildChartScale({
    values: visibleValues,
    chartHeight,
    includeZero: visibleValues.some((value) => value === 0),
    allowExcludeZero: true,
    formatLabel: (value) => formatDollarString(value.toFixed(2)),
  });
  const xFor = (index: number): number =>
    visiblePeriods.length === 1
      ? chartLeft
      : chartLeft + (index * (chartRight - chartLeft)) / (visiblePeriods.length - 1);
  const yFor = (value: number): number =>
    chartBottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) * chartHeight;
  const tickIndexes = visibleTickIndexes(visiblePeriods.length);
  const isZoomed = zoom.end - zoom.start + 1 < periods.length;

  const panChart = useCallback(
    (periodDelta: number): void => {
      if (periodDelta === 0 || periods.length === 0) return;
      setZoom((current) => {
        const widthInPeriods = current.end - current.start + 1;
        const start = Math.max(
          0,
          Math.min(current.start + periodDelta, periods.length - widthInPeriods),
        );
        return { start, end: start + widthInPeriods - 1 };
      });
    },
    [periods.length],
  );

  const resetZoom = (): void =>
    setZoom({ start: 0, end: Math.max(0, periods.length - 1) });

  const returnToLatest = (): void => {
    setZoom((current) => {
      const widthInPeriods = current.end - current.start + 1;
      const start = Math.max(0, periods.length - widthInPeriods);
      return { start, end: Math.max(start, periods.length - 1) };
    });
  };

  const toggleSeries = (key: string): void => {
    setVisibleKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;

    const zoomChart = (event: WheelEvent): void => {
      event.preventDefault();
      if (event.shiftKey) {
        const horizontalDelta =
          Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        panChart(horizontalDelta > 0 ? 1 : -1);
        return;
      }
      if (periods.length <= 2) return;
      setZoom((current) => {
        const currentSize = current.end - current.start + 1;
        const direction = event.deltaY < 0 ? -1 : 1;
        const nextSize = Math.max(
          2,
          Math.min(
            periods.length,
            currentSize + direction * Math.max(1, Math.round(currentSize * 0.2)),
          ),
        );
        const center = (current.start + current.end) / 2;
        let start = Math.round(center - (nextSize - 1) / 2);
        start = Math.max(0, Math.min(start, periods.length - nextSize));
        return { start, end: start + nextSize - 1 };
      });
    };

    chart.addEventListener('wheel', zoomChart, { passive: false });
    return () => chart.removeEventListener('wheel', zoomChart);
  }, [panChart, periods.length, visibleSeries.length]);

  const restoreSelection = useCallback((): void => {
    if (priorBodyUserSelectRef.current !== null) {
      document.body.style.userSelect = priorBodyUserSelectRef.current;
      priorBodyUserSelectRef.current = null;
    }
    setIsDraggingChart(false);
  }, []);

  useEffect(() => restoreSelection, [restoreSelection]);

  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Ending principal balance by obligation
            </h4>
            <p className="text-xs text-slate-600">
              Toggle lines in this report session. Use the mouse wheel over the chart to
              zoom the selected report range.
            </p>
          </div>
          <button
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-blue-200 focus:outline-none"
            onClick={resetZoom}
            type="button"
          >
            Reset zoom
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isZoomed || zoom.start === 0}
            onClick={() => panChart(-1)}
            type="button"
          >
            Previous period
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isZoomed || zoom.end >= periods.length - 1}
            onClick={() => panChart(1)}
            type="button"
          >
            Next period
          </button>
          {isZoomed && zoom.end < periods.length - 1 ? (
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={returnToLatest}
              type="button"
            >
              Return to latest periods
            </button>
          ) : null}
        </div>
        <div
          aria-label="Debt balance history chart controls"
          className="mt-3 flex flex-wrap gap-2"
        >
          <button
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-blue-200 focus:outline-none"
            onClick={() => setVisibleKeys(visibleKeys.length > 0 ? [] : allKeys)}
            type="button"
          >
            {visibleKeys.length > 0 ? 'Select none' : 'Select all'}
          </button>
          {series.map((item) => {
            const visible = visibleKeys.includes(item.key);
            return (
              <button
                aria-pressed={visible}
                className={`rounded-full border px-3 py-1 text-xs font-medium focus:ring-2 focus:ring-blue-200 focus:outline-none ${
                  visible
                    ? 'border-slate-400 bg-white text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-500 opacity-50'
                }`}
                key={item.key}
                onClick={() => toggleSeries(item.key)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="mr-2 inline-block h-0.5 w-5 align-middle"
                  style={{
                    backgroundColor: item.color,
                    borderTop:
                      item.dash === '0' ? undefined : `2px dashed ${item.color}`,
                  }}
                />
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="sr-only" data-testid="balance-history-y-axis-maximum">
          Y-axis maximum: {formatDollarString(scale.maximum.toFixed(2))}
        </p>
        <p className="sr-only" data-testid="balance-history-y-axis-minimum">
          Y-axis minimum: {formatDollarString(scale.minimum.toFixed(2))}
        </p>
        <p className="sr-only" data-testid="balance-history-y-axis-major-unit">
          Y-axis major unit: {formatDollarString(scale.majorUnit.toFixed(2))}
        </p>
        <p className="mt-2 text-xs text-slate-500" data-testid="balance-history-zoom">
          Visible range:{' '}
          {visiblePeriods.length > 0
            ? `${visiblePeriods.at(0)} through ${visiblePeriods.at(-1)}`
            : 'none'}{' '}
          ({visiblePeriods.length} of {periods.length} periods)
        </p>
        {visibleSeries.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            No debt lines are selected. Enable at least one legend item to view the
            chart.
          </p>
        ) : (
          <div
            className={`mt-4 touch-pan-y ${isDraggingChart ? 'cursor-grabbing select-none' : isZoomed ? 'cursor-grab' : ''}`}
            data-testid="balance-history-chart"
            ref={chartRef}
            role="img"
            aria-label={`Line chart of debt balance history from ${visiblePeriods.at(0) ?? ''} through ${visiblePeriods.at(-1) ?? ''}. Chart data is available in a disclosure.`}
            onPointerDown={(event) => {
              if (!isZoomed) return;
              event.preventDefault();
              dragStateRef.current = {
                pointerId: event.pointerId,
                originX: event.clientX,
                start: zoom.start,
                end: zoom.end,
                dragging: false,
              };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const dragState = dragStateRef.current;
              if (
                !dragState ||
                dragState.pointerId !== event.pointerId ||
                periods.length === 0
              ) {
                return;
              }
              const pixelDelta = dragState.originX - event.clientX;
              if (!dragState.dragging && Math.abs(pixelDelta) < 4) return;
              if (!dragState.dragging) {
                dragState.dragging = true;
                priorBodyUserSelectRef.current = document.body.style.userSelect;
                document.body.style.userSelect = 'none';
                setIsDraggingChart(true);
              }
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              const widthInPeriods = dragState.end - dragState.start + 1;
              const pixelsPerPeriod = Math.max(1, rect.width / widthInPeriods);
              const delta = Math.round(pixelDelta / pixelsPerPeriod);
              const start = Math.max(
                0,
                Math.min(dragState.start + delta, periods.length - widthInPeriods),
              );
              setZoom({ start, end: start + widthInPeriods - 1 });
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragStateRef.current = null;
              restoreSelection();
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragStateRef.current = null;
              restoreSelection();
            }}
          >
            <svg
              aria-hidden="true"
              className="h-auto w-full select-none"
              focusable="false"
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              width={width}
            >
              <title>Application-calculated ending principal balance by debt.</title>
              <desc>
                X axis is period end. Y axis is dollars. Lines show total debt and
                individual debt balances.
              </desc>
              <line
                stroke="#cbd5e1"
                strokeWidth="1"
                x1={chartLeft}
                x2={chartRight}
                y1={chartBottom}
                y2={chartBottom}
              />
              <line
                stroke="#cbd5e1"
                strokeWidth="1"
                x1={chartLeft}
                x2={chartLeft}
                y1={chartTop}
                y2={chartBottom}
              />
              <text fill="#475569" fontSize="11" x="4" y="16">
                Dollars
              </text>
              <text fill="#475569" fontSize="11" x={chartRight - 56} y={height - 10}>
                Period end
              </text>
              {scale.tickValues.map((tick, index) => {
                const y =
                  chartBottom -
                  ((tick - scale.minimum) / (scale.maximum - scale.minimum)) *
                    chartHeight;
                return (
                  <g key={tick}>
                    <line
                      stroke="#e2e8f0"
                      x1={chartLeft}
                      x2={chartRight}
                      y1={y}
                      y2={y}
                    />
                    <text
                      data-testid="balance-history-y-tick"
                      fill="#475569"
                      fontSize="10"
                      textAnchor="end"
                      x={chartLeft - 8}
                      y={y + 4}
                    >
                      {scale.formattedLabels[index]}
                    </text>
                  </g>
                );
              })}
              {tickIndexes.map((index) => {
                const period = visiblePeriods[index] ?? '';
                return (
                  <text
                    data-testid="balance-history-x-tick"
                    fill="#475569"
                    fontSize="10"
                    key={period}
                    textAnchor="middle"
                    x={xFor(index)}
                    y={chartBottom + 22}
                  >
                    {balanceHistoryTickLabel(period, visiblePeriods.length)}
                  </text>
                );
              })}
              {visibleSeries.map((item) => {
                const values = item.values.slice(zoom.start, zoom.end + 1);
                const points = values
                  .map((value, index) => `${xFor(index)},${yFor(value.balance)}`)
                  .join(' ');
                return (
                  <g aria-label={item.label} key={item.key}>
                    <polyline
                      data-testid="balance-history-line"
                      fill="none"
                      points={points}
                      stroke={item.color}
                      strokeDasharray={item.dash === '0' ? undefined : item.dash}
                      strokeWidth={item.key === 'total' ? '3' : '2'}
                    />
                    {values.map((value, index) => {
                      const x = xFor(index);
                      const y = yFor(value.balance);
                      return (
                        <g
                          className="opacity-0 hover:opacity-100 focus:opacity-100"
                          data-testid="balance-history-active-marker"
                          fill="white"
                          key={`${item.key}-${value.periodEndDate}`}
                          tabIndex={0}
                        >
                          <title data-testid="balance-history-tooltip">{`${value.periodEndDate}\n${item.label}\n${formatDollarString(value.balance.toFixed(2))}`}</title>
                          <g stroke={item.color} strokeWidth="2">
                            {markerForPoint({ marker: item.marker, x, y })}
                          </g>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>
      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-200 focus:outline-none">
          View chart data
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Period end</th>
                <th className="px-3 py-2">Series</th>
                <th className="px-3 py-2 text-right">Ending balance</th>
                <th className="px-3 py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {visibleSeries.flatMap((item) =>
                item.values.slice(zoom.start, zoom.end + 1).map((value) => (
                  <tr
                    className="border-t border-slate-100"
                    key={`${item.key}-${value.periodEndDate}`}
                  >
                    <td className="px-3 py-2">{value.periodEndDate}</td>
                    <td className="px-3 py-2">
                      {item.debtId ? (
                        <DebtButton
                          id={item.debtId}
                          name={item.label}
                          onSelectDebt={onSelectDebt}
                        />
                      ) : (
                        <span className="font-semibold text-slate-900">
                          {item.label}
                        </span>
                      )}
                    </td>
                    <MoneyCell value={value.balance.toFixed(2)} />
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {value.changeFromPriorPeriod === null
                        ? '—'
                        : formatDollarString(value.changeFromPriorPeriod.toFixed(2))}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};

const ReportBalanceHistory = ({
  isOpen,
  onOpenChange,
  reports,
  onSelectDebt,
}: {
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly reports: DebtReportsDto;
  readonly onSelectDebt: (id: string) => void;
}): React.JSX.Element => (
  <ReportShell
    basis={reports.balanceHistory.basis}
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    title="Debt balance history by obligation"
  >
    <BalanceHistoryChart
      rows={reports.balanceHistory.rows}
      onSelectDebt={onSelectDebt}
    />
  </ReportShell>
);

const InterestAnnualStackedChart = ({
  rows,
}: {
  readonly rows: readonly DebtReportsDto['activityTrends']['annualInterestByDebt'][number][];
}): React.JSX.Element | null => {
  const [selectedDebtIds, setSelectedDebtIds] = useState<string[] | null>(null);
  const debts = [...new Map(rows.map((row) => [row.debtId, row.debtName])).entries()];
  const years = [...new Set(rows.map((row) => row.year))].sort();
  const visibleDebtIds = selectedDebtIds ?? debts.map(([id]) => id);

  if (years.length === 0) return null;
  const values = new Map(
    rows.map((row) => [`${row.year}-${row.debtId}`, Number(row.interestExpense)]),
  );
  const totals = years.map((year) =>
    debts.reduce(
      (total, [debtId]) =>
        total +
        (visibleDebtIds.includes(debtId) ? (values.get(`${year}-${debtId}`) ?? 0) : 0),
      0,
    ),
  );
  const width = Math.max(640, years.length * 120 + 120);
  const height = 300;
  const chartBottom = 220;
  const chartTop = 54;
  const chartHeight = chartBottom - chartTop;
  const scale = buildChartScale({
    values: totals,
    chartHeight,
    includeZero: true,
    formatLabel: (value) => formatDollarString(value.toFixed(2)),
  });
  const barWidth = Math.min(
    72,
    Math.max(28, (width - 120) / Math.max(years.length, 1) / 2),
  );
  const colorFor = (index: number): string => debtSeriesColor(index);

  return (
    <div
      className="mt-3 overflow-x-auto"
      role="img"
      aria-label="Stacked bar chart of annual interest expense by debt source. Tooltip details are available on each segment."
    >
      <div
        aria-label="Annual interest debt sources"
        className="mb-3 flex flex-wrap gap-2"
      >
        {debts.map(([debtId, debtName], index) => {
          const visible = visibleDebtIds.includes(debtId);
          return (
            <button
              aria-pressed={visible}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${visible ? 'border-slate-400 bg-white' : 'border-slate-200 bg-slate-50 text-slate-500 opacity-50'}`}
              key={debtId}
              onClick={() =>
                setSelectedDebtIds(
                  visible
                    ? visibleDebtIds.filter((id) => id !== debtId)
                    : [...visibleDebtIds, debtId],
                )
              }
              type="button"
            >
              <span
                aria-hidden="true"
                className="mr-2 inline-block h-3 w-3"
                style={{ backgroundColor: colorFor(index) }}
              />
              {debtName}
            </button>
          );
        })}
      </div>
      <svg
        aria-hidden="true"
        className="h-auto min-w-full"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <line
          stroke="#cbd5e1"
          x1="56"
          x2={width - 24}
          y1={chartBottom}
          y2={chartBottom}
        />
        <text fill="#475569" fontSize="11" x="4" y="16">
          Dollars
        </text>
        {scale.tickValues.map((tick, index) => {
          const y =
            chartBottom -
            ((tick - scale.minimum) / (scale.maximum - scale.minimum)) * chartHeight;
          return (
            <g key={tick}>
              <line stroke="#e2e8f0" x1="56" x2={width - 24} y1={y} y2={y} />
              <text
                data-testid="annual-interest-y-tick"
                fill="#475569"
                fontSize="10"
                textAnchor="end"
                x="50"
                y={y + 4}
              >
                {scale.formattedLabels[index]}
              </text>
            </g>
          );
        })}
        {years.map((year, yearIndex) => {
          let currentTop = chartBottom;
          return (
            <g key={year}>
              {debts.map(([debtId, debtName], debtIndex) => {
                if (!visibleDebtIds.includes(debtId)) return null;
                const value = values.get(`${year}-${debtId}`) ?? 0;
                const segmentHeight =
                  ((value - 0) / (scale.maximum - scale.minimum)) * chartHeight;
                currentTop -= segmentHeight;
                const x = 72 + yearIndex * ((width - 120) / years.length);
                const annualTotal = totals[yearIndex] ?? 0;
                const percentage = annualTotal === 0 ? 0 : (value / annualTotal) * 100;
                return (
                  <rect
                    key={debtId}
                    fill={colorFor(debtIndex)}
                    height={segmentHeight}
                    tabIndex={0}
                    width={barWidth}
                    x={x - barWidth / 2}
                    y={currentTop}
                  >
                    <title data-testid="annual-interest-segment-tooltip">{`${year}\n${debtName}\n${formatDollarString(value.toFixed(2))}\n${percentage.toFixed(1)}% of annual interest`}</title>
                  </rect>
                );
              })}
              <text
                fill="#475569"
                fontSize="11"
                textAnchor="middle"
                x={72 + yearIndex * ((width - 120) / years.length)}
                y={chartBottom + 20}
              >
                {year}
              </text>
              <text
                data-testid={`annual-interest-total-${year}`}
                fill="#0f172a"
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
                x={72 + yearIndex * ((width - 120) / years.length)}
                y={Math.max(
                  18,
                  chartBottom -
                    (((totals[yearIndex] ?? 0) - scale.minimum) /
                      (scale.maximum - scale.minimum)) *
                      chartHeight -
                    8,
                )}
              >
                {formatDollarString((totals[yearIndex] ?? 0).toFixed(2))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const ReportInterestAnalysis = ({
  interestVisibleYears,
  isOpen,
  onInterestVisibleYearsChange,
  onOpenChange,
  reports,
}: {
  readonly interestVisibleYears: readonly string[] | null;
  readonly isOpen?: boolean;
  readonly onInterestVisibleYearsChange: (years: readonly string[] | null) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly reports: DebtReportsDto;
}): React.JSX.Element => {
  const annualTotals = new Map<string, number>();
  for (const row of reports.activityTrends.annualInterestByDebt) {
    annualTotals.set(
      row.year,
      (annualTotals.get(row.year) ?? 0) + Number(row.interestExpense),
    );
  }
  const monthlyRows = reports.activityTrends.rows;
  const hasMonthlyInterestActivity = hasInterestActivity(monthlyRows);
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

  return (
    <ReportShell
      basis={reports.activityTrends.basis}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Interest expense analysis"
    >
      <div className="space-y-5">
        <div
          className="rounded-lg border border-slate-200 p-4"
          data-testid="monthly-interest-chart"
        >
          <h4 className="text-sm font-semibold text-slate-900">
            Monthly interest expense by month and year
          </h4>
          {!hasMonthlyInterestActivity ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              No interest activity exists for month-by-month comparison.
            </p>
          ) : (
            <InterestComparisonChart
              onSelectedYearsChange={onInterestVisibleYearsChange}
              rows={monthlyRows}
              selectedYears={interestVisibleYears}
            />
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
            <InterestAnnualStackedChart
              rows={reports.activityTrends.annualInterestByDebt}
            />
          )}
        </div>
      </div>
      {reports.activityTrends.rows.length === 0 ? <EmptyState /> : null}
      {reports.activityTrends.rows.length > 0 ? (
        <details className="mt-4 rounded-lg border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            View chart data
          </summary>
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
                    <th className="px-3 py-2">Debt</th>
                    <th className="px-3 py-2 text-right">Interest expense</th>
                    <th className="px-3 py-2 text-right">Annual total</th>
                    <th className="px-3 py-2 text-right">Change from prior year</th>
                    <th className="px-3 py-2 text-right">% change from prior year</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.activityTrends.annualInterestByDebt.map((row) => {
                    const annualIndex = annualRows.findIndex(
                      (annual) => annual.year === row.year,
                    );
                    const annual = annualRows[annualIndex];
                    return (
                      <tr
                        className="border-t border-slate-100"
                        key={`${row.year}-${row.debtId}`}
                      >
                        <td className="px-3 py-2">{row.year}</td>
                        <td className="px-3 py-2">{row.debtName}</td>
                        <MoneyCell value={row.interestExpense} />
                        <MoneyCell value={(annual?.total ?? 0).toFixed(2)} />
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {annual?.change === null || !annual
                            ? '—'
                            : formatDollarString(annual.change.toFixed(2))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {annual?.percentChange === null || !annual
                            ? '—'
                            : `${annual.percentChange.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </details>
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
