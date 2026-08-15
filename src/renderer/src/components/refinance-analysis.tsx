import { useState } from 'react';
import type {
  DebtSummaryDto,
  RefinanceAnalysisDto,
} from '../../../shared/debt-contracts';
import { formatDollarString } from './display-format';

type Props = {
  debts: readonly DebtSummaryDto[];
  analysis: RefinanceAnalysisDto | null;
  loading: boolean;
  error: string | null;
  onCalculate: (request: {
    debtId: string;
    refinanceDate: string;
    newPrincipal: string;
    newAnnualInterestRatePercent: string;
    newTermMonths: number;
    newRequiredPayment: string | null;
    cashClosingCosts: string | null;
    financedClosingCosts: string | null;
    cashOutAmount: string | null;
    newMaturityDate: string | null;
    newRateType: 'fixed' | 'variable' | 'zero';
    maxProjectionMonths: number;
  }) => void;
};
const money = (value: string): string => formatDollarString(value);
const Chart = ({
  analysis,
  kind,
}: {
  analysis: RefinanceAnalysisDto;
  kind: 'balance' | 'cash';
}): React.JSX.Element => {
  const current = analysis.current.series;
  const replacement = analysis.refinance.series;
  const values = [...current, ...replacement].map((point) =>
    Number(point[kind === 'balance' ? 'balance' : 'cumulativeCashOutflow']),
  );
  const max = Math.max(1, ...values);
  const width = 900;
  const height = 250;
  const line = (series: typeof current, color: string): React.JSX.Element => (
    <polyline
      fill="none"
      stroke={color}
      strokeWidth="3"
      points={series
        .map(
          (point, index) =>
            `${(index / Math.max(1, series.length - 1)) * width},${height - (Number(point[kind === 'balance' ? 'balance' : 'cumulativeCashOutflow']) / max) * (height - 25)}`,
        )
        .join(' ')}
    />
  );
  const points = (
    series: typeof current,
    color: string,
    label: string,
  ): React.JSX.Element[] =>
    series.map((point, index) => {
      const x = (index / Math.max(1, series.length - 1)) * width;
      const value = Number(
        point[kind === 'balance' ? 'balance' : 'cumulativeCashOutflow'],
      );
      const y = height - (value / max) * (height - 25);
      return (
        <circle key={`${label}-${point.date}`} cx={x} cy={y} fill={color} r="4">
          <title>{`${point.date} · ${label} · ${money(value.toFixed(2))}`}</title>
        </circle>
      );
    });
  return (
    <div className="overflow-x-auto">
      <svg
        aria-label={
          kind === 'balance' ? 'Principal balance over time' : 'Cumulative cash outflow'
        }
        className="h-64 min-w-[700px] w-full"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
      >
        <line stroke="#cbd5e1" x1="0" x2={width} y1={height - 1} y2={height - 1} />
        {line(current, '#2563eb')}
        {line(replacement, '#d97706')}
        {points(current, '#2563eb', 'Keep current debt')}
        {points(replacement, '#d97706', 'Refinance')}
        {kind === 'cash' && analysis.breakEvenMonth !== null ? (
          <line
            stroke="#15803d"
            strokeDasharray="5 4"
            x1={
              (Math.min(analysis.breakEvenMonth - 1, replacement.length - 1) /
                Math.max(1, replacement.length - 1)) *
              width
            }
            x2={
              (Math.min(analysis.breakEvenMonth - 1, replacement.length - 1) /
                Math.max(1, replacement.length - 1)) *
              width
            }
            y1="0"
            y2={height}
          />
        ) : null}
        <text fill="#475569" x="8" y="20">
          {money(max.toFixed(2))}
        </text>
        <text fill="#475569" x="8" y={height - 5}>
          $0.00
        </text>
        <text fill="#475569" x="0" y={height - 5}>
          {current[0]?.date}
        </text>
        <text fill="#475569" textAnchor="end" x={width} y={height - 5}>
          {current.at(-1)?.date}
        </text>
      </svg>
      <div className="flex gap-5 text-xs text-slate-600">
        <span>
          <i className="mr-1 inline-block h-2 w-5 bg-blue-600" />
          Keep current debt
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-5 bg-amber-600" />
          Refinance
        </span>
      </div>
    </div>
  );
};
export const RefinanceAnalysis = ({
  debts,
  analysis,
  loading,
  error,
  onCalculate,
}: Props): React.JSX.Element => {
  const [debtId, setDebtId] = useState(debts[0]?.id ?? '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('360');
  const [payment, setPayment] = useState('');
  const [cashCosts, setCashCosts] = useState('0');
  const [financed, setFinanced] = useState('0');
  const [cashOut, setCashOut] = useState('0');
  return (
    <section aria-labelledby="refinance-analysis-heading" className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Read-only decision support</p>
        <h2 id="refinance-analysis-heading" className="mt-1 text-3xl font-semibold">
          Refinance analysis
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Compare the selected debt with a proposed replacement. Nothing is posted or
          changed.
        </p>
      </div>
      <form
        className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCalculate({
            debtId,
            refinanceDate: date,
            newPrincipal: principal,
            newAnnualInterestRatePercent: rate,
            newTermMonths: Number(term),
            newRequiredPayment: payment || null,
            cashClosingCosts: cashCosts || null,
            financedClosingCosts: financed || null,
            cashOutAmount: cashOut || null,
            newMaturityDate: null,
            newRateType: 'fixed',
            maxProjectionMonths: 600,
          });
        }}
      >
        <label>
          Debt
          <select
            className="mt-1 w-full rounded border p-2"
            value={debtId}
            onChange={(event) => setDebtId(event.target.value)}
          >
            {debts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {debt.name} · {debt.creditor}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proposed refinance date
          <input
            className="mt-1 w-full rounded border p-2"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          New principal
          <input
            required
            className="mt-1 w-full rounded border p-2"
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
            placeholder="0.00"
          />
        </label>
        <label>
          New annual rate
          <input
            required
            className="mt-1 w-full rounded border p-2"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            placeholder="6.25"
          />
        </label>
        <label>
          New term (months)
          <input
            required
            className="mt-1 w-full rounded border p-2"
            type="number"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </label>
        <label>
          New required payment (optional)
          <input
            className="mt-1 w-full rounded border p-2"
            value={payment}
            onChange={(event) => setPayment(event.target.value)}
            placeholder="Calculated if blank"
          />
        </label>
        <label>
          Cash closing costs
          <input
            className="mt-1 w-full rounded border p-2"
            value={cashCosts}
            onChange={(event) => setCashCosts(event.target.value)}
          />
        </label>
        <label>
          Financed closing costs
          <input
            className="mt-1 w-full rounded border p-2"
            value={financed}
            onChange={(event) => setFinanced(event.target.value)}
          />
        </label>
        <label>
          Cash-out proceeds
          <input
            className="mt-1 w-full rounded border p-2"
            value={cashOut}
            onChange={(event) => setCashOut(event.target.value)}
          />
        </label>
        <div className="md:col-span-3">
          <button
            className="rounded bg-slate-900 px-4 py-2 font-semibold text-white"
            type="submit"
          >
            Calculate comparison
          </button>
        </div>
      </form>
      {loading ? (
        <p>Calculating…</p>
      ) : error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3">
          {error}
        </p>
      ) : analysis ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Comparison
              title="Keep current debt"
              rows={[
                ['Current balance', analysis.current.balance],
                ['Current rate', `${analysis.current.rate}%`],
                ['Required payment', money(analysis.current.requiredPayment)],
                ['Projected payoff', analysis.current.payoffDate ?? 'Beyond horizon'],
                [
                  'Projected interest',
                  analysis.current.projectedInterest
                    ? money(analysis.current.projectedInterest)
                    : 'Not available',
                ],
              ]}
            />
            <Comparison
              title="Refinance / replace debt"
              rows={[
                ['New principal', money(analysis.refinance.principal)],
                ['New rate', `${analysis.refinance.rate}%`],
                ['New payment', money(analysis.refinance.requiredPayment)],
                ['Projected payoff', analysis.refinance.payoffDate ?? 'Beyond horizon'],
                [
                  'Projected interest',
                  analysis.refinance.projectedInterest
                    ? money(analysis.refinance.projectedInterest)
                    : 'Not available',
                ],
                ['Cash costs', money(analysis.refinance.cashClosingCosts)],
                ['Financed costs', money(analysis.refinance.financedClosingCosts)],
                ['Cash-out', money(analysis.refinance.cashOutAmount)],
              ]}
            />
          </div>
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 md:grid-cols-3">
            {[
              ['Payment change', money(analysis.paymentChange)],
              ['Interest saved / (lost)', money(analysis.interestDifference)],
              ['Net benefit through payoff', money(analysis.netBenefitThroughPayoff)],
              [
                'Months saved / (added)',
                analysis.monthsDifference === null
                  ? 'Not available'
                  : String(Math.abs(analysis.monthsDifference)),
              ],
              [
                'Break-even month',
                analysis.breakEvenMonth === null
                  ? 'Never'
                  : String(analysis.breakEvenMonth),
              ],
              ['Break-even date', analysis.breakEvenDate ?? 'Never'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-slate-500">{label}</dt>
                <dd className="text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </div>
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-xl font-semibold">Principal balance over time</h3>
            <Chart analysis={analysis} kind="balance" />
            <h3 className="pt-4 text-xl font-semibold">Cumulative cash outflow</h3>
            <Chart analysis={analysis} kind="cash" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-xl font-semibold">Interpretation</h3>
            <ul className="mt-3 space-y-2">
              {analysis.interpretations.map((item) => (
                <li key={item.label}>
                  <strong>{item.label}:</strong>{' '}
                  {item.winner === 'tie'
                    ? 'Tie'
                    : item.winner === 'refinance'
                      ? 'Refinance wins'
                      : 'Current debt wins'}{' '}
                  · {item.detail}
                </li>
              ))}
            </ul>
            {analysis.warnings.map((warning) => (
              <p className="mt-2 text-sm text-amber-800" key={warning}>
                {warning}
              </p>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
};
const Comparison = ({
  title,
  rows,
}: {
  title: string;
  rows: readonly (readonly [string, string])[];
}): React.JSX.Element => (
  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <h3 className="text-xl font-semibold">{title}</h3>
    <dl className="mt-4 space-y-2">
      {rows.map(([label, value]) => (
        <div
          className="flex justify-between gap-4 border-b border-slate-100 py-2"
          key={label}
        >
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  </div>
);
