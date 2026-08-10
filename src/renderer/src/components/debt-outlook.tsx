import { useState } from 'react';
import type { DebtOutlookDto, PayoffScenarioDto } from '../../../shared/debt-contracts';
import { buildChartScale } from './chart-helpers';
import { formatDollarString } from './display-format';

export interface DebtOutlookProps {
  readonly outlook: DebtOutlookDto;
  readonly scenarios: readonly PayoffScenarioDto[];
  readonly selectedScenarioId: string | null;
  readonly onScenarioChange: (scenarioId: string | null) => void;
  readonly onSelectDebt: (debtId: string) => void;
}

const amount = (value: string): number => Number(value.replaceAll(',', '')) || 0;
const money = (value: string | number): string =>
  formatDollarString(typeof value === 'number' ? value.toFixed(2) : value);
const monthLabel = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));

const OutlookChart = ({
  outlook,
}: {
  readonly outlook: DebtOutlookDto;
}): React.JSX.Element => {
  const width = 900;
  const height = 340;
  const left = 78;
  const right = 22;
  const top = 22;
  const bottom = 58;
  const chartHeight = height - top - bottom;
  const scale = buildChartScale({
    values: outlook.months.map((month) => amount(month.totalDebtService)),
    chartHeight,
    includeZero: true,
    formatLabel: money,
  });
  const slot = (width - left - right) / 12;
  const y = (value: number): number =>
    height -
    bottom -
    ((value - scale.minimum) / Math.max(1, scale.maximum - scale.minimum)) *
      chartHeight;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <svg
        aria-label="12-month projected debt service. Hover bars for monthly values."
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
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              fill="#475569"
              fontSize="11"
              textAnchor="end"
              x={left - 8}
              y={y(tick) + 4}
            >
              {money(tick)}
            </text>
          </g>
        ))}
        {outlook.months.map((month, index) => {
          const required = amount(month.requiredPayments);
          const extra = amount(month.plannedExtraPayments);
          const baseY = y(0);
          const requiredHeight = Math.max(0, baseY - y(required));
          const extraHeight = Math.max(0, baseY - y(required + extra) - requiredHeight);
          const x = left + index * slot + slot * 0.16;
          return (
            <g key={month.month}>
              <rect
                fill="#2563eb"
                height={requiredHeight}
                width={slot * 0.68}
                x={x}
                y={baseY - requiredHeight}
              >
                <title>{`${monthLabel(month.month)} — Required payments ${money(required)}, Extra payments ${money(extra)}, Total debt service ${money(required + extra)}`}</title>
              </rect>
              {extra > 0 ? (
                <rect
                  fill="#d97706"
                  height={extraHeight}
                  width={slot * 0.68}
                  x={x}
                  y={baseY - requiredHeight - extraHeight}
                >
                  <title>{`${monthLabel(month.month)} — Required payments ${money(required)}, Extra payments ${money(extra)}, Total debt service ${money(required + extra)}`}</title>
                </rect>
              ) : null}
              <text
                fill="#475569"
                fontSize="11"
                textAnchor="middle"
                x={x + slot * 0.34}
                y={height - 24}
              >
                {monthLabel(month.month)}
              </text>
            </g>
          );
        })}
        <line stroke="#94a3b8" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span>
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-600" />
          Required payments
        </span>
        <span>
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-600" />
          Planned extra payments
        </span>
      </div>
    </div>
  );
};

