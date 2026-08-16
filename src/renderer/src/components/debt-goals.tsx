import { useState } from 'react';
import type {
  CreateDebtGoalRequest,
  DebtGoalsDto,
  DebtSummaryDto,
  UpdateDebtGoalRequest,
} from '../../../shared/debt-contracts';
import { formatDollarString } from './display-format';

export interface DebtGoalsProps {
  readonly goals: DebtGoalsDto;
  readonly debts: readonly DebtSummaryDto[];
  readonly onCreate: (request: CreateDebtGoalRequest) => void;
  readonly onUpdate: (request: UpdateDebtGoalRequest) => void;
}

export const DebtGoals = ({
  goals,
  debts,
  onCreate,
  onUpdate,
}: DebtGoalsProps): React.JSX.Element => {
  const [name, setName] = useState('');
  const [goalType, setGoalType] =
    useState<CreateDebtGoalRequest['goalType']>('portfolio_target');
  const [debtId, setDebtId] = useState<string | null>(null);
  const [targetAmount, setTargetAmount] = useState('0.00');
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const submit = (): void => {
    if (!name.trim()) return;
    onCreate({
      name,
      goalType,
      debtId: goalType === 'portfolio_target' ? null : debtId,
      targetAmount,
      targetDate,
    });
    setName('');
  };
  return (
    <section aria-labelledby="debt-goals-heading" className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Read-only planning targets
        </p>
        <h1 className="mt-1 text-3xl font-semibold" id="debt-goals-heading">
          Debt Milestones &amp; Goals
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Track progress toward debt targets without creating ledger activity.
        </p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Add goal</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input
            aria-label="Goal name"
            className="rounded border-slate-300"
            placeholder="Goal name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <select
            aria-label="Goal type"
            className="rounded border-slate-300"
            value={goalType}
            onChange={(event) =>
              setGoalType(event.target.value as CreateDebtGoalRequest['goalType'])
            }
          >
            <option value="portfolio_target">Portfolio target</option>
            <option value="debt_payoff">Pay off a debt</option>
            <option value="debt_target">Debt balance target</option>
          </select>
          {goalType === 'portfolio_target' ? (
            <span />
          ) : (
            <select
              aria-label="Goal debt"
              className="rounded border-slate-300"
              value={debtId ?? ''}
              onChange={(event) => setDebtId(event.target.value || null)}
            >
              <option value="">Select debt</option>
              {debts.map((debt) => (
                <option key={debt.id} value={debt.id}>
                  {debt.name}
                </option>
              ))}
            </select>
          )}
          <input
            aria-label="Goal target amount"
            className="rounded border-slate-300"
            inputMode="decimal"
            value={targetAmount}
            onChange={(event) => setTargetAmount(event.target.value)}
            placeholder="Target balance"
          />
          <button
            className="rounded bg-teal-700 px-4 py-2 font-semibold text-white"
            type="button"
            onClick={submit}
          >
            Add goal
          </button>
        </div>
        <label className="mt-3 block text-sm font-medium">
          Optional target date
          <input
            className="mt-1 rounded border-slate-300"
            type="date"
            value={targetDate ?? ''}
            onChange={(event) => setTargetDate(event.target.value || null)}
          />
        </label>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {goals.goals.map((goal) => (
          <article
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            key={goal.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{goal.name}</h2>
                <p className="text-sm text-slate-600">
                  {goal.debtName ?? 'Entire portfolio'} · {goal.status}
                </p>
              </div>
              <strong>{goal.progressPercent}</strong>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-teal-600"
                style={{ width: goal.progressPercent }}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Current</dt>
                <dd>{formatDollarString(goal.currentBalance)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Remaining</dt>
                <dd>{formatDollarString(goal.remainingAmount)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Target</dt>
                <dd>{formatDollarString(goal.targetAmount)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Projected</dt>
                <dd>{goal.projectedAchievementDate ?? 'Not available'}</dd>
              </div>
            </dl>
            {goal.history.length > 1 ? (
              <svg
                aria-label={`${goal.name} progress history`}
                className="mt-5 h-32 w-full"
                role="img"
                viewBox="0 0 800 160"
                preserveAspectRatio="none"
              >
                <polyline
                  fill="none"
                  stroke="#0f766e"
                  strokeWidth="4"
                  points={goal.history
                    .map(
                      (point, index) =>
                        `${(index / Math.max(1, goal.history.length - 1)) * 800},${160 - Math.min(150, (Number(point.balance) / Math.max(1, Number(goal.startingBalance))) * 150)}`,
                    )
                    .join(' ')}
                />
              </svg>
            ) : null}
            {goal.status === 'active' ? (
              <button
                className="mt-4 text-sm font-semibold text-slate-700"
                type="button"
                onClick={() =>
                  onUpdate({
                    id: goal.id,
                    expectedUpdatedAtUtc: goal.updatedAtUtc,
                    name: goal.name,
                    targetAmount: goal.targetAmount,
                    targetDate: goal.targetDate,
                    status: 'archived',
                  })
                }
              >
                Archive
              </button>
            ) : null}
          </article>
        ))}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Suggested milestones</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {goals.suggestions.map((suggestion) => (
            <span
              className="rounded-full bg-slate-100 px-3 py-1 text-sm"
              key={suggestion.label}
            >
              {suggestion.label}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
};
