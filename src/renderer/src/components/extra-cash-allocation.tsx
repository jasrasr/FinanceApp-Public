import { useState } from 'react';
import type {
  CreatePayoffScenarioRequest,
  ExtraCashAllocationRequest,
  ExtraCashAllocationResponse,
} from '../../../shared/debt-contracts';
import type { DebtSummaryDto } from '../../../shared/debt-contracts';
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
  const [selectedDebtId, setSelectedDebtId] = useState(debts[0]?.id ?? '');
  const [excludedDebtIds, setExcludedDebtIds] = useState<readonly string[]>([]);
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onCalculate({
      analysisDate,
      lumpSum,
      extraMonthlyPayment,
      excludedDebtIds: [...excludedDebtIds],
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
        <h2 className="mt-1 text-3xl font-semibold">Extra-cash debt allocation</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          Compare a lump sum and additional monthly payment against required payments
          only. This analysis is projected and never posts ledger activity.
        </p>
        <form className="mt-6 grid gap-4 md:grid-cols-3" onSubmit={submit}>
          <label className="text-sm font-medium">
            Lump sum
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
            Analysis date
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              type="date"
              value={analysisDate}
              onChange={(e) => setAnalysisDate(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Additional monthly amount
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
            Selected debt
            <select
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              value={selectedDebtId}
              onChange={(e) => setSelectedDebtId(e.target.value)}
            >
              {debts.map((debt) => (
                <option key={debt.id} value={debt.id}>
                  {debt.name}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2 flex items-end">
            <button
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
              disabled={loading}
              type="submit"
            >
              {loading ? 'Calculating…' : 'Compare allocation choices'}
            </button>
          </div>
          <fieldset className="md:col-span-3">
            <legend className="text-sm font-semibold">Additional exclusions</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {debts.map((debt) => (
                <label className="flex items-center gap-2 text-sm" key={debt.id}>
                  <input
                    type="checkbox"
                    checked={excludedDebtIds.includes(debt.id)}
                    onChange={(e) =>
                      setExcludedDebtIds((current) =>
                        e.target.checked
                          ? [...current, debt.id]
                          : current.filter((id) => id !== debt.id),
                      )
                    }
                  />
                  {debt.name}
                </label>
              ))}
            </div>
          </fieldset>
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
