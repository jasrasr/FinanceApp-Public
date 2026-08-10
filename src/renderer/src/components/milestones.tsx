import { useMemo, useState } from 'react';
import type { MilestonesDto, PayoffScenarioDto } from '../../../shared/debt-contracts';
import {
  buildChartScale,
  buildPayoffChartTickIndexes,
  debtSeriesColor,
} from './chart-helpers';
import { formatDollarString } from './display-format';

export interface MilestonesProps {
  readonly milestones: MilestonesDto;
  readonly scenarios: readonly PayoffScenarioDto[];
  readonly selectedScenarioId: string | null;
  readonly onScenarioChange: (scenarioId: string | null) => void;
  readonly onSelectDebt: (debtId: string) => void;
}

const amount = (value: string): number => Number(value.replaceAll(',', '')) || 0;
const dateLabel = (value: string): string =>
  value.length === 4 ? value : value.slice(0, 7);
const money = (value: number): string => formatDollarString(value.toFixed(2));

type Line = {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly values: readonly number[];
};

const LineChart = ({
  ariaLabel,
  dates,
  lines,
}: {
  readonly ariaLabel: string;
  readonly dates: readonly string[];
  readonly lines: readonly Line[];
}): React.JSX.Element => {
  const [visible, setVisible] = useState<readonly string[]>(
    lines.map((line) => line.key),
  );
  const activeLines = lines.filter((line) => visible.includes(line.key));
  const width = 860;
  const height = 290;
  const left = 84;
  const right = 24;
  const top = 24;
  const bottom = 52;
  const chartHeight = height - top - bottom;
  const scale = buildChartScale({
    values: activeLines.flatMap((line) => line.values),
    chartHeight,
    includeZero: true,
    allowExcludeZero: false,
    formatLabel: (value) => money(value),
  });
  const x = (index: number): number =>
    dates.length <= 1
      ? left
      : left + (index * (width - left - right)) / (dates.length - 1);
  const y = (value: number): number =>
    height -
    bottom -
    ((value - scale.minimum) / Math.max(1, scale.maximum - scale.minimum)) *
      chartHeight;
  const tickIndexes = buildPayoffChartTickIndexes(dates);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap gap-2" aria-label={`${ariaLabel} controls`}>
        {lines.map((line) => (
          <button
            aria-pressed={visible.includes(line.key)}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold"
            key={line.key}
            onClick={() =>
              setVisible((current) =>
                current.includes(line.key)
                  ? current.filter((key) => key !== line.key)
                  : [...current, line.key],
              )
            }
            type="button"
          >
            <span
              className="mr-2 inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: line.color }}
            />
            {line.label}
          </button>
        ))}
      </div>
      {activeLines.length === 0 || dates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          Select a series to view this chart.
        </p>
      ) : (
        <svg
          aria-label={`${ariaLabel}. Hover points for values.`}
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
          <line
            stroke="#94a3b8"
            x1={left}
            x2={width - right}
            y1={height - bottom}
            y2={height - bottom}
          />
          {tickIndexes.map((index) => (
            <text
              fill="#475569"
              fontSize="11"
              key={dates[index]}
              textAnchor="middle"
              x={x(index)}
              y={height - 22}
            >
              {dateLabel(dates[index]!)}
            </text>
          ))}
          {activeLines.map((line) => (
            <g key={line.key}>
              {line.values
                .reduce<number[][]>((segments, value, index) => {
                  if (!Number.isFinite(value)) return segments;
                  const segment = segments.at(-1);
                  if (segment && segment.at(-1) === index - 1) segment.push(index);
                  else segments.push([index]);
                  return segments;
                }, [])
                .map((segment, segmentIndex) => (
                  <polyline
                    fill="none"
                    key={`${line.key}-segment-${segmentIndex}`}
                    points={segment
                      .map((index) => `${x(index)},${y(line.values[index]!)}`)
                      .join(' ')}
                    stroke={line.color}
                    strokeWidth="3"
                  />
                ))}
              {line.values.map((value, index) =>
                Number.isFinite(value) ? (
                  <circle
                    cx={x(index)}
                    cy={y(value)}
                    fill={line.color}
                    key={`${line.key}-${dates[index]}`}
                    r="3"
                  >
                    <title>{`${line.label}: ${money(value)} on ${dates[index]}`}</title>
                  </circle>
                ) : null,
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
};

const AnnualBarChart = ({
  ariaLabel,
  rows,
}: {
  readonly ariaLabel: string;
  readonly rows: readonly { readonly year: string; readonly amount: string }[];
}): React.JSX.Element => {
  const width = 860;
  const height = 260;
  const left = 70;
  const right = 24;
  const top = 24;
  const bottom = 48;
  const chartHeight = height - top - bottom;
  const values = rows.map((row) => amount(row.amount));
  const scale = buildChartScale({
    values,
    chartHeight,
    includeZero: true,
    formatLabel: money,
  });
  const slot = rows.length ? (width - left - right) / rows.length : 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">No annual activity is available.</p>
      ) : (
        <svg
          aria-label={`${ariaLabel}. Hover bars for values.`}
          className="h-auto w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {scale.tickValues.map((tick) => {
            const y =
              height -
              bottom -
              ((tick - scale.minimum) / Math.max(1, scale.maximum - scale.minimum)) *
                chartHeight;
            return (
              <g key={tick}>
                <line stroke="#e2e8f0" x1={left} x2={width - right} y1={y} y2={y} />
                <text
                  fill="#475569"
                  fontSize="11"
                  textAnchor="end"
                  x={left - 8}
                  y={y + 4}
                >
                  {money(tick)}
                </text>
              </g>
            );
          })}
          {rows.map((row, index) => {
            const value = amount(row.amount);
            const barHeight =
              ((value - scale.minimum) / Math.max(1, scale.maximum - scale.minimum)) *
              chartHeight;
            const barY = height - bottom - barHeight;
            return (
              <g key={row.year}>
                <rect
                  fill={debtSeriesColor(index)}
                  height={barHeight}
                  width={Math.max(8, slot * 0.62)}
                  x={left + index * slot + slot * 0.19}
                  y={barY}
                >
                  <title>{`${row.year}: ${money(value)}`}</title>
                </rect>
                <text
                  fill="#475569"
                  fontSize="11"
                  textAnchor="middle"
                  x={left + index * slot + slot / 2}
                  y={height - 22}
                >
                  {row.year}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};

export const Milestones = ({
  milestones,
  scenarios,
  selectedScenarioId,
  onScenarioChange,
  onSelectDebt,
}: MilestonesProps): React.JSX.Element => {
  const historyDates = milestones.balanceHistory.map((point) => point.date);
  const scenarioDates = milestones.scenarioComparison.map((point) => point.date);
  const historyLines = useMemo(
    () => [
      {
        key: 'total',
        label: 'Total principal',
        color: '#1d4ed8',
        values: milestones.balanceHistory.map((point) =>
          amount(point.totalPrincipalBalance),
        ),
      },
      {
        key: 'mortgage',
        label: 'Mortgage',
        color: '#047857',
        values: milestones.balanceHistory.map((point) =>
          amount(point.mortgagePrincipalBalance),
        ),
      },
      {
        key: 'nonmortgage',
        label: 'Nonmortgage',
        color: '#b45309',
        values: milestones.balanceHistory.map((point) =>
          amount(point.nonmortgagePrincipalBalance),
        ),
      },
    ],
    [milestones.balanceHistory],
  );
  const scenarioLines = [
    {
      key: 'actual',
      label: 'Actual',
      color: '#1d4ed8',
      values: milestones.scenarioComparison.map((point) =>
        point.actualPrincipalBalance === null
          ? NaN
          : amount(point.actualPrincipalBalance),
      ),
    },
    {
      key: 'projected',
      label: 'Projected scenario',
      color: '#be123c',
      values: milestones.scenarioComparison.map((point) =>
        point.projectedPrincipalBalance === null
          ? NaN
          : amount(point.projectedPrincipalBalance),
      ),
    },
  ];

  return (
    <section aria-labelledby="milestones-heading" className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <p className="text-sm font-medium text-slate-500">Payoff progress</p>
        <h2
          className="mt-1 text-3xl font-semibold tracking-tight"
          id="milestones-heading"
        >
          Debt payoff milestones
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Visual progress from {milestones.trackingStartDate} through{' '}
          {milestones.effectiveDate}. Actual balances and projections remain separate.
        </p>
        <label className="mt-5 block max-w-md text-sm font-semibold text-slate-700">
          Saved payoff scenario for comparison
          <select
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
            onChange={(event) => onScenarioChange(event.target.value || null)}
            value={selectedScenarioId ?? ''}
          >
            <option value="">No scenario selected</option>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section
        aria-label="Payoff milestone summary"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          ['Total reduced', money(amount(milestones.totalDebtReducedSinceTracking))],
          ['Reduced YTD', money(amount(milestones.debtReducedYtd))],
          ['Starting debt remaining', milestones.percentageStartingDebtRemaining],
          ['Interest paid YTD', money(amount(milestones.interestPaidYtd))],
          ['Mortgage reduced', money(amount(milestones.mortgageDebtReduced))],
          ['Nonmortgage reduced', money(amount(milestones.nonmortgageDebtReduced))],
          [
            'Current credit utilization',
            milestones.currentCreditUtilization ?? 'Not available',
          ],
          ['Utilization change', milestones.creditUtilizationChange ?? 'Not available'],
        ].map(([label, value]) => (
          <div
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section
        aria-label="Projected payoff milestones"
        className="grid gap-4 md:grid-cols-3"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold">Next projected payoff</p>
          {milestones.nextProjectedDebtPayoff ? (
            <button
              className="mt-2 text-left font-semibold underline"
              onClick={() => onSelectDebt(milestones.nextProjectedDebtPayoff!.debtId)}
              type="button"
            >
              {milestones.nextProjectedDebtPayoff.debtName} ·{' '}
              {milestones.nextProjectedDebtPayoff.projectedPayoffDate}
            </button>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Select a saved scenario to see the next payoff.
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold">Next $10,000 reduction</p>
          <p className="mt-2 text-2xl font-semibold">
            {money(amount(milestones.nextDebtReductionMilestone))}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {milestones.nextDebtReductionMilestoneDate ??
              'Select a saved scenario for a projected date.'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold">Scenario interest saved</p>
          <p className="mt-2 text-2xl font-semibold">
            {milestones.interestSavedFromSelectedScenario === null
              ? '—'
              : money(amount(milestones.interestSavedFromSelectedScenario))}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {milestones.selectedScenario?.name ?? 'No saved scenario selected.'}
          </p>
        </div>
      </section>

      <section className="space-y-3" aria-label="Payoff progress charts">
        <h3 className="text-xl font-semibold">Principal balance over time</h3>
        <LineChart
          ariaLabel="Total principal balance over time"
          dates={historyDates}
          lines={[historyLines[0]!]}
        />
        <h3 className="pt-3 text-xl font-semibold">Mortgage vs nonmortgage balances</h3>
        <LineChart
          ariaLabel="Mortgage versus nonmortgage principal balances over time"
          dates={historyDates}
          lines={historyLines.slice(1)}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-xl font-semibold">Annual principal reduction</h3>
            <AnnualBarChart
              ariaLabel="Annual principal reduction"
              rows={milestones.annualPrincipalReduction}
            />
          </div>
          <div>
            <h3 className="mb-3 text-xl font-semibold">Annual interest paid</h3>
            <AnnualBarChart
              ariaLabel="Annual interest paid"
              rows={milestones.annualInterestPaid}
            />
          </div>
        </div>
        <h3 className="pt-3 text-xl font-semibold">
          Actual vs selected payoff scenario
        </h3>
        {selectedScenarioId ? (
          <LineChart
            ariaLabel="Actual total principal balance versus selected payoff scenario"
            dates={scenarioDates}
            lines={scenarioLines}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Select a saved payoff scenario to compare projected balances with actual
            principal.
          </p>
        )}
      </section>
    </section>
  );
};
