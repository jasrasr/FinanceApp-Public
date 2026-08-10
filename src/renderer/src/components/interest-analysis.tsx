import { useMemo, useState } from 'react';
import type {
  GetInterestAnalysisRequest,
  InterestAnalysisDto,
} from '../../../shared/debt-contracts';
import { buildChartScale } from './chart-helpers';
import { formatDollarString } from './display-format';

export interface InterestAnalysisProps {
  readonly analysis: InterestAnalysisDto;
  readonly onFiltersChange: (filters: GetInterestAnalysisRequest) => void;
  readonly onSelectDebt: (debtId: string) => void;
}

const amount = (value: string | null): number =>
  value === null ? 0 : Number(value.replaceAll(',', '')) || 0;
const money = (value: string | null): string =>
  value === null ? '—' : formatDollarString(value);
const rate = (value: string): string =>
  value.trim().endsWith('%') ? value.trim() : `${value.trim()}%`;
const freedUpPaymentsExplanation =
  'Interest saved from freed-up payments is additional interest avoided on later debts when required payments from paid-off debts are redirected.';

type SortKey =
  | 'projectedRemainingInterest'
  | 'currentInterestRate'
  | 'interestPaidYtd'
  | 'shareOfPortfolioInterest'
  | 'lumpSumSavings'
  | 'monthlySavings';