export const DebtOutlook = ({
  outlook,
  scenarios,
  selectedScenarioId,
  onScenarioChange,
  onSelectDebt,
}: DebtOutlookProps): React.JSX.Element => {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(
    outlook.months[0]?.month ?? null,
  );
  const summary = [
    ['Required debt service', money(outlook.requiredPaymentsTotal)],
    ['Planned extra payments', money(outlook.plannedExtraPaymentsTotal)],
    ['Total planned service', money(outlook.totalPlannedDebtService)],
    ['Average monthly service', money(outlook.averageMonthlyDebtService)],
    [
      'Highest-payment month',
      `${monthLabel(outlook.highestPaymentMonth.month)} · ${money(outlook.highestPaymentMonth.amount)}`,
    ],
    [
      'Lowest-payment month',
      `${monthLabel(outlook.lowestPaymentMonth.month)} · ${money(outlook.lowestPaymentMonth.amount)}`,
    ],
    ['Projected debt payoffs', String(outlook.projectedDebtPayoffCount)],
  ];
  return (
    <section aria-labelledby="debt-outlook-heading" className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <p className="text-sm font-medium text-slate-500">Forward planning</p>
        <h2
          className="mt-1 text-3xl font-semibold tracking-tight"
          id="debt-outlook-heading"
        >
          Debt outlook
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Expected debt cash requirements for the 12 calendar months beginning{' '}
          {monthLabel(outlook.months[0]!.month)}. Revolving-debt amounts use recorded
          required payments only; future purchases, draws, and changing statement
          minimums are not forecast.
        </p>
        <label className="mt-5 block max-w-md text-sm font-semibold text-slate-700">
          Planning basis
          <select
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
            onChange={(event) => onScenarioChange(event.target.value || null)}
            value={selectedScenarioId ?? ''}
          >
            <option value="">Required payments only</option>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">
          {outlook.scenario.name} · calculated as of {outlook.effectiveDate}
        </p>
      </div>

      <section
        aria-label="Debt outlook summary"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {summary.map(([label, value]) => (
          <div
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {label}
            </p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="debt-service-chart-heading" className="space-y-3">
        <h3 className="text-xl font-semibold" id="debt-service-chart-heading">
          Monthly debt service
        </h3>
        <OutlookChart outlook={outlook} />
      </section>

      {outlook.warnings.length > 0 ? (
        <aside className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Scheduling review</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {outlook.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      <section aria-labelledby="monthly-detail-heading" className="space-y-3">
        <h3 className="text-xl font-semibold" id="monthly-detail-heading">
          Monthly detail
        </h3>
        {outlook.months.map((month) => (
          <details
            className="rounded-lg border border-slate-200 bg-white"
            key={month.month}
            open={expandedMonth === month.month}
          >
            <summary
              className="cursor-pointer list-none px-4 py-3 font-semibold"
              onClick={(event) => {
                event.preventDefault();
                setExpandedMonth(expandedMonth === month.month ? null : month.month);
              }}
            >
              <span className="mr-3">{monthLabel(month.month)}</span>
              <span className="text-sm font-normal text-slate-600">
                {money(month.totalDebtService)} total · {month.details.length} scheduled
                debts
              </span>
            </summary>
            {month.details.length > 0 ? (
              <div className="overflow-x-auto px-4 pb-4">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-2 py-2">Debt</th>
                      <th className="px-2 py-2">Due</th>
                      <th className="px-2 py-2 text-right">Required</th>
                      <th className="px-2 py-2 text-right">Extra</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2 text-right">Ending balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {month.details.map((detail) => (
                      <tr className="border-t border-slate-100" key={detail.debtId}>
                        <td className="px-2 py-2">
                          <button
                            className="font-semibold text-blue-700 hover:underline"
                            onClick={() => onSelectDebt(detail.debtId)}
                            type="button"
                          >
                            {detail.debtName}
                          </button>
                        </td>
                        <td className="px-2 py-2">{detail.dueDate}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {money(detail.requiredPayment)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {money(detail.plannedExtraPayment)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {money(detail.totalPlannedPayment)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {detail.projectedEndingBalance
                            ? money(detail.projectedEndingBalance)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 pb-4 text-sm text-slate-600">
                No scheduled payments projected.
              </p>
            )}
          </details>
        ))}
      </section>

      <section
        aria-labelledby="upcoming-debt-events-heading"
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h3 className="text-xl font-semibold" id="upcoming-debt-events-heading">
          Upcoming debt events
        </h3>
        {outlook.events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            No material debt events are projected in this window.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {outlook.events.map((event) => (
              <li
                className="border-l-2 border-slate-300 pl-4 text-sm"
                key={`${event.date}-${event.debtId}-${event.eventType}`}
              >
                <p className="font-semibold">
                  {event.date} · {event.eventType.replaceAll('_', ' ')}
                </p>
                <button
                  className="text-blue-700 hover:underline"
                  onClick={() => onSelectDebt(event.debtId)}
                  type="button"
                >
                  {event.debtName}
                </button>
                <p className="text-slate-600">{event.description}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
};
