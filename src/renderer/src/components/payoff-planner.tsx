import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExtraCashAllocationRequest,
  ExtraCashAllocationResponse,
} from '../../../shared/debt-contracts';
import { buildChartScale, buildPayoffChartTickIndexes } from './chart-helpers';
import { formatDollarString } from './display-format';

export interface PayoffPlannerProps {
  readonly loading: boolean;
  readonly result: ExtraCashAllocationResponse | null;
  readonly error: string | null;
  readonly onCalculate: (request: ExtraCashAllocationRequest) => void;
}

type Plan = ExtraCashAllocationResponse['baseline'];
type ValueType = 'balance' | 'interest';

const today = (): string => new Date().toISOString().slice(0, 10);
const money = (value: string | null): string =>
  value === null ? '—' : formatDollarString(value);
const monthYear = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
const monthsBetween = (start: string, end: string | null): number | null =>
  end === null
    ? null
    : (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
      Number(end.slice(5, 7)) -
      Number(start.slice(5, 7));

const extraCashForPlan = (plan: Plan): number =>
  Number(plan.lumpSumApplied) +
  plan.monthlySchedule.reduce(
    (total, entry) =>
      total +
      Math.max(
        0,
        Number(entry.extraMonthlyPayment) - Number(entry.freedPaymentRollover),
      ),
    0,
  );

const valueAt = (plan: Plan, date: string, type: ValueType): number => {
  const entries = plan.monthlySchedule.filter((entry) => entry.date <= date);
  if (entries.length === 0) return 0;
  if (type === 'balance') return Number(entries.at(-1)?.totalProjectedBalance ?? 0);
  return entries.reduce((total, entry) => total + Number(entry.interest), 0);
};

const ComparisonChart = ({
  plans,
  title,
  type,
}: {
  readonly plans: readonly {
    readonly label: string;
    readonly color: string;
    readonly plan: Plan;
  }[];
  readonly title: string;
  readonly type: ValueType;
}): React.JSX.Element => {
  const dates = useMemo(
    () =>
      [
        ...new Set(
          plans.flatMap((item) => item.plan.monthlySchedule.map((entry) => entry.date)),
        ),
      ].sort(),
    [plans],
  );
  const values = useMemo(
    () => plans.map((item) => dates.map((date) => valueAt(item.plan, date, type))),
    [dates, plans, type],
  );
  const [zoom, setZoom] = useState({ start: 0, end: Math.max(0, dates.length - 1) });
  const chartRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    originX: number;
    start: number;
    end: number;
    dragging: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const visibleDates = dates.slice(zoom.start, zoom.end + 1);
  const isZoomed = visibleDates.length < dates.length;
  const pan = useCallback(
    (delta: number): void => {
      setZoom((current) => {
        const span = current.end - current.start + 1;
        const start = Math.max(0, Math.min(current.start + delta, dates.length - span));
        return { start, end: start + span - 1 };
      });
    },
    [dates.length],
  );
  const reset = (): void => setZoom({ start: 0, end: Math.max(0, dates.length - 1) });
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
      if (dates.length <= 2) return;
      setZoom((current) => {
        const span = current.end - current.start + 1;
        const nextSpan = Math.max(
          2,
          Math.min(
            dates.length,
            span + (event.deltaY < 0 ? -1 : 1) * Math.max(1, Math.round(span * 0.2)),
          ),
        );
        const center = (current.start + current.end) / 2;
        const start = Math.max(
          0,
          Math.min(Math.round(center - (nextSpan - 1) / 2), dates.length - nextSpan),
        );
        return { start, end: start + nextSpan - 1 };
      });
    };
    chart.addEventListener('wheel', onWheel, { passive: false });
    return () => chart.removeEventListener('wheel', onWheel);
  }, [dates.length, pan]);
  const width = 1200;
  const height = 390;
  const left = 104;
  const right = 30;
  const top = 28;
  const bottom = 60;
  const chartHeight = height - top - bottom;
  const scale = buildChartScale({
    values: values.flatMap((series) => series.slice(zoom.start, zoom.end + 1)),
    chartHeight,
    includeZero: true,
    formatLabel: (value) => formatDollarString(value.toFixed(0)),
  });
  const xFor = (index: number): number =>
    left + (index / Math.max(visibleDates.length - 1, 1)) * (width - left - right);
  const yFor = (value: number): number =>
    height -
    bottom -
    ((value - scale.minimum) / (scale.maximum - scale.minimum)) * chartHeight;
  const tickIndexes = buildPayoffChartTickIndexes(visibleDates);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="flex flex-wrap gap-2" aria-label={`${title} controls`}>
          <button
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={!isZoomed}
            onClick={() => pan(-1)}
            type="button"
          >
            Previous period
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={!isZoomed}
            onClick={() => pan(1)}
            type="button"
          >
            Next period
          </button>
          <button
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold"
            onClick={reset}
            type="button"
          >
            Reset zoom
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-700">
        {plans.map((item) => (
          <span className="inline-flex items-center gap-1" key={item.label}>
            <span className="h-0.5 w-5" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Visible range: {visibleDates[0] ? monthYear(visibleDates[0]) : 'none'} through{' '}
        {visibleDates.at(-1) ? monthYear(visibleDates.at(-1)!) : 'none'}. Scroll to
        zoom; Shift+scroll or drag to pan.
      </p>
      <div
        className={`mt-2 touch-pan-y ${dragging ? 'cursor-grabbing select-none' : isZoomed ? 'cursor-grab' : ''}`}
        data-testid={`${type}-planner-chart`}
        ref={chartRef}
        onPointerDown={(event) => {
          if (!isZoomed) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragRef.current = {
            originX: event.clientX,
            start: zoom.start,
            end: zoom.end,
            dragging: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const pixelDelta = drag.originX - event.clientX;
          if (!drag.dragging && Math.abs(pixelDelta) < 4) return;
          drag.dragging = true;
          setDragging(true);
          const span = drag.end - drag.start + 1;
          const delta = Math.round(
            pixelDelta / Math.max(1, event.currentTarget.clientWidth / span),
          );
          const start = Math.max(0, Math.min(drag.start + delta, dates.length - span));
          setZoom({ start, end: start + span - 1 });
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          dragRef.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
      >
        <svg
          aria-label={`${title}. Tabular detail follows.`}
          className="h-auto w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
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
          {values.map((series, seriesIndex) => (
            <polyline
              fill="none"
              key={plans[seriesIndex]?.label}
              points={series
                .slice(zoom.start, zoom.end + 1)
                .map((value, index) => `${xFor(index)},${yFor(value)}`)
                .join(' ')}
              stroke={plans[seriesIndex]?.color}
              strokeWidth="3"
            />
          ))}
          {tickIndexes.map((index) => (
            <text
              fill="#475569"
              fontSize="12"
              key={visibleDates[index]}
              textAnchor="middle"
              x={xFor(index)}
              y={height - 18}
            >
              {visibleDates[index] ? monthYear(visibleDates[index]!) : ''}
            </text>
          ))}
          {visibleDates.map((date, index) => (
            <title
              key={date}
            >{`${monthYear(date)} — ${plans.map((plan, planIndex) => `${plan.label}: ${formatDollarString((values[planIndex]?.[zoom.start + index] ?? 0).toFixed(2))}`).join('; ')}`}</title>
          ))}
        </svg>
      </div>
    </section>
  );
};

const strategyLabel = (strategy: string): string => {
  if (strategy === 'baseline') return 'Current/default plan';
  if (strategy === 'highest_rate') return 'Highest interest rate first';
  if (strategy === 'lowest_balance') return 'Lowest balance first';
  return strategy;
};

export const PayoffPlanner = ({
  error,
  loading,
  onCalculate,
  result,
}: PayoffPlannerProps): React.JSX.Element => {
  const [analysisDate, setAnalysisDate] = useState(today());
  const [extraMonthlyPayment, setExtraMonthlyPayment] = useState('0.00');
  const [lumpSum, setLumpSum] = useState('0.00');
  const [lumpSumDate, setLumpSumDate] = useState(today());
  const plans = result
    ? [
        {
          label: strategyLabel(result.baseline.strategy),
          color: '#64748b',
          plan: result.baseline,
        },
        ...result.comparisons
          .filter(
            (plan) =>
              plan.strategy === 'highest_rate' || plan.strategy === 'lowest_balance',
          )
          .map((plan, index) => ({
            label: strategyLabel(plan.strategy),
            color: index === 0 ? '#2563eb' : '#059669',
            plan,
          })),
      ]
    : [];
  const planRows = plans.map((item) => item.plan);
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onCalculate({
      analysisDate,
      extraMonthlyPaymentStartDate: analysisDate,
      lumpSum,
      lumpSumDate,
      extraMonthlyPayment,
      excludedDebtIds: [],
      selectedDebtId: null,
      customPriority: [],
      customSplit: {},
      maxProjectionMonths: 600,
    });
  };
  return (
    <section aria-labelledby="payoff-planner-heading" className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Analysis</p>
        <h2 className="mt-1 text-3xl font-semibold" id="payoff-planner-heading">
          Debt Payoff Scenario Planner
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Compare payoff ordering strategies and see what an optional extra monthly
          payment or lump sum could accomplish. This planner is read-only and does not
          save a scenario.
        </p>
      </div>
      <form
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 lg:grid-cols-4"
        onSubmit={submit}
      >
        <label className="text-sm font-medium">
          Analysis/start date
          <input
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            type="date"
            value={analysisDate}
            onChange={(event) => setAnalysisDate(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Extra monthly payment
          <input
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            min="0"
            step="0.01"
            type="number"
            value={extraMonthlyPayment}
            onChange={(event) => setExtraMonthlyPayment(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Lump-sum payment
          <input
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            min="0"
            step="0.01"
            type="number"
            value={lumpSum}
            onChange={(event) => setLumpSum(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Lump-sum date
          <input
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            type="date"
            value={lumpSumDate}
            onChange={(event) => setLumpSumDate(event.target.value)}
          />
        </label>
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400 lg:col-span-4 lg:justify-self-start"
          disabled={loading}
          type="submit"
        >
          {loading ? 'Calculating…' : 'Compare payoff strategies'}
        </button>
      </form>
      {error ? (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {result && plans.length > 0 ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Strategy comparison</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[920px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Strategy</th>
                    <th className="py-2 pr-4">Debt-free date</th>
                    <th className="py-2 pr-4 text-right">Months to payoff</th>
                    <th className="py-2 pr-4 text-right">Remaining interest</th>
                    <th className="py-2 pr-4 text-right">Interest saved</th>
                    <th className="py-2 pr-4 text-right">Extra cash required</th>
                    <th className="py-2 pr-4 text-right">Time saved</th>
                  </tr>
                </thead>
                <tbody>
                  {planRows.map((plan) => (
                    <tr className="border-b border-slate-100" key={plan.strategy}>
                      <td className="py-2 pr-4 font-semibold">
                        {strategyLabel(plan.strategy)}
                      </td>
                      <td className="py-2 pr-4">
                        {plan.projectedPayoffDate
                          ? monthYear(plan.projectedPayoffDate)
                          : 'Beyond horizon'}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {monthsBetween(result.analysisDate, plan.projectedPayoffDate) ??
                          '—'}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(plan.projectedTotalInterest)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(plan.interestSaved)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {formatDollarString(extraCashForPlan(plan).toFixed(2))}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {plan.monthsSaved ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <ComparisonChart
            plans={plans}
            title="Projected total debt balance by strategy"
            type="balance"
          />
          <ComparisonChart
            plans={plans}
            title="Cumulative interest by strategy"
            type="interest"
          />
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Debt-by-debt payoff sequence</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[720px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Strategy</th>
                    <th className="py-2 pr-4">Priority</th>
                    <th className="py-2 pr-4">Debt</th>
                    <th className="py-2 pr-4">Payoff date</th>
                    <th className="py-2 pr-4 text-right">Projected interest</th>
                  </tr>
                </thead>
                <tbody>
                  {planRows.flatMap((plan) =>
                    plan.debts.map((debt) => (
                      <tr
                        className="border-b border-slate-100"
                        key={`${plan.strategy}-${debt.debtId}`}
                      >
                        <td className="py-2 pr-4">{strategyLabel(plan.strategy)}</td>
                        <td className="py-2 pr-4">
                          {debt.priority ??
                            plan.debts.findIndex(
                              (item) => item.debtId === debt.debtId,
                            ) + 1}
                        </td>
                        <td className="py-2 pr-4 font-semibold">{debt.debtName}</td>
                        <td className="py-2 pr-4">
                          {debt.projectedPayoffDate
                            ? monthYear(debt.projectedPayoffDate)
                            : 'Not reached'}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(debt.projectedInterest)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
};
