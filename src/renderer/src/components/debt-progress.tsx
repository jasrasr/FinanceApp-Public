import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DebtReportsDto,
  DebtSummaryDto,
  GetDebtReportsRequest,
} from '../../../shared/debt-contracts';
import { REPORTING_HISTORY_START_DATE } from '../../../shared/reporting-constants';
import { buildChartScale } from './chart-helpers';
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
const monthLabel = (period: string): string => {
  const [year, month] = period.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString(
    'en-US',
    { month: 'short', year: 'numeric', timeZone: 'UTC' },
  );
};

const visibleTickIndexes = (count: number): readonly number[] => {
  if (count <= 1) return [0];
  const maxTicks = count > 36 ? 8 : count > 18 ? 7 : Math.min(10, count);
  const step = Math.max(1, Math.ceil((count - 1) / (maxTicks - 1)));
  const indexes = new Set<number>([0, count - 1]);
  for (let index = step; index < count - 1; index += step) indexes.add(index);
  return [...indexes].sort((left, right) => left - right);
};

interface DragState {
  readonly pointerId: number;
  readonly originX: number;
  readonly start: number;
  readonly end: number;
  dragging: boolean;
}

const ChartControls = ({
  isZoomed,
  onNext,
  onPrevious,
  onReset,
}: {
  readonly isZoomed: boolean;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onReset: () => void;
}): React.JSX.Element => (
  <div className="mt-3 flex flex-wrap gap-2" aria-label="Chart controls">
    <button
      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!isZoomed}
      onClick={onPrevious}
      type="button"
    >
      Previous period
    </button>
    <button
      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!isZoomed}
      onClick={onNext}
      type="button"
    >
      Next period
    </button>
    <button
      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      onClick={onReset}
      type="button"
    >
      Reset zoom
    </button>
  </div>
);