const HorizontalBarChart = ({
  title,
  rows,
  value,
  tooltip,
}: {
  readonly title: string;
  readonly rows: readonly InterestAnalysisDto['rows'][number][];
  readonly value: (row: InterestAnalysisDto['rows'][number]) => number;
  readonly tooltip: (row: InterestAnalysisDto['rows'][number]) => string;
}): React.JSX.Element => {
  const width = 900;
  const left = 190;
  const right = 72;
  const top = 22;
  const rowHeight = 34;
  const bottom = 34;
  const scale = buildChartScale({
    values: rows.map(value),
    chartHeight: Math.max(120, rows.length * rowHeight),
    includeZero: true,
    formatLabel: (tick) => formatDollarString(tick.toFixed(2)),
  });
  const chartWidth = width - left - right;
  const x = (number: number): number =>
    left +
    ((number - scale.minimum) / Math.max(1, scale.maximum - scale.minimum)) *
      chartWidth;
  const height = top + Math.max(120, rows.length * rowHeight) + bottom;
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="mb-3 text-lg font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          No matching active positive-balance debts.
        </p>
      ) : (
        <svg
          aria-label={`${title}. Hover bars for values.`}
          className="h-auto w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {scale.tickValues.map((tick) => (
            <g key={tick}>
              <line
                stroke="#e2e8f0"
                x1={x(tick)}
                x2={x(tick)}
                y1={top}
                y2={height - bottom}
              />
              <text
                fill="#475569"
                fontSize="11"
                textAnchor="middle"
                x={x(tick)}
                y={height - 12}
              >
                {formatDollarString(tick.toFixed(0))}
              </text>
            </g>
          ))}
          {rows.map((row, index) => {
            const numericValue = Math.max(0, value(row));
            const y = top + index * rowHeight + 5;
            return (
              <g key={row.debtId}>
                <text
                  fill="#334155"
                  fontSize="12"
                  textAnchor="end"
                  x={left - 10}
                  y={y + 15}
                >
                  {row.debtName}
                </text>
                <rect
                  fill="#2563eb"
                  height="20"
                  width={Math.max(0, x(numericValue) - x(0))}
                  x={x(0)}
                  y={y}
                >
                  <title>{tooltip(row)}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
};

export const InterestAnalysis = ({
  analysis,
  onFiltersChange,
  onSelectDebt,
}: InterestAnalysisProps): React.JSX.Element => {
  const [sortKey, setSortKey] = useState<SortKey>('projectedRemainingInterest');
  const rows = useMemo(() => {
    const numeric = (row: InterestAnalysisDto['rows'][number]): number => {
      if (sortKey === 'currentInterestRate')
        return Number(row.currentInterestRate.replace('%', ''));
      if (sortKey === 'interestPaidYtd') return amount(row.interestPaidYtd);
      if (sortKey === 'shareOfPortfolioInterest')
        return Number(row.shareOfPortfolioInterest.replace('%', ''));
      if (sortKey === 'lumpSumSavings')
        return amount(row.lumpSumSavings.totalInterestSaved);
      if (sortKey === 'monthlySavings')
        return amount(row.monthlySavings.totalInterestSaved);
      return amount(row.projectedRemainingInterest);
    };
    return [...analysis.rows].sort((left, right) => numeric(right) - numeric(left));
  }, [analysis.rows, sortKey]);
  const selectFilter = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    onFiltersChange({
      debtType:
        event.target.value === ''
          ? null
          : (event.target.value as GetInterestAnalysisRequest['debtType']),
      segment: analysis.filters.segment,
    });
  };
  const selectSegment = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    onFiltersChange({
      debtType: analysis.filters.debtType,
      segment: event.target.value as GetInterestAnalysisRequest['segment'],
    });
  };
  const interpretationValue = (
    item: InterestAnalysisDto['interpretations'][number],
  ): string =>
    item.label === 'Highest current rate' ? rate(item.value) : money(item.value);
  return (
    <section aria-labelledby="interest-analysis-heading" className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <p className="text-sm font-medium text-slate-500">Decision analysis</p>
        <h2
          className="mt-1 text-3xl font-semibold tracking-tight"
          id="interest-analysis-heading"
        >
          Interest-cost concentration
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Compare current rates, actual year-to-date interest, projected
          required-payment interest, and individually tested extra-payment
          opportunities. All values are read-only projections and do not post ledger
          activity.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Debt type
            <select
              aria-label="Debt type filter"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={selectFilter}
              value={analysis.filters.debtType ?? ''}
            >
              <option value="">All debt types</option>
              {[
                'mortgage',
                'heloc',
                'auto',
                'student',
                'personal',
                'business',
                'credit_card',
                'medical',
                'tax',
                'other',
              ].map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Portfolio segment
            <select
              aria-label="Portfolio segment filter"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-normal"
              onChange={selectSegment}
              value={analysis.filters.segment}
            >
              <option value="all">All debts</option>
              <option value="mortgage">Mortgage</option>
              <option value="nonmortgage">Nonmortgage</option>
              <option value="revolving">Revolving</option>
              <option value="installment">Installment</option>
            </select>
          </label>
        </div>
      </div>

      <section
        aria-label="Interest analysis interpretations"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {analysis.interpretations.map((item) => (
          <div
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            key={item.label}
          >
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {item.label}
            </p>
            {item.debtId ? (
              <button
                className="mt-2 text-left text-lg font-semibold text-blue-700 hover:underline"
                onClick={() => onSelectDebt(item.debtId!)}
                type="button"
              >
                {item.debtName}
              </button>
            ) : (
              <p className="mt-2 text-lg font-semibold">{interpretationValue(item)}</p>
            )}
            <p className="mt-1 text-sm text-slate-600">{interpretationValue(item)}</p>
          </div>
        ))}
      </section>

      <HorizontalBarChart
        rows={rows}
        title="Projected remaining interest"
        tooltip={(row) =>
          `${row.debtName} — Current rate ${rate(row.currentInterestRate)}; Projected remaining interest ${money(row.projectedRemainingInterest)}; Share ${row.shareOfPortfolioInterest}`
        }
        value={(row) => amount(row.projectedRemainingInterest)}
      />
      <HorizontalBarChart
        rows={[...rows].sort(
          (left, right) =>
            amount(right.lumpSumSavings.totalInterestSaved) -
            amount(left.lumpSumSavings.totalInterestSaved),
        )}
        title="$1,000 lump-sum interest savings"
        tooltip={(row) =>
          `${row.debtName} — Lump sum applied ${money(row.lumpSumSavings.appliedAmount)}; Direct interest saved ${money(row.lumpSumSavings.directInterestSaved)}; Interest saved from freed-up payments ${money(row.lumpSumSavings.redirectedInterestSaved)}; Total interest saved ${money(row.lumpSumSavings.totalInterestSaved)}`
        }
        value={(row) => amount(row.lumpSumSavings.totalInterestSaved)}
      />
      <HorizontalBarChart
        rows={[...rows].sort(
          (left, right) =>
            amount(right.monthlySavings.totalInterestSaved) -
            amount(left.monthlySavings.totalInterestSaved),
        )}
        title="$100/month interest savings"
        tooltip={(row) =>
          `${row.debtName} — Monthly extra ${money(row.monthlySavings.appliedAmount)}; Direct interest saved ${money(row.monthlySavings.directInterestSaved)}; Interest saved from freed-up payments ${money(row.monthlySavings.redirectedInterestSaved)}; Total interest saved ${money(row.monthlySavings.totalInterestSaved)}; Months saved ${row.monthlySavings.monthsSaved ?? 'not available'}`
        }
        value={(row) => amount(row.monthlySavings.totalInterestSaved)}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Debt interest ranking</h3>
            <p className="mt-1 text-sm text-slate-600">
              Baseline portfolio projected interest:{' '}
              {money(analysis.baselinePortfolioInterest)} · baseline payoff{' '}
              {analysis.baselinePortfolioPayoffDate ?? 'not within horizon'}
            </p>
          </div>
          <label className="text-sm font-semibold">
            Rank by
            <select
              aria-label="Interest ranking"
              className="ml-2 rounded-md border border-slate-300 px-2 py-1 font-normal"
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              value={sortKey}
            >
              <option value="projectedRemainingInterest">
                Projected remaining interest
              </option>
              <option value="currentInterestRate">Current rate</option>
              <option value="interestPaidYtd">Interest paid YTD</option>
              <option value="shareOfPortfolioInterest">Portfolio interest share</option>
              <option value="lumpSumSavings">$1,000 lump-sum savings</option>
              <option value="monthlySavings">$100/month savings</option>
            </select>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1400px] text-sm">
            <thead className="border-b text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-2 py-2">Debt</th>
                <th className="px-2 py-2 text-right">Balance</th>
                <th className="px-2 py-2 text-right">Rate</th>
                <th className="px-2 py-2 text-right">Interest YTD</th>
                <th className="px-2 py-2 text-right">Projected interest</th>
                <th className="px-2 py-2 text-right">Share</th>
                <th className="px-2 py-2 text-right">$1,000 saved</th>
                <th className="px-2 py-2 text-right">$100/mo saved</th>
                <th className="px-2 py-2">Baseline payoff</th>
                <th className="px-2 py-2">Tested payoffs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-slate-100" key={row.debtId}>
                  <td className="px-2 py-2">
                    <button
                      className="font-semibold text-blue-700 hover:underline"
                      onClick={() => onSelectDebt(row.debtId)}
                      type="button"
                    >
                      {row.debtName}
                    </button>
                    <span className="ml-2 text-xs text-slate-500">{row.debtType}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {money(row.currentBalance)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {rate(row.currentInterestRate)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {money(row.interestPaidYtd)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {money(row.projectedRemainingInterest)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {row.shareOfPortfolioInterest}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {money(row.lumpSumSavings.totalInterestSaved)}
                    <br />
                    <span className="text-xs text-slate-500">
                      direct {money(row.lumpSumSavings.directInterestSaved)} /
                      <span title={freedUpPaymentsExplanation}>
                        freed-up {money(row.lumpSumSavings.redirectedInterestSaved)}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {money(row.monthlySavings.totalInterestSaved)}
                    <br />
                    <span className="text-xs text-slate-500">
                      direct {money(row.monthlySavings.directInterestSaved)} /
                      <span title={freedUpPaymentsExplanation}>
                        freed-up {money(row.monthlySavings.redirectedInterestSaved)}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {row.baselinePayoffDate ?? 'Not within horizon'}
                  </td>
                  <td className="px-2 py-2">
                    $1,000 {row.lumpSumPayoffDate ?? '—'}
                    <br />
                    $100/mo {row.monthlyPayoffDate ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {analysis.warnings.length > 0 ? (
        <aside className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Projection notes</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {analysis.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      ) : null}
      <p className="text-xs text-slate-500">
        $100/month comparisons continue required payments on every debt and use the
        existing selected-debt rollover behavior after the tested debt is paid off.
        <span title={freedUpPaymentsExplanation}>
          Interest saved from freed-up payments
        </span>{' '}
        means additional interest avoided on later debts because required payments from
        paid-off debts are redirected. Direct savings describe the tested debt; total
        interest saved is direct savings plus freed-up-payment savings.
      </p>
    </section>
  );
};
