import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DebtReportsDto,
  DebtSummaryDto,
  GetDebtReportsRequest,
} from '../../../shared/debt-contracts';
import { REPORTING_HISTORY_START_DATE } from '../../../shared/reporting-constants';
import { buildChartScale } from './chart-helpers';
import { formatDollarString } from './display-format';

type Preset = 'ytd' | 'prior-year' | 'last-12-months' | 'all-time' | 'custom';
type ChartKind = 'flow' | 'trend' | 'mix' | 'income' | 'ratio';
type CashFlowRow = DebtReportsDto['cashFlowAnalysis']['rows'][number];
type IncomeRow = DebtReportsDto['cashFlowAnalysis']['incomeRows'][number];
type ChartRow = CashFlowRow | IncomeRow;

export interface CashFlowAnalysisProps {
  readonly debts: readonly DebtSummaryDto[];
  readonly loading: boolean;
  readonly reports: DebtReportsDto | null;
  readonly onApplyFilters: (request: GetDebtReportsRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const value = (input: string | undefined): number => Number(input ?? '0.00');
const money = (input: string | number | undefined): string =>
  formatDollarString(String(input ?? '0.00'));
const monthLabel = (period: string): string => {
  const [year, month] = period.split('-');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
};
const rangeForPreset = (preset: Preset): { startDate: string; endDate: string } => {
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

const Chart = ({
  rows,
  title,
  kind,
}: {
  readonly rows: readonly ChartRow[];
  readonly title: string;
  readonly kind: ChartKind;
}): React.JSX.Element => {
  const width = 1200;
  const height = 420;
  const left = 98;
  const right = 30;
  const top = 30;
  const bottom = 64;
  const [zoom, setZoom] = useState({ start: 0, end: Math.max(0, rows.length - 1) });
  const [dragging, setDragging] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    originX: number;
    start: number;
    end: number;
    active: boolean;
  } | null>(null);
  const visibleRows = rows.slice(zoom.start, zoom.end + 1);
  const isZoomed = visibleRows.length < rows.length;
  const series =
    kind === 'flow'
      ? [
          { key: 'totalPayments', label: 'Total payments', color: '#0f766e' },
          { key: 'principal', label: 'Principal', color: '#2563eb' },
          { key: 'interest', label: 'Interest', color: '#d97706' },
          { key: 'fees', label: 'Fees', color: '#dc2626' },
        ]
      : kind === 'mix'
        ? [
            { key: 'principal', label: 'Principal', color: '#2563eb' },
            { key: 'interest', label: 'Interest', color: '#d97706' },
            { key: 'fees', label: 'Fees', color: '#dc2626' },
          ]
        : kind === 'income'
          ? [
              { key: 'netIncome', label: 'Net income', color: '#7c3aed' },
              { key: 'debtPayments', label: 'Debt payments', color: '#0f766e' },
              {
                key: 'remainingNetIncome',
                label: 'Remaining income',
                color: '#0891b2',
              },
            ]
          : kind === 'ratio'
            ? [
                {
                  key: 'debtPaymentsPercentNet',
                  label: 'Debt service %',
                  color: '#be123c',
                },
              ]
            : [{ key: 'totalPayments', label: 'Total payments', color: '#0f766e' }];
  const rowValue = (row: ChartRow, key: string): number | null => {
    const raw = (row as unknown as Record<string, string | null | undefined>)[key];
    return raw === null || raw === undefined ? null : value(raw);
  };
  const chartValues =
    kind === 'mix'
      ? visibleRows.map(
          (row) =>
            (rowValue(row, 'principal') ?? 0) +
            (rowValue(row, 'interest') ?? 0) +
            (rowValue(row, 'fees') ?? 0),
        )
      : series.flatMap((item) =>
          visibleRows.flatMap((row) => {
            const current = rowValue(row, item.key);
            return current === null ? [] : [current];
          }),
        );
  const scale = buildChartScale({
    values: chartValues,
    chartHeight: height - top - bottom,
    includeZero: true,
    formatLabel: (input) =>
      kind === 'ratio' ? `${input.toFixed(0)}%` : formatDollarString(input.toFixed(0)),
  });
  const xFor = (index: number): number =>
    left + (index / Math.max(visibleRows.length - 1, 1)) * (width - left - right);
  const yFor = (input: number): number =>
    height -
    bottom -
    ((input - scale.minimum) / (scale.maximum - scale.minimum)) *
      (height - top - bottom);
  const tickIndexes = (() => {
    if (visibleRows.length <= 1) return [0];
    const step = Math.max(1, Math.ceil((visibleRows.length - 1) / 7));
    return [
      ...new Set([
        0,
        visibleRows.length - 1,
        ...Array.from({ length: 20 }, (_, index) => (index + 1) * step).filter(
          (index) => index < visibleRows.length - 1,
        ),
      ]),
    ].sort((a, b) => a - b);
  })();
  const pan = useCallback(
    (delta: number): void => {
      setZoom((current) => {
        const span = current.end - current.start + 1;
        const start = Math.max(0, Math.min(current.start + delta, rows.length - span));
        return { start, end: start + span - 1 };
      });
    },
    [rows.length],
  );
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      if (event.shiftKey) {
        pan(event.deltaY > 0 ? 1 : -1);
        return;
      }
      if (rows.length <= 2) return;
      setZoom((current) => {
        const span = current.end - current.start + 1;
        const nextSpan = Math.max(
          2,
          Math.min(
            rows.length,
            span + (event.deltaY < 0 ? -1 : 1) * Math.max(1, Math.round(span * 0.2)),
          ),
        );
        const center = (current.start + current.end) / 2;
        const start = Math.max(
          0,
          Math.min(Math.round(center - (nextSpan - 1) / 2), rows.length - nextSpan),
        );
        return { start, end: start + nextSpan - 1 };
      });
    };
    chart.addEventListener('wheel', onWheel, { passive: false });
    return () => chart.removeEventListener('wheel', onWheel);
  }, [pan, rows.length]);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex gap-2" aria-label={`${title} controls`}>
          <button
            className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
            disabled={!isZoomed}
            onClick={() => pan(-1)}
            type="button"
          >
            Previous period
          </button>
          <button
            className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
            disabled={!isZoomed}
            onClick={() => pan(1)}
            type="button"
          >
            Next period
          </button>
          <button
            className="rounded border px-3 py-1.5 text-xs"
            onClick={() => setZoom({ start: 0, end: Math.max(0, rows.length - 1) })}
            type="button"
          >
            Reset zoom
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        {series.map((item) => (
          <span className="inline-flex items-center gap-1" key={item.key}>
            <span className="h-0.5 w-5" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div
        className={`mt-3 overflow-hidden ${dragging ? 'cursor-grabbing select-none' : isZoomed ? 'cursor-grab' : ''}`}
        data-testid={`${kind}-cash-flow-chart`}
        ref={chartRef}
        onPointerDown={(event) => {
          if (!isZoomed) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragRef.current = {
            originX: event.clientX,
            start: zoom.start,
            end: zoom.end,
            active: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const delta = drag.originX - event.clientX;
          if (!drag.active && Math.abs(delta) < 4) return;
          drag.active = true;
          setDragging(true);
          const span = drag.end - drag.start + 1;
          const indexDelta = Math.round((delta / width) * visibleRows.length);
          const start = Math.max(
            0,
            Math.min(drag.start + indexDelta, rows.length - span),
          );
          setZoom({ start, end: start + span - 1 });
        }}
        onPointerUp={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
      >
        <svg
          aria-label={`${title} chart`}
          className="h-auto w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {scale.tickValues.map((tick, index) => (
            <g key={tick}>
              <line
                stroke="#e2e8f0"
                x1={left}
                x2={width - right}
                y1={yFor(tick)}
                y2={yFor(tick)}
              />
              <text
                fill="#64748b"
                fontSize="13"
                textAnchor="end"
                x={left - 10}
                y={yFor(tick) + 4}
              >
                {scale.formattedLabels[index]}
              </text>
            </g>
          ))}
          {kind === 'mix'
            ? visibleRows.map((row, index) => {
                const barWidth = Math.max(
                  12,
                  (width - left - right) / Math.max(visibleRows.length * 1.5, 1),
                );
                let cursor = 0;
                return (
                  <g key={row.period}>
                    {series.map((item) => {
                      const start = cursor;
                      cursor += rowValue(row, item.key) ?? 0;
                      return (
                        <rect
                          fill={item.color}
                          height={Math.max(0, yFor(start) - yFor(cursor))}
                          key={item.key}
                          width={barWidth}
                          x={xFor(index) - barWidth / 2}
                          y={yFor(cursor)}
                        >
                          <title>{`${monthLabel(row.period)}\n${item.label}: ${money(rowValue(row, item.key) ?? 0)}`}</title>
                        </rect>
                      );
                    })}
                  </g>
                );
              })
            : series.map((item) => (
                <polyline
                  fill="none"
                  key={item.key}
                  points={visibleRows
                    .map((row, index) => {
                      const current = rowValue(row, item.key);
                      return current === null
                        ? null
                        : `${xFor(index)},${yFor(current)}`;
                    })
                    .filter((point): point is string => point !== null)
                    .join(' ')}
                  stroke={item.color}
                  strokeWidth="3"
                />
              ))}
          {tickIndexes.map((index) => (
            <text
              fill="#475569"
              fontSize="13"
              key={index}
              textAnchor="middle"
              x={xFor(index)}
              y={height - 26}
            >
              {monthLabel(visibleRows[index]?.period ?? '')}
            </text>
          ))}
          {visibleRows.map((row) => (
            <rect
              fill="transparent"
              height={height - top - bottom}
              key={`hover-${row.period}`}
              width={Math.max(
                12,
                (width - left - right) / Math.max(visibleRows.length, 1),
              )}
              x={xFor(visibleRows.indexOf(row)) - 6}
              y={top}
            >
              <title>{`${monthLabel(row.period)}\n${series
                .map((item) => {
                  const current = rowValue(row, item.key);
                  return `${item.label}: ${current === null ? 'Unavailable' : kind === 'ratio' ? `${current.toFixed(1)}%` : money(current)}`;
                })
                .join('\n')}`}</title>
            </rect>
          ))}
        </svg>
      </div>
    </section>
  );
};

