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
type ChartType = 'activity' | 'balance';

export interface CreditCardActivityProps {
  readonly debts: readonly DebtSummaryDto[];
  readonly loading: boolean;
  readonly reports: DebtReportsDto | null;
  readonly onApplyFilters: (request: GetDebtReportsRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const money = (value: string | number | undefined): string =>
  formatDollarString(String(value ?? '0.00'));
const numberValue = (value: string | undefined): number => Number(value ?? '0.00');
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

const signedMoney = (value: number): string => formatDollarString(value.toFixed(2));

const Chart = ({
  rows,
  title,
  type,
}: {
  readonly rows: readonly DebtReportsDto['creditCardActivity']['rows'][number][];
  readonly title: string;
  readonly type: ChartType;
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
    type === 'activity'
      ? [
          { key: 'purchases', label: 'Purchases/Charges', color: '#d97706' },
          { key: 'principalReduction', label: 'Principal paid', color: '#2563eb' },
          { key: 'netDebtChange', label: 'Net debt change', color: '#059669' },
        ]
      : [{ key: 'endingBalance', label: 'Ending card balance', color: '#7c3aed' }];
  const valueFor = (row: (typeof rows)[number], key: string): number => {
    if (key === 'netDebtChange') {
      return numberValue(row.endingBalance) - numberValue(row.beginningBalance);
    }
    if (key === 'endingBalance') return numberValue(row.endingBalance);
    return numberValue(row[key as 'purchases' | 'principalReduction']);
  };
  const values = series.flatMap((item) =>
    visibleRows.map((row) => valueFor(row, item.key)),
  );
  const scale = buildChartScale({
    values,
    chartHeight: height - top - bottom,
    includeZero: true,
    formatLabel: (value) => formatDollarString(value.toFixed(0)),
  });
  const xFor = (index: number): number =>
    left + (index / Math.max(visibleRows.length - 1, 1)) * (width - left - right);
  const yFor = (value: number): number =>
    height -
    bottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) *
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
        <h3 className="text-lg font-semibold">{title}</h3>
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
          <span className="inline-flex items-center gap-1" key={item.label}>
            <span className="h-0.5 w-5" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div
        className={`mt-3 overflow-hidden ${dragging ? 'cursor-grabbing select-none' : isZoomed ? 'cursor-grab' : ''}`}
        data-testid={`${type}-credit-card-chart`}
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
          {series.map((item) => (
            <polyline
              fill="none"
              key={item.key}
              points={visibleRows
                .map((row, index) => `${xFor(index)},${yFor(valueFor(row, item.key))}`)
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
          {visibleRows.map((row, index) => (
            <rect
              fill="transparent"
              height={height - top - bottom}
              key={row.period}
              width={Math.max(
                12,
                (width - left - right) / Math.max(visibleRows.length, 1),
              )}
              x={xFor(index) - 6}
              y={top}
            >
              <title>{`${monthLabel(row.period)}\n${series.map((item) => `${item.label}: ${signedMoney(valueFor(row, item.key))}`).join('\n')}`}</title>
            </rect>
          ))}
        </svg>
      </div>
    </section>
  );
};

export const CreditCardActivity = ({
  debts,
  loading,
  reports,
  onApplyFilters,
}: CreditCardActivityProps): React.JSX.Element => {
  const [preset, setPreset] = useState<Preset>('ytd');
  const [selectedDebtId, setSelectedDebtId] = useState<string>('');
  const initialRange = rangeForPreset('ytd');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const cards = debts.filter(
    (debt) => debt.debtType === 'credit_card' && debt.status === 'active',
  );
  const activity = reports?.creditCardActivity;
  const rows = useMemo(() => activity?.rows ?? [], [activity]);
  const totals = useMemo(() => {
    const first = rows[0];
    const last = rows.at(-1);
    return {
      beginning: first?.beginningBalance ?? '0.00',
      ending: last?.endingBalance ?? '0.00',
      purchases: rows.reduce((sum, row) => sum + numberValue(row.purchases), 0),
      principalPaid: rows.reduce(
        (sum, row) => sum + numberValue(row.principalReduction),
        0,
      ),
      interest: rows.reduce((sum, row) => sum + numberValue(row.interestActivity), 0),
      fees: rows.reduce((sum, row) => sum + numberValue(row.fees), 0),
      transferIn: rows.reduce((sum, row) => sum + numberValue(row.transferIn), 0),
      transferOut: rows.reduce((sum, row) => sum + numberValue(row.transferOut), 0),
      borrowings: rows.reduce((sum, row) => sum + numberValue(row.borrowings), 0),
    };
  }, [rows]);
  const netChange = numberValue(totals.ending) - numberValue(totals.beginning);
  const months = Math.max(rows.length, 1);
  const comparisonPeriodLabel = preset === 'ytd' ? 'YTD' : 'Period';
  const request = (
    range: { startDate: string; endDate: string },
    debtId: string,
  ): GetDebtReportsRequest => ({
    ...range,
    debtId: debtId || null,
    ownerEntity: null,
    debtType: 'credit_card',
    status: 'active',
  });
  const applyPreset = (next: Preset): void => {
    const range = rangeForPreset(next);
    setPreset(next);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    onApplyFilters(request(range, selectedDebtId));
  };
  return (
    <section aria-labelledby="credit-card-activity-heading" className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
          Read-only analysis
        </p>
        <h1 className="mt-1 text-3xl font-semibold" id="credit-card-activity-heading">
          Credit Card Activity
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Purchases, payments, transfers, deliberate borrowing, and carrying-cost
          activity for credit-card debts. This page does not edit ledger records.
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
          Card
          <select
            className="mt-1 block w-full rounded border-slate-300"
            onChange={(event) => {
              setSelectedDebtId(event.target.value);
              onApplyFilters(request({ startDate, endDate }, event.target.value));
            }}
            value={selectedDebtId}
          >
            <option value="">Entire credit-card portfolio</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
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
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white md:col-start-4"
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
          Loading credit-card activity…
        </p>
      ) : null}
      {!loading && activity ? (
        <>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {[
              ['Beginning balance', money(totals.beginning)],
              ['Ending/current balance', money(totals.ending)],
              ['Purchases/Charges', money(totals.purchases)],
              ['Principal paid', money(totals.principalPaid)],
              ['Net card debt change', signedMoney(netChange)],
              ['Interest paid', money(totals.interest)],
              ['Fees paid', money(totals.fees)],
              ['Average monthly purchases', signedMoney(totals.purchases / months)],
              [
                'Average monthly principal paid',
                signedMoney(totals.principalPaid / months),
              ],
            ].map(([label, value]) => (
              <section
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                key={label}
              >
                <h2 className="whitespace-nowrap text-sm font-semibold text-slate-600">
                  {label}
                </h2>
                <p className="mt-2 text-xl font-semibold">{value}</p>
              </section>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Transfer in', totals.transferIn],
              ['Transfer out', totals.transferOut],
              ['Deliberate Borrowing/Draw', totals.borrowings],
            ].map(([label, value]) => (
              <section
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                key={label as string}
              >
                <h2 className="text-sm font-semibold text-slate-600">
                  {label as string}
                </h2>
                <p className="mt-1 text-lg font-semibold">{money(value)}</p>
              </section>
            ))}
          </div>
          <Chart rows={rows} title="Monthly Activity" type="activity" />
          <Chart rows={rows} title="Credit Card Balance" type="balance" />
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Monthly breakdown</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[1100px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Month',
                      'Beginning balance',
                      'Purchases/Charges',
                      'Principal paid',
                      'Transfer in',
                      'Transfer out',
                      'Borrowing/Draw',
                      'Interest',
                      'Fees',
                      'Net debt change',
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
                      <td className="px-3 py-2">{money(row.beginningBalance)}</td>
                      <td className="px-3 py-2">{money(row.purchases)}</td>
                      <td className="px-3 py-2">{money(row.principalReduction)}</td>
                      <td className="px-3 py-2">{money(row.transferIn)}</td>
                      <td className="px-3 py-2">{money(row.transferOut)}</td>
                      <td className="px-3 py-2">{money(row.borrowings)}</td>
                      <td className="px-3 py-2">{money(row.interestActivity)}</td>
                      <td className="px-3 py-2">{money(row.fees)}</td>
                      <td className="px-3 py-2">
                        {signedMoney(
                          numberValue(row.endingBalance) -
                            numberValue(row.beginningBalance),
                        )}
                      </td>
                      <td className="px-3 py-2">{money(row.endingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Card comparison</h2>
            <p className="mt-1 text-sm text-slate-600">
              YTD values use the current report period. Usage characterization is
              descriptive only and is omitted when the ledger does not support a clear
              indication.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[900px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Card',
                      'Current balance',
                      `${comparisonPeriodLabel} purchases`,
                      `${comparisonPeriodLabel} principal paid`,
                      `${comparisonPeriodLabel} interest`,
                      'Net debt change',
                      'Description',
                    ].map((header) => (
                      <th className="whitespace-nowrap px-3 py-2" key={header}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.cards.map((card) => (
                    <tr className="border-b border-slate-100" key={card.debtId}>
                      <td className="px-3 py-2 font-semibold">{card.cardName}</td>
                      <td className="px-3 py-2">{money(card.currentBalance)}</td>
                      <td className="px-3 py-2">{money(card.purchases)}</td>
                      <td className="px-3 py-2">{money(card.principalPaid)}</td>
                      <td className="px-3 py-2">{money(card.interestPaid)}</td>
                      <td className="px-3 py-2">
                        {signedMoney(numberValue(card.netDebtChange))}
                      </td>
                      <td className="px-3 py-2">
                        {card.usageCharacterization ?? 'Insufficient data'}
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
          No credit-card activity is available for this period.
        </p>
      ) : null}
    </section>
  );
};
