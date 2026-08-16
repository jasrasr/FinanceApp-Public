import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreatePayoffScenarioRequest,
  ExtraCashAllocationRequest,
  ExtraCashAllocationResponse,
} from '../../../shared/debt-contracts';
import type { DebtSummaryDto } from '../../../shared/debt-contracts';
import { buildChartScale, buildPayoffChartTickIndexes } from './chart-helpers';
import { formatDollarString } from './display-format';

export interface ExtraCashAllocationProps {
  readonly debts: readonly DebtSummaryDto[];
  readonly loading: boolean;
  readonly result: ExtraCashAllocationResponse | null;
  readonly error: string | null;
  readonly onCalculate: (request: ExtraCashAllocationRequest) => void;
  readonly onSave: (request: CreatePayoffScenarioRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const money = (value: string | null): string =>
  value === null ? '—' : formatDollarString(value);

const formatMonthYear = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

type ExtraCashResult = ExtraCashAllocationResponse['baseline'];

const WhatIfChart = ({
  baseline,
  scenario,
  title,
  valueType,
}: {
  readonly baseline: ExtraCashResult;
  readonly scenario: ExtraCashResult;
  readonly title: string;
  readonly valueType: 'balance' | 'interest';
}): React.JSX.Element => {
  const dates = useMemo(
    () => [...new Set(baseline.monthlySchedule.map((item) => item.date))],
    [baseline.monthlySchedule],
  );
  const valueAt = (row: ExtraCashResult, date: string): number => {
    const entries = row.monthlySchedule.filter((item) => item.date <= date);
    if (entries.length === 0) return 0;
    if (valueType === 'balance') {
      return Number(entries.at(-1)?.totalProjectedBalance ?? 0);
    }
    return entries.reduce((total, item) => total + Number(item.interest), 0);
  };
  const series = [
    {
      label: 'Current plan',
      color: '#64748b',
      values: dates.map((date) => valueAt(baseline, date)),
    },
    {
      label: 'What-if plan',
      color: '#2563eb',
      values: dates.map((date) => valueAt(scenario, date)),
    },
  ] as const;
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
  const height = 380;
  const left = 100;
  const right = 30;
  const top = 28;
  const bottom = 58;
  const chartHeight = height - top - bottom;
  const visibleValues = series.flatMap((item) =>
    item.values.slice(zoom.start, zoom.end + 1),
  );
  const scale = buildChartScale({
    values: visibleValues,
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
  const points = (values: readonly number[]): string =>
    values
      .slice(zoom.start, zoom.end + 1)
      .map((value, index) => `${xFor(index)},${yFor(value)}`)
      .join(' ');
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
      <div className="mt-2 flex gap-4 text-xs text-slate-700">
        {series.map((item) => (
          <span className="inline-flex items-center gap-1" key={item.label}>
            <span className="h-0.5 w-5" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Visible range: {visibleDates[0] ? formatMonthYear(visibleDates[0]) : 'none'}{' '}
        through {visibleDates.at(-1) ? formatMonthYear(visibleDates.at(-1)!) : 'none'}.
        Scroll to zoom; Shift+scroll or drag to pan.
      </p>
      <div
        className={`mt-2 touch-pan-y ${dragging ? 'cursor-grabbing select-none' : isZoomed ? 'cursor-grab' : ''}`}
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
          {series.map((item) => (
            <polyline
              fill="none"
              key={item.label}
              points={points(item.values)}
              stroke={item.color}
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
              {visibleDates[index] ? formatMonthYear(visibleDates[index]!) : ''}
            </text>
          ))}
          {visibleDates.map((date, index) => (
            <g key={date}>
              <title>{`${formatMonthYear(date)} — current ${formatDollarString(series[0].values[zoom.start + index]!.toFixed(2))}; what-if ${formatDollarString(series[1].values[zoom.start + index]!.toFixed(2))}`}</title>
              <circle
                cx={xFor(index)}
                cy={yFor(series[1].values[zoom.start + index]!)}
                fill="#2563eb"
                r="3"
              />
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
};

export const ExtraCashAllocation = ({
  debts,
  loading,
  result,
  error,
  onCalculate,
  onSave,
}: ExtraCashAllocationProps): React.JSX.Element => {
  const [analysisDate, setAnalysisDate] = useState(today());
  const [lumpSum, setLumpSum] = useState('0.00');
  const [extraMonthlyPayment, setExtraMonthlyPayment] = useState('0.00');
  const [extraMonthlyPaymentStartDate, setExtraMonthlyPaymentStartDate] =
    useState(today());
  const [lumpSumDate, setLumpSumDate] = useState(today());
  const [selectedDebtId, setSelectedDebtId] = useState('');
  const [strategy, setStrategy] = useState<'highest_rate' | 'lowest_balance'>(
    'highest_rate',
  );
  const selectedWhatIfStrategy = selectedDebtId ? 'selected_debt' : strategy;
  const selectedScenario =
    result?.comparisons.find((row) => row.strategy === selectedWhatIfStrategy) ??
    result?.comparisons[0] ??
    null;
  const extraCashContributed = selectedScenario
    ? Number(selectedScenario.lumpSumApplied) +
      selectedScenario.monthlySchedule.reduce(
        (total, entry) =>
          total +
          Math.max(
            0,
            Number(entry.extraMonthlyPayment) - Number(entry.freedPaymentRollover),
          ),
        0,
      )
    : 0;
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const excludedDebtIds = selectedDebtId
      ? debts.filter((debt) => debt.id !== selectedDebtId).map((debt) => debt.id)
      : [];
    onCalculate({
      analysisDate,
      extraMonthlyPaymentStartDate,
      lumpSum,
      lumpSumDate,
      extraMonthlyPayment,
      excludedDebtIds,
      selectedDebtId: selectedDebtId || null,
      customPriority: [],
      customSplit: {},
      maxProjectionMonths: 600,
    });
  };
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <p className="text-sm font-medium text-slate-500">Decision analysis</p>
        <h2 className="mt-1 text-3xl font-semibold">
          Extra Payment / What-If Analysis
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          Compare required payments with an extra-payment plan using current
          application-calculated debt balances. This analysis is projected and never
          posts ledger activity.
        </p>
        <form
          className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-4"
          onSubmit={submit}
        >
          <label className="text-sm font-medium">
            Extra recurring payment
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              type="number"
              min="0"
              step="0.01"
              value={extraMonthlyPayment}
              onChange={(e) => setExtraMonthlyPayment(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Recurring payment start date
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              type="date"
              value={extraMonthlyPaymentStartDate}
              onChange={(e) => {
                setExtraMonthlyPaymentStartDate(e.target.value);
                setAnalysisDate(e.target.value);
              }}
            />
          </label>
          <label className="text-sm font-medium">
            One-time lump sum
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              type="number"
              min="0"
              step="0.01"
              value={lumpSum}
              onChange={(e) => setLumpSum(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Lump-sum payment date
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              type="date"
              value={lumpSumDate}
              onChange={(e) => setLumpSumDate(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Scope
            <select
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              value={selectedDebtId}
              onChange={(e) => setSelectedDebtId(e.target.value)}
            >
              <option value="">Entire portfolio</option>
              {debts.map((debt) => (
                <option key={debt.id} value={debt.id}>
                  {debt.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Allocation strategy
            <select
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              disabled={Boolean(selectedDebtId)}
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as typeof strategy)}
            >
              <option value="highest_rate">
                Current/default: highest interest rate first
              </option>
              <option value="lowest_balance">Lowest balance first</option>
            </select>
            {selectedDebtId ? (
              <span className="mt-1 block text-xs text-slate-500">
                Individual analysis applies extra cash to the selected debt.
              </span>
            ) : null}
          </label>
          <div className="flex items-end lg:col-span-2">
            <button
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
              disabled={loading}
              type="submit"
            >
              {loading ? 'Calculating…' : 'Compare current plan vs what-if plan'}
            </button>
          </div>
        </form>
      </section>
      {error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">
              Debt eligibility as of {result.analysisDate}
            </h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 text-sm">
              {result.eligibleDebts.map((debt) => (
                <label className="flex gap-2" key={debt.debtName}>
                  <input
                    type="checkbox"
                    checked={debt.included}
                    disabled={!debt.included}
                    onChange={() => undefined}
                  />{' '}
                  <span>
                    {debt.debtName} — {debt.included ? 'Included' : debt.reason}
                  </span>
                </label>
              ))}
            </div>
          </section>
          {selectedScenario ? (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      Current plan vs What-if plan
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {selectedScenario.strategyName}. This projection is read-only and
                      does not post payments or modify balances.
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                    {selectedScenario.status === 'partial'
                      ? 'Partial projection'
                      : 'Projected'}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-sm text-slate-500">Current projected payoff</dt>
                    <dd className="font-semibold">
                      {result.baseline.projectedPayoffDate
                        ? formatMonthYear(result.baseline.projectedPayoffDate)
                        : 'Beyond horizon'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">What-if projected payoff</dt>
                    <dd className="font-semibold">
                      {selectedScenario.projectedPayoffDate
                        ? formatMonthYear(selectedScenario.projectedPayoffDate)
                        : 'Beyond horizon'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">Time saved</dt>
                    <dd className="font-semibold">
                      {selectedScenario.monthsSaved === null
                        ? 'Not reached'
                        : `${selectedScenario.monthsSaved} months`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">Interest saved</dt>
                    <dd className="font-semibold text-emerald-700">
                      {money(selectedScenario.interestSaved)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">
                      Current remaining interest
                    </dt>
                    <dd className="font-semibold">
                      {money(result.baseline.projectedTotalInterest)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">
                      What-if remaining interest
                    </dt>
                    <dd className="font-semibold">
                      {money(selectedScenario.projectedTotalInterest)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">Extra cash contributed</dt>
                    <dd className="font-semibold">
                      {formatDollarString(extraCashContributed.toFixed(2))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">Net financial benefit</dt>
                    <dd className="font-semibold text-emerald-700">
                      {money(selectedScenario.interestSaved)}
                    </dd>
                  </div>
                </dl>
              </section>
              <WhatIfChart
                baseline={result.baseline}
                scenario={selectedScenario}
                title="Current vs what-if total debt balance"
                valueType="balance"
              />
              <WhatIfChart
                baseline={result.baseline}
                scenario={selectedScenario}
                title="Cumulative interest: current vs what-if"
                valueType="interest"
              />
              <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Payoff comparison by debt</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[900px] text-left text-sm">
                    <thead className="border-b text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Debt</th>
                        <th className="py-2 pr-4">Current payoff date</th>
                        <th className="py-2 pr-4">What-if payoff date</th>
                        <th className="py-2 pr-4 text-right">Time saved</th>
                        <th className="py-2 pr-4 text-right">
                          Current remaining interest
                        </th>
                        <th className="py-2 pr-4 text-right">
                          What-if remaining interest
                        </th>
                        <th className="py-2 pr-4 text-right">Interest saved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedScenario.debts.map((debt) => (
                        <tr className="border-b border-slate-100" key={debt.debtId}>
                          <td className="py-2 pr-4 font-semibold">{debt.debtName}</td>
                          <td className="py-2 pr-4">
                            {debt.baselinePayoffDate
                              ? formatMonthYear(debt.baselinePayoffDate)
                              : 'Not reached'}
                          </td>
                          <td className="py-2 pr-4">
                            {debt.projectedPayoffDate
                              ? formatMonthYear(debt.projectedPayoffDate)
                              : 'Not reached'}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {debt.monthsSaved ?? '—'}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {money(debt.baselineProjectedInterest)}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {money(debt.projectedInterest)}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {money(debt.interestSaved)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Comparison</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Strategy</th>
                    <th className="py-2 pr-4">Initial target</th>
                    <th className="py-2 pr-4 text-right">Lump sum applied</th>
                    <th className="py-2 pr-4 text-right">Unused cash</th>
                    <th className="py-2 pr-4">First debt payoff</th>
                    <th className="py-2 pr-4 text-right">Projected interest</th>
                    <th className="py-2 pr-4 text-right">
                      <span title="Interest avoided on the initial debt receiving the lump sum or extra payment.">
                        Direct interest saved
                      </span>
                    </th>
                    <th className="py-2 pr-4 text-right">
                      <span title="Additional portfolio interest avoided after a paid-off debt's former required payment is redirected to later priority debts.">
                        Interest saved from redirected payments
                      </span>
                    </th>
                    <th className="py-2 pr-4 text-right">Total interest saved</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Save scenario</th>
                  </tr>
                </thead>
                <tbody>
                  {[result.baseline, ...result.comparisons].map((row) => (
                    <tr className="border-b border-slate-100" key={row.strategy}>
                      <td className="py-2 pr-4 font-semibold">{row.strategyName}</td>
                      <td className="py-2 pr-4">{row.initialDebtName ?? 'None'}</td>
                      <td className="py-2 pr-4 text-right">
                        {row.strategy === 'baseline'
                          ? '$0.00'
                          : money(row.lumpSumApplied)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {row.strategy === 'baseline'
                          ? 'Not applied — baseline'
                          : money(row.unusedLumpSum)}
                      </td>
                      <td className="py-2 pr-4">
                        {row.firstDebtName
                          ? `${row.firstDebtName} (${row.firstDebtPayoffDate ?? 'not reached'})`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(row.projectedTotalInterest)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(row.directInterestSaved)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(row.rolloverInterestSaved)}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {money(row.interestSaved)}
                      </td>
                      <td className="py-2 pr-4">
                        {row.strategy === 'baseline'
                          ? 'Baseline comparison'
                          : row.status === 'partial'
                            ? `Partial — ${row.incompleteDebtNames.join(', ')}`
                            : row.status === 'not_configured'
                              ? `Not configured — ${row.configurationMessage ?? ''}`
                              : 'Projected'}
                      </td>
                      <td className="py-2 pr-4">
                        <button
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                          type="button"
                          onClick={() =>
                            onSave({
                              name: `Extra-cash ${row.strategyName}`,
                              scenarioStartDate: result.analysisDate,
                              strategy:
                                row.strategy === 'highest_rate'
                                  ? 'avalanche'
                                  : row.strategy === 'lowest_balance'
                                    ? 'snowball'
                                    : row.strategy === 'baseline'
                                      ? 'baseline'
                                      : 'custom',
                              extraMonthlyPayment,
                              customPriority: row.debts
                                .filter((debt) => debt.priority !== null)
                                .sort(
                                  (left, right) =>
                                    (left.priority ?? 0) - (right.priority ?? 0),
                                )
                                .map((debt) => debt.debtId),
                              variableRateOverrides: {},
                              maxProjectionMonths: 600,
                              lumpSum,
                              lumpSumDate: result.analysisDate,
                              initialLumpSumAllocations: Object.fromEntries(
                                row.debts.map((debt) => [
                                  debt.debtId,
                                  debt.lumpSumApplied,
                                ]),
                              ),
                            })
                          }
                        >
                          Save scenario
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Debt-level reconciliation</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Debt</th>
                    <th className="py-2 pr-4 text-right">Current balance</th>
                    <th className="py-2 pr-4">Rate</th>
                    <th className="py-2 pr-4 text-right">Lump sum</th>
                    <th className="py-2 pr-4 text-right">Rollover received</th>
                    <th className="py-2 pr-4 text-right">Baseline interest</th>
                    <th className="py-2 pr-4 text-right">Strategy interest</th>
                    <th className="py-2 pr-4 text-right">Interest saved</th>
                    <th className="py-2 pr-4">Baseline payoff</th>
                    <th className="py-2 pr-4">Strategy payoff</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparisons[0]?.debts.map((debt) => {
                    const strategyDebt = result.comparisons[0]?.debts.find(
                      (item) => item.debtId === debt.debtId,
                    );
                    return (
                      <tr className="border-b border-slate-100" key={debt.debtId}>
                        <td className="py-2 pr-4">{debt.debtName}</td>
                        <td className="py-2 pr-4 text-right">
                          {money(debt.currentBalance)}
                        </td>
                        <td className="py-2 pr-4">{debt.rate}</td>
                        <td className="py-2 pr-4 text-right">
                          {money(debt.lumpSumApplied)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(debt.requiredPaymentRolloverReceived)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(debt.baselineProjectedInterest)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(strategyDebt?.projectedInterest ?? null)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(debt.interestSaved)}
                        </td>
                        <td className="py-2 pr-4">
                          {debt.baselinePayoffDate ?? 'Not reached'}
                        </td>
                        <td className="py-2 pr-4">
                          {debt.projectedPayoffDate ?? 'Not reached'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {[result.baseline, ...result.comparisons].map((row) => (
            <details
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              key={`${row.strategy}-trace`}
            >
              <summary className="cursor-pointer text-lg font-semibold">
                View allocation details — {row.strategyName}
              </summary>
              <p className="mt-2 text-sm text-slate-600">
                {row.strategy === 'baseline'
                  ? 'Required payments only; the lump sum is deliberately not applied.'
                  : (row.configurationMessage ??
                    `Projection horizon: ${row.projectionHorizonMonths ?? '—'} months through ${row.projectionHorizonDate ?? '—'}.`)}
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Month</th>
                      <th className="py-2 pr-4">Debt</th>
                      <th className="py-2 pr-4 text-right">Required</th>
                      <th className="py-2 pr-4 text-right">Lump sum</th>
                      <th className="py-2 pr-4 text-right">Extra</th>
                      <th className="py-2 pr-4 text-right">Freed rollover</th>
                      <th className="py-2 pr-4 text-right">Total payment</th>
                      <th className="py-2 pr-4 text-right">Ending balance</th>
                      <th className="py-2 pr-4 text-right">Interest</th>
                      <th className="py-2 pr-4">Payoff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.monthlySchedule.map((entry, index) => (
                      <tr
                        className="border-b border-slate-100"
                        key={`${row.strategy}-${entry.date}-${entry.debtName ?? 'portfolio'}-${index}`}
                      >
                        <td className="py-2 pr-4">{entry.date}</td>
                        <td className="py-2 pr-4">{entry.debtName ?? 'Portfolio'}</td>
                        <td className="py-2 pr-4 text-right">
                          {money(entry.requiredPayment)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(entry.lumpSumApplied)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(entry.extraMonthlyPayment)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(entry.freedPaymentRollover)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(entry.totalPayment)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(entry.endingBalance)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {money(entry.interest)}
                        </td>
                        <td className="py-2 pr-4">{entry.payoffEvent ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Projected total principal balance</h3>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {result.comparisons.map((row) => (
                <div className="rounded border p-3 text-sm" key={row.strategy}>
                  <p className="font-semibold">{row.strategyName}</p>
                  <p className="mt-1 text-slate-600">
                    {row.monthlySchedule.at(-1)?.date ?? '—'}:{' '}
                    {formatDollarString(
                      row.monthlySchedule.at(-1)?.totalProjectedBalance ?? '0.00',
                    )}
                  </p>
                  <div className="mt-2 h-2 rounded bg-slate-100">
                    <div
                      className="h-2 rounded bg-blue-700"
                      style={{
                        width: `${Math.max(0, Math.min(100, Number(row.monthlySchedule[0]?.totalProjectedBalance ?? 0) ? (Number(row.monthlySchedule.at(-1)?.totalProjectedBalance ?? 0) / Number(row.monthlySchedule[0]?.totalProjectedBalance ?? 1)) * 100 : 0))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Chart data
              </summary>
              <table className="mt-3 min-w-full text-sm">
                <tbody>
                  {result.comparisons.flatMap((row) =>
                    row.monthlySchedule.slice(0, 12).map((point) => (
                      <tr key={`${row.strategy}-${point.date}`}>
                        <td className="py-1 pr-4">{point.date}</td>
                        <td className="py-1 pr-4">{row.strategyName}</td>
                        <td className="py-1 text-right">
                          {formatDollarString(point.totalProjectedBalance)}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </details>
          </section>
        </>
      ) : null}
    </div>
  );
};