export const CashFlowAnalysis = ({
  debts,
  loading,
  reports,
  onApplyFilters,
}: CashFlowAnalysisProps): React.JSX.Element => {
  const [preset, setPreset] = useState<Preset>('ytd');
  const [selectedDebtId, setSelectedDebtId] = useState('');
  const initialRange = rangeForPreset('ytd');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const activity = reports?.cashFlowAnalysis;
  const rows = useMemo(() => activity?.rows ?? [], [activity]);
  const totalPayments = rows.reduce((sum, row) => sum + value(row.totalPayments), 0);
  const principal = rows.reduce((sum, row) => sum + value(row.principal), 0);
  const interest = rows.reduce((sum, row) => sum + value(row.interest), 0);
  const fees = rows.reduce((sum, row) => sum + value(row.fees), 0);
  const incomeRows = activity?.incomeRows ?? [];
  const netIncome = incomeRows.reduce(
    (sum, row) => sum + (row.netIncome === null ? 0 : value(row.netIncome)),
    0,
  );
  const remainingNetIncome = incomeRows.reduce(
    (sum, row) =>
      sum + (row.remainingNetIncome === null ? 0 : value(row.remainingNetIncome)),
    0,
  );
  const debtPaymentPercentNet =
    activity?.incomeDataAvailable && netIncome > 0
      ? `${((totalPayments / netIncome) * 100).toFixed(1)}%`
      : 'Not available';
  const months = Math.max(rows.length, 1);
  const request = (
    range: { startDate: string; endDate: string },
    debtId: string,
  ): GetDebtReportsRequest => ({
    ...range,
    debtId: debtId || null,
    ownerEntity: null,
    debtType: null,
    status: 'active',
  });
  const applyPreset = (next: Preset): void => {
    const range = rangeForPreset(next);
    setPreset(next);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    onApplyFilters(request(range, selectedDebtId));
  };
  const first = rows[0];
  const last = rows.at(-1);
  const comparison = activity?.comparison;
  const paymentChange = comparison
    ? totalPayments - value(comparison.totalPayments)
    : null;
  const activeDebts = debts.filter((debt) => debt.status === 'active');
  return (
    <section aria-labelledby="cash-flow-analysis-heading" className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Read-only analysis
        </p>
        <h1 className="mt-1 text-3xl font-semibold" id="cash-flow-analysis-heading">
          Cash Flow / Debt Burden
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Debt-side cash outflow only: payments are separated into principal, interest,
          and fees. Purchases, borrowing, and transfers are excluded from debt-service
          cash flow.
        </p>
      </div>
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Period
          <select
            className="mt-1 block w-full rounded border-slate-300"
            onChange={(event) => applyPreset(event.target.value as Preset)}
            value={preset}
          >
            <option value="ytd">Year to date</option>
            <option value="prior-year">Prior year</option>
            <option value="last-12-months">Last 12 months</option>
            <option value="all-time">All time</option>
            <option value="custom">Custom date range</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Debt
          <select
            className="mt-1 block w-full rounded border-slate-300"
            onChange={(event) => {
              setSelectedDebtId(event.target.value);
              onApplyFilters(request({ startDate, endDate }, event.target.value));
            }}
            value={selectedDebtId}
          >
            <option value="">Entire portfolio</option>
            {activeDebts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {debt.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Start date
          <input
            className="mt-1 block w-full rounded border-slate-300"
            disabled={preset !== 'custom'}
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          End date
          <input
            className="mt-1 block w-full rounded border-slate-300"
            disabled={preset !== 'custom'}
            onChange={(event) => setEndDate(event.target.value)}
            type="date"
            value={endDate}
          />
        </label>
        {preset === 'custom' ? (
          <button
            className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white md:col-start-4"
            onClick={() =>
              onApplyFilters(request({ startDate, endDate }, selectedDebtId))
            }
            type="button"
          >
            Apply date range
          </button>
        ) : null}
      </div>
      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading debt cash flow…
        </p>
      ) : null}
      {!loading && activity ? (
        <>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {[
              [
                'Net income received',
                activity.incomeDataAvailable ? money(netIncome) : 'Not available',
              ],
              ['Total debt payments', money(totalPayments)],
              ['Principal paid', money(principal)],
              ['Interest paid', money(interest)],
              ['Fees paid', money(fees)],
              ['Average monthly payments', money(totalPayments / months)],
              [
                'Highest monthly payment',
                money(Math.max(0, ...rows.map((row) => value(row.totalPayments)))),
              ],
              [
                'Lowest monthly payment',
                money(
                  rows.length
                    ? Math.min(...rows.map((row) => value(row.totalPayments)))
                    : 0,
                ),
              ],
              [
                'Scheduled monthly payment',
                activity.currentScheduledMonthlyPayment
                  ? money(activity.currentScheduledMonthlyPayment)
                  : 'Not available',
              ],
              [
                'Payment change vs prior period',
                paymentChange === null ? 'Not available' : money(paymentChange),
              ],
              [
                'Net income after debt',
                activity.incomeDataAvailable
                  ? money(remainingNetIncome)
                  : 'Not available',
              ],
              ['Debt payments / net income', debtPaymentPercentNet],
            ].map(([label, display]) => (
              <section
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                key={label}
              >
                <h2 className="whitespace-nowrap text-sm font-semibold text-slate-600">
                  {label}
                </h2>
                <p className="mt-2 text-xl font-semibold">{display}</p>
              </section>
            ))}
          </div>
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <h2 className="font-semibold">Required versus extra payments</h2>
            <p className="mt-1">{activity.requiredPaymentLimitation}</p>
            {activity.extraPrincipalAvailable ? (
              <p className="mt-1">
                Explicit extra principal is shown separately in the monthly breakdown.
              </p>
            ) : null}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Income-based debt burden</h2>
            {activity.incomeDataAvailable ? (
              <>
                <p className="mt-1 text-sm text-slate-600">
                  Ratios use effective-dated net income plus other recurring income.
                  Months without an applicable income record are shown as unavailable.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {(() => {
                    const latest = [...activity.incomeRows]
                      .reverse()
                      .find((row) => row.netIncome !== null);
                    return [
                      [
                        'Net income',
                        latest?.netIncome ? money(latest.netIncome) : 'Not available',
                      ],
                      [
                        'Debt payments / net income',
                        latest?.debtPaymentsPercentNet ?? 'Not available',
                      ],
                      [
                        'Remaining after debt payments',
                        latest?.remainingNetIncome
                          ? money(latest.remainingNetIncome)
                          : 'Not available',
                      ],
                    ].map(([label, display]) => (
                      <section className="rounded-lg bg-slate-50 p-3" key={label}>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {label}
                        </h3>
                        <p className="mt-1 text-lg font-semibold">{display}</p>
                      </section>
                    ));
                  })()}
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                Add an effective-dated income record below to calculate debt-burden
                ratios.
              </p>
            )}
          </section>
          {comparison ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">Prior equivalent period</h2>
              <p className="mt-1 text-sm text-slate-600">
                Payments {money(comparison.totalPayments)} · Principal{' '}
                {money(comparison.principalPaid)} · Interest{' '}
                {money(comparison.interestPaid)} · Average monthly{' '}
                {money(comparison.averageMonthlyPayment)}
              </p>
            </section>
          ) : null}
          <Chart rows={rows} title="Monthly Debt Cash Flow" kind="flow" />
          <Chart rows={rows} title="Debt Payment Trend" kind="trend" />
          <Chart rows={rows} title="Principal vs Interest Mix" kind="mix" />
          {activity.incomeDataAvailable ? (
            <>
              <Chart
                rows={activity.incomeRows}
                title="Income and debt burden trend"
                kind="income"
              />
              <Chart
                rows={activity.incomeRows}
                title="Debt-service percentage"
                kind="ratio"
              />
            </>
          ) : null}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Monthly breakdown</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[950px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Month',
                      'Total payments',
                      'Principal',
                      'Interest',
                      'Fees',
                      'Extra principal',
                      'Payments',
                      'Beginning balance',
                      'Ending balance',
                    ].map((header) => (
                      <th className="whitespace-nowrap px-3 py-2" key={header}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className="border-b border-slate-100" key={row.period}>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">
                        {monthLabel(row.period)}
                      </td>
                      <td className="px-3 py-2">{money(row.totalPayments)}</td>
                      <td className="px-3 py-2">{money(row.principal)}</td>
                      <td className="px-3 py-2">{money(row.interest)}</td>
                      <td className="px-3 py-2">{money(row.fees)}</td>
                      <td className="px-3 py-2">
                        {row.extraPrincipal === null
                          ? 'Not available'
                          : money(row.extraPrincipal)}
                      </td>
                      <td className="px-3 py-2">{row.paymentCount}</td>
                      <td className="px-3 py-2">{money(row.beginningBalance)}</td>
                      <td className="px-3 py-2">{money(row.endingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Debt comparison</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[1000px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Debt',
                      'Current balance',
                      'Total payments',
                      'Principal paid',
                      'Interest paid',
                      'Fees',
                      'Average monthly',
                      'Share of payments',
                    ].map((header) => (
                      <th className="whitespace-nowrap px-3 py-2" key={header}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.debts.map((debt) => (
                    <tr className="border-b border-slate-100" key={debt.debtId}>
                      <td className="px-3 py-2 font-semibold">{debt.debtName}</td>
                      <td className="px-3 py-2">{money(debt.currentBalance)}</td>
                      <td className="px-3 py-2">{money(debt.totalPayments)}</td>
                      <td className="px-3 py-2">{money(debt.principalPaid)}</td>
                      <td className="px-3 py-2">{money(debt.interestPaid)}</td>
                      <td className="px-3 py-2">{money(debt.feesPaid)}</td>
                      <td className="px-3 py-2">{money(debt.averageMonthlyPayment)}</td>
                      <td className="px-3 py-2">
                        {debt.percentageOfPortfolioPayments}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
      {!loading && !activity ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No debt cash-flow activity is available for this period.
        </p>
      ) : null}
      {first && last ? (
        <span className="sr-only">
          Period runs from {monthLabel(first.period)} through {monthLabel(last.period)}.
        </span>
      ) : null}
    </section>
  );
};