const ProgressChart = ({
  rows,
}: {
  readonly rows: readonly DebtReportsDto['monthlyRollforward']['rows'][number][];
}): React.JSX.Element => {
  const width = 1200;
  const height = 420;
  const left = 94;
  const right = 28;
  const top = 28;
  const bottom = 64;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const [zoom, setZoom] = useState({ start: 0, end: Math.max(0, rows.length - 1) });
  const visibleRows = rows.slice(zoom.start, zoom.end + 1);
  const isZoomed = visibleRows.length < rows.length;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
  const reset = (): void => setZoom({ start: 0, end: Math.max(0, rows.length - 1) });
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      if (event.shiftKey) {
        const direction =
          Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        pan(direction > 0 ? 1 : -1);
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
  const scale = buildChartScale({
    values: visibleRows.flatMap((row) => series.map((item) => valueFor(row, item.key))),
    chartHeight,
    includeZero: true,
    formatLabel: (value) => formatDollarString(value.toFixed(2)),
  });
  const yFor = (value: number): number =>
    height -
    bottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) * chartHeight;
  const xFor = (index: number): number =>
    left + ((index + 0.5) * chartWidth) / Math.max(visibleRows.length, 1);
  const slot = chartWidth / Math.max(visibleRows.length, 1);
  const barWidth = Math.max(5, Math.min(26, slot / 6));
  const tickIndexes = visibleTickIndexes(visibleRows.length);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
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
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pixelDelta = drag.originX - event.clientX;
    if (!drag.dragging && Math.abs(pixelDelta) < 4) return;
    drag.dragging = true;
    setIsDragging(true);
    event.preventDefault();
    const span = drag.end - drag.start + 1;
    const delta = Math.round(
      pixelDelta / Math.max(1, event.currentTarget.clientWidth / span),
    );
    const start = Math.max(0, Math.min(drag.start + delta, rows.length - span));
    setZoom({ start, end: start + span - 1 });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    setIsDragging(false);
  };

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
      <ChartControls
        isZoomed={isZoomed}
        onNext={() => pan(1)}
        onPrevious={() => pan(-1)}
        onReset={reset}
      />
      <p className="mt-2 text-xs text-slate-500" data-testid="debt-progress-zoom">
        Visible range: {visibleRows[0] ? monthLabel(visibleRows[0].period) : 'none'}{' '}
        through {visibleRows.at(-1) ? monthLabel(visibleRows.at(-1)!.period) : 'none'} (
        {visibleRows.length} of {rows.length} months). Scroll to zoom; Shift+scroll or
        drag to pan.
      </p>
      <div
        className={`mt-2 touch-pan-y ${isDragging ? 'cursor-grabbing select-none' : isZoomed ? 'cursor-grab' : ''}`}
        data-testid="debt-progress-chart"
        ref={chartRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`}>
          {scale.tickValues.map((tick) => (
            <g key={tick}>
              <line
                stroke="#e2e8f0"
                x1={left}
                x2={width - right}
                y1={yFor(tick)}
                y2={yFor(tick)}
              />
              <text
                fill="#475569"
                fontSize="12"
                textAnchor="end"
                x={left - 10}
                y={yFor(tick) + 4}
              >
                {formatDollarString(tick.toFixed(0))}
              </text>
            </g>
          ))}
          <line
            stroke="#64748b"
            x1={left}
            x2={width - right}
            y1={yFor(0)}
            y2={yFor(0)}
          />
          {visibleRows.map((row, rowIndex) =>
            series.map((item, seriesIndex) => {
              const value = valueFor(row, item.key);
              const valueY = yFor(value);
              const zeroY = yFor(0);
              const x = xFor(rowIndex) + (seriesIndex - 1.5) * (barWidth + 1);
              return (
                <rect
                  fill={item.color}
                  height={Math.max(1, Math.abs(zeroY - valueY))}
                  key={`${row.period}-${item.key}`}
                  width={barWidth}
                  x={x}
                  y={Math.min(zeroY, valueY)}
                >
                  <title>{`${monthLabel(row.period)} — ${item.label}: ${formatDollarString(money(value))}`}</title>
                </rect>
              );
            }),
          )}
          {tickIndexes.map((index) => (
            <text
              fill="#475569"
              fontSize="12"
              key={visibleRows[index]?.period}
              textAnchor="middle"
              x={xFor(index)}
              y={height - 24}
            >
              {visibleRows[index] ? monthLabel(visibleRows[index].period) : ''}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
};

const BalanceChart = ({
  rows,
}: {
  readonly rows: readonly DebtReportsDto['monthlyRollforward']['rows'][number][];
}): React.JSX.Element => {
  const width = 1100;
  const height = 330;
  const left = 94;
  const right = 28;
  const top = 28;
  const bottom = 58;
  const chartHeight = height - top - bottom;
  const [zoom, setZoom] = useState({ start: 0, end: Math.max(0, rows.length - 1) });
  const visibleRows = rows.slice(zoom.start, zoom.end + 1);
  const isZoomed = visibleRows.length < rows.length;
  const chartRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
  const reset = (): void => setZoom({ start: 0, end: Math.max(0, rows.length - 1) });
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      if (event.shiftKey) {
        const direction =
          Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        pan(direction > 0 ? 1 : -1);
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
  const scale = buildChartScale({
    values: visibleRows.flatMap((row) => [
      numeric(row.beginningBalance),
      numeric(row.endingBalance),
    ]),
    chartHeight,
    includeZero: true,
    formatLabel: (value) => formatDollarString(value.toFixed(2)),
  });
  const xFor = (index: number): number =>
    left + (index / Math.max(visibleRows.length - 1, 1)) * (width - left - right);
  const yFor = (value: number): number =>
    height -
    bottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) * chartHeight;
  const points = (key: 'beginningBalance' | 'endingBalance'): string =>
    visibleRows
      .map((row, index) => `${xFor(index)},${yFor(numeric(row[key]))}`)
      .join(' ');
  const tickIndexes = visibleTickIndexes(visibleRows.length);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
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
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pixelDelta = drag.originX - event.clientX;
    if (!drag.dragging && Math.abs(pixelDelta) < 4) return;
    drag.dragging = true;
    setIsDragging(true);
    event.preventDefault();
    const span = drag.end - drag.start + 1;
    const delta = Math.round(
      pixelDelta / Math.max(1, event.currentTarget.clientWidth / span),
    );
    const start = Math.max(0, Math.min(drag.start + delta, rows.length - span));
    setZoom({ start, end: start + span - 1 });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    setIsDragging(false);
  };

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
      <ChartControls
        isZoomed={isZoomed}
        onNext={() => pan(1)}
        onPrevious={() => pan(-1)}
        onReset={reset}
      />
      <p className="mt-2 text-xs text-slate-500" data-testid="debt-balance-zoom">
        Visible range: {visibleRows[0] ? monthLabel(visibleRows[0].period) : 'none'}{' '}
        through {visibleRows.at(-1) ? monthLabel(visibleRows.at(-1)!.period) : 'none'} (
        {visibleRows.length} of {rows.length} months). Scroll to zoom; Shift+scroll or
        drag to pan.
      </p>
      <div
        className={`mt-2 touch-pan-y ${isDragging ? 'cursor-grabbing select-none' : isZoomed ? 'cursor-grab' : ''}`}
        data-testid="debt-balance-chart"
        ref={chartRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`}>
          {scale.tickValues.map((tick) => (
            <g key={tick}>
              <line
                stroke="#e2e8f0"
                x1={left}
                x2={width - right}
                y1={yFor(tick)}
                y2={yFor(tick)}
              />
              <text
                fill="#475569"
                fontSize="12"
                textAnchor="end"
                x={left - 10}
                y={yFor(tick) + 4}
              >
                {formatDollarString(tick.toFixed(0))}
              </text>
            </g>
          ))}
          <line
            stroke="#cbd5e1"
            x1={left}
            x2={width - right}
            y1={yFor(0)}
            y2={yFor(0)}
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
          {visibleRows.map((row, index) => (
            <circle
              cx={xFor(index)}
              cy={yFor(numeric(row.endingBalance))}
              fill="#0f172a"
              key={row.period}
              r="3"
            >
              <title>{`${monthLabel(row.period)} — ending balance: ${formatDollarString(row.endingBalance)}; beginning balance: ${formatDollarString(row.beginningBalance)}`}</title>
            </circle>
          ))}
          {tickIndexes.map((index) => (
            <text
              fill="#475569"
              fontSize="12"
              key={visibleRows[index]?.period}
              textAnchor="middle"
              x={xFor(index)}
              y={height - 18}
            >
              {visibleRows[index] ? monthLabel(visibleRows[index].period) : ''}
            </text>
          ))}
        </svg>
      </div>
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
  const netReduction = principalPaid - purchases - borrowings;

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
            <div className="mt-3 max-w-full overflow-x-auto pb-2">
              <table className="min-w-[1120px] text-sm">
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
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">
                        {monthLabel(row.period)}
                      </td>
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
