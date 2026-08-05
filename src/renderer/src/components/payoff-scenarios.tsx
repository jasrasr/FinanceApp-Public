import { useMemo, useState } from 'react';
import type {
  ApplicationError,
  CreatePayoffScenarioRequest,
  DebtSummaryDto,
  PayoffScenarioDto,
  RenamePayoffScenarioRequest,
} from '../../../shared/debt-contracts';
import {
  buildPayoffPrincipalBalanceScale,
  buildPayoffChartDateDomain,
  buildPayoffChartTickIndexes,
} from './chart-helpers';
import { formatDollarString } from './display-format';

export interface PayoffScenariosProps {
  readonly debts: readonly DebtSummaryDto[];
  readonly scenarios: readonly PayoffScenarioDto[];
  readonly loading: boolean;
  readonly saving: boolean;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly error: ApplicationError | null;
  readonly onArchive: (scenario: PayoffScenarioDto) => void;
  readonly onCreate: (request: CreatePayoffScenarioRequest) => void;
  readonly onRerun: (scenario: PayoffScenarioDto) => void;
  readonly onRename: (request: RenamePayoffScenarioRequest) => void;
}

interface DebtEligibility {
  readonly debt: DebtSummaryDto;
  readonly included: boolean;
  readonly reason: string | null;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const formatFinancialDate = (value: string): string =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );

const formatMonthYear = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));

const parseAmount = (value: string): number => {
  const parsed = Number(value.replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const strategyExplanations: Record<CreatePayoffScenarioRequest['strategy'], string> = {
  avalanche:
    'Apply the extra monthly payment to the eligible debt with the highest interest rate. Required payments continue on all included debts, and the single extra amount rolls to the next priority debt as debts are paid off.',
  snowball:
    'Apply the extra monthly payment to the eligible debt with the lowest current balance. Required payments continue on all included debts, and freed payments roll forward where supported.',
  custom:
    'Apply the extra monthly payment using the ordered debt list below. Required payments continue on all included debts, and the extra amount is applied once per month to the current priority debt.',
  baseline:
    'Make required payments only, with no extra monthly payment. Scenario calculations do not post transactions to the actual ledger.',
};

const FieldError = ({
  error,
}: {
  readonly error?: string;
}): React.JSX.Element | null =>
  error ? (
    <p className="mt-1 text-sm font-medium text-red-700" role="alert">
      {error}
    </p>
  ) : null;

const TextInput = ({
  error,
  label,
  name,
  onChange,
  required = false,
  type = 'text',
  value,
}: {
  readonly error?: string;
  readonly label: string;
  readonly name: string;
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly type?: string;
  readonly value: string;
}): React.JSX.Element => (
  <label className="block text-sm font-medium text-slate-700">
    {label}
    {required ? <span className="ml-1 text-slate-500">*</span> : null}
    <input
      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500"
      onChange={(event) => onChange(event.target.value)}
      type={type}
      value={value}
      name={name}
      required={required}
    />
    <FieldError error={error} />
  </label>
);

const debtEligibility = (debt: DebtSummaryDto): DebtEligibility => {
  if (debt.status !== 'active') {
    return { debt, included: false, reason: `Status is ${debt.status}.` };
  }
  if (debt.archivedAtUtc) {
    return { debt, included: false, reason: 'Debt is archived.' };
  }
  if (parseAmount(debt.currentBalance) <= 0) {
    return { debt, included: false, reason: 'Current balance is zero or below.' };
  }
  if (debt.currentTerm.paymentFrequency === 'irregular') {
    return {
      debt,
      included: false,
      reason: 'Irregular payment frequency is unsupported for payoff projection.',
    };
  }
  if (debt.currentTerm.interestRateType === 'variable') {
    return {
      debt,
      included: false,
      reason: 'Variable-rate debt needs an explicit scenario rate override.',
    };
  }
  return { debt, included: true, reason: null };
};

const monthlyPayment = (debt: DebtSummaryDto): number => {
  const payment = parseAmount(debt.currentTerm.requiredPayment);
  if (debt.currentTerm.paymentFrequency === 'semimonthly') return payment * 2;
  if (debt.currentTerm.paymentFrequency === 'weekly') return (payment * 52) / 12;
  if (debt.currentTerm.paymentFrequency === 'biweekly') return (payment * 26) / 12;
  if (debt.currentTerm.paymentFrequency === 'quarterly') return payment / 3;
  if (debt.currentTerm.paymentFrequency === 'annually') return payment / 12;
  return payment;
};

const moveItem = (
  values: readonly string[],
  fromIndex: number,
  direction: -1 | 1,
): readonly string[] => {
  const toIndex = fromIndex + direction;
  if (toIndex < 0 || toIndex >= values.length) return values;
  const next = [...values];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return values;
  next.splice(toIndex, 0, item);
  return next;
};

const ComparisonChart = ({
  scenarios,
}: {
  readonly scenarios: readonly PayoffScenarioDto[];
}): React.JSX.Element | null => {
  const eligibleScenarios = scenarios.filter(
    (scenario) => scenario.result.monthlySchedule.length > 0,
  );
  const [selectedIds, setSelectedIds] = useState<readonly string[] | null>(null);
  const defaultVisibleScenarios = [
    ...eligibleScenarios.filter((scenario) => scenario.strategy === 'baseline'),
    ...eligibleScenarios.filter((scenario) => scenario.strategy !== 'baseline'),
  ].slice(0, 4);
  const activeSelectedIds =
    selectedIds ?? defaultVisibleScenarios.map((scenario) => scenario.id);
  const selected = eligibleScenarios.filter((scenario) =>
    activeSelectedIds.includes(scenario.id),
  );
  if (eligibleScenarios.length === 0) return null;

  const colors = ['#1d4ed8', '#047857', '#b45309', '#7c3aed', '#be123c', '#0891b2'];
  const width = 900;
  const height = 330;
  const padding = { left: 112, right: 24, top: 20, bottom: 44 };
  const domainScenarios = selected.length > 0 ? selected : eligibleScenarios;
  const projectionDates = buildPayoffChartDateDomain(
    domainScenarios.map((scenario) => ({
      monthlySchedule: scenario.result.monthlySchedule,
    })),
  );
  const dateIndexes = new Map(projectionDates.map((date, index) => [date, index]));
  const chartHeight = height - padding.top - padding.bottom;
  const scale = buildPayoffPrincipalBalanceScale({
    values: selected.flatMap((scenario) =>
      scenario.result.monthlySchedule.map((entry) =>
        parseAmount(entry.totalProjectedBalance),
      ),
    ),
    chartHeight,
    formatLabel: (value) => formatDollarString(value.toFixed(0)),
  });
  const xFor = (date: string): number => {
    const index = dateIndexes.get(date) ?? 0;
    const lastIndex = Math.max(1, projectionDates.length - 1);
    return padding.left + (index / lastIndex) * (width - padding.left - padding.right);
  };
  const yFor = (value: number): number =>
    padding.top +
    (1 - (value - scale.minimum) / (scale.maximum - scale.minimum)) * chartHeight;
  const tickIndexes = buildPayoffChartTickIndexes(projectionDates);
  const payoffDate = (scenario: PayoffScenarioDto): string | null => {
    const date = scenario.result.projectedPayoffDate;
    return date && dateIndexes.has(date) ? date : null;
  };

  return (
    <section className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold">Scenario balance comparison</h4>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            className="rounded-md border border-slate-300 px-2 py-1 font-semibold"
            onClick={() =>
              setSelectedIds(eligibleScenarios.map((scenario) => scenario.id))
            }
            type="button"
          >
            Select all
          </button>
          <button
            className="rounded-md border border-slate-300 px-2 py-1 font-semibold"
            onClick={() => setSelectedIds([])}
            type="button"
          >
            Select none
          </button>
          {eligibleScenarios.map((scenario, index) => {
            const active = activeSelectedIds.includes(scenario.id);
            return (
              <button
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 ${
                  active ? 'bg-white' : 'bg-slate-100 opacity-50'
                }`}
                key={scenario.id}
                onClick={() =>
                  setSelectedIds((current) =>
                    (current ?? activeSelectedIds).includes(scenario.id)
                      ? (current ?? activeSelectedIds).filter(
                          (id) => id !== scenario.id,
                        )
                      : [...(current ?? activeSelectedIds), scenario.id],
                  )
                }
                type="button"
              >
                <span
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                {scenario.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {selected.map((scenario) => (
          <div
            className="rounded-md border border-slate-200 p-3 text-sm"
            key={`${scenario.id}-summary`}
          >
            <p className="font-semibold">{scenario.name}</p>
            <p className="text-slate-600">
              {scenario.strategy} · extra monthly{' '}
              {formatDollarString(scenario.extraMonthlyPayment)}
            </p>
            <p className="text-slate-600">
              Lump sum: {formatDollarString(scenario.lumpSum)} · payoff:{' '}
              {scenario.result.projectedPayoffDate
                ? formatMonthYear(scenario.result.projectedPayoffDate)
                : 'Not paid off within projection horizon'}
            </p>
            <p className="text-slate-600">
              Interest: {formatDollarString(scenario.result.totalProjectedInterest)} ·
              saved vs baseline: {formatDollarString(scenario.result.interestSavings)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg
          aria-label="Projected total principal balance by scenario"
          className="min-w-[900px]"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <line
            stroke="#cbd5e1"
            x1={padding.left}
            x2={width - padding.right}
            y1={height - padding.bottom}
            y2={height - padding.bottom}
          />
          <line
            stroke="#cbd5e1"
            x1={padding.left}
            x2={padding.left}
            y1={padding.top}
            y2={height - padding.bottom}
          />
          {selected.map((scenario) => {
            const color =
              colors[
                eligibleScenarios.findIndex((item) => item.id === scenario.id) %
                  colors.length
              ] ?? '#1d4ed8';
            const path = scenario.result.monthlySchedule
              .map((entry, index) => {
                const command = index === 0 ? 'M' : 'L';
                return `${command} ${xFor(entry.month).toFixed(1)} ${yFor(
                  parseAmount(entry.totalProjectedBalance),
                ).toFixed(1)}`;
              })
              .join(' ');
            return (
              <path
                d={path}
                fill="none"
                key={scenario.id}
                stroke={color}
                strokeDasharray={
                  eligibleScenarios.findIndex((item) => item.id === scenario.id) >=
                  colors.length
                    ? '6 4'
                    : undefined
                }
              />
            );
          })}
          {selected.map((scenario) =>
            scenario.result.monthlySchedule.map((entry) => {
              const color =
                colors[
                  eligibleScenarios.findIndex((item) => item.id === scenario.id) %
                    colors.length
                ] ?? '#1d4ed8';
              return (
                <circle
                  cx={xFor(entry.month)}
                  cy={yFor(parseAmount(entry.totalProjectedBalance))}
                  fill={color}
                  key={`${scenario.id}-${entry.month}`}
                  r="3"
                >
                  <title>{`${formatMonthYear(entry.month)} - ${scenario.name}: ${formatDollarString(entry.totalProjectedBalance)}`}</title>
                </circle>
              );
            }),
          )}
          {selected.map((scenario) => {
            const date = payoffDate(scenario);
            if (date === null) return null;
            const color =
              colors[
                eligibleScenarios.findIndex((item) => item.id === scenario.id) %
                  colors.length
              ] ?? '#1d4ed8';
            return (
              <g key={`${scenario.id}-payoff-marker`}>
                <circle
                  cx={xFor(date)}
                  cy={yFor(0)}
                  fill="white"
                  r="6"
                  stroke={color}
                  strokeWidth="3"
                >
                  <title>{`${formatMonthYear(date)} - ${scenario.name}: $0.00 projected balance`}</title>
                </circle>
                <text
                  fill={color}
                  fontSize="11"
                  x={xFor(date) + 6}
                  y={yFor(0) - 8}
                >{`${scenario.name} · ${formatMonthYear(date)}`}</text>
              </g>
            );
          })}
          {scale.tickValues.map((value) => {
            const y = yFor(value);
            return (
              <g key={`y-tick-${value}`}>
                <line
                  stroke="#e2e8f0"
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="#475569"
                  fontSize="11"
                  textAnchor="end"
                  x={padding.left - 8}
                  y={y + 4}
                >
                  {formatDollarString(value.toFixed(0))}
                </text>
              </g>
            );
          })}
          {tickIndexes.map((index) => (
            <text
              fill="#475569"
              fontSize="11"
              key={`tick-${index}`}
              textAnchor="middle"
              x={xFor(projectionDates[index] ?? projectionDates[0] ?? '')}
              y={height - 14}
            >
              {formatMonthYear(projectionDates[index] ?? projectionDates[0] ?? '')}
            </text>
          ))}
          <text fill="#475569" fontSize="12" x={padding.left} y={height - 2}>
            Projection month and year
          </text>
          <text
            fill="#475569"
            fontSize="12"
            textAnchor="middle"
            transform={`rotate(-90 14 ${padding.top + chartHeight / 2})`}
            x="14"
            y={padding.top + chartHeight / 2}
          >
            Projected principal balance
          </text>
        </svg>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Chart data
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-4">Scenario</th>
                <th className="py-2 pr-4">Month and year</th>
                <th className="py-2 pr-4 text-right">Projected total balance</th>
              </tr>
            </thead>
            <tbody>
              {selected.flatMap((scenario) =>
                scenario.result.monthlySchedule.map((entry) => (
                  <tr
                    className="border-b border-slate-100"
                    key={`${scenario.id}-${entry.month}`}
                  >
                    <td className="py-2 pr-4">{scenario.name}</td>
                    <td className="py-2 pr-4">{formatMonthYear(entry.month)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatDollarString(entry.totalProjectedBalance)}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
};

export const PayoffScenarios = ({
  debts,
  scenarios,
  loading,
  saving,
  fieldErrors,
  error,
  onArchive,
  onCreate,
  onRerun,
  onRename,
}: PayoffScenariosProps): React.JSX.Element => {
  const [name, setName] = useState('Generated payoff scenario');
  const [scenarioStartDate, setScenarioStartDate] = useState(today());
  const [strategy, setStrategy] =
    useState<CreatePayoffScenarioRequest['strategy']>('avalanche');
  const [extraMonthlyPayment, setExtraMonthlyPayment] = useState('0.00');
  const [maxProjectionMonths, setMaxProjectionMonths] = useState(360);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const eligibility = useMemo(() => debts.map(debtEligibility), [debts]);
  const includedDebts = eligibility
    .filter((item) => item.included)
    .map((item) => item.debt);
  const [customPriority, setCustomPriority] = useState<readonly string[]>([]);
  const orderedCustomPriority =
    customPriority.length > 0
      ? customPriority.filter((id) => includedDebts.some((debt) => debt.id === id))
      : includedDebts.map((debt) => debt.id);
  const cashRequirement =
    includedDebts.reduce((total, debt) => total + monthlyPayment(debt), 0) +
    (strategy === 'baseline' ? 0 : parseAmount(extraMonthlyPayment));

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onCreate({
      name,
      scenarioStartDate,
      strategy,
      extraMonthlyPayment: strategy === 'baseline' ? '0.00' : extraMonthlyPayment,
      customPriority: strategy === 'custom' ? orderedCustomPriority : [],
      variableRateOverrides: {},
      maxProjectionMonths,
    });
  };
  const submitRename = (scenario: PayoffScenarioDto): void => {
    const nameValue = renameValue.trim();
    if (!nameValue) {
      setRenameError('Enter a scenario name.');
      return;
    }
    if (nameValue.length > 200) {
      setRenameError('Scenario names must be 200 characters or fewer.');
      return;
    }
    onRename({
      id: scenario.id,
      expectedUpdatedAtUtc: scenario.updatedAtUtc,
      name: nameValue,
    });
    setRenameTargetId(null);
    setRenameError(null);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <p className="text-sm font-medium text-slate-500">Scenario-only planning</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">
          Projection and payoff scenarios
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Scenarios use application-calculated ledger balances as of the selected start
          date and save their assumptions separately from posted actual activity. They
          do not create, edit, or post ledger transactions.
        </p>
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-labelledby="create-scenario-heading"
      >
        <h3 className="text-lg font-semibold" id="create-scenario-heading">
          Create scenario
        </h3>
        <form className="mt-5 grid gap-5 md:grid-cols-2" onSubmit={submit}>
          <TextInput
            error={fieldErrors?.name?.[0]}
            label="Scenario name"
            name="scenario-name"
            onChange={setName}
            required
            value={name}
          />
          <TextInput
            error={fieldErrors?.scenarioStartDate?.[0]}
            label="Scenario start date"
            name="scenario-start-date"
            onChange={setScenarioStartDate}
            required
            type="date"
            value={scenarioStartDate}
          />
          <label className="block text-sm font-medium text-slate-700">
            Payoff strategy
            <select
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500"
              onChange={(event) =>
                setStrategy(
                  event.target.value as CreatePayoffScenarioRequest['strategy'],
                )
              }
              value={strategy}
            >
              <option value="baseline">Baseline</option>
              <option value="avalanche">Debt avalanche</option>
              <option value="snowball">Debt snowball</option>
              <option value="custom">Custom priority</option>
            </select>
          </label>
          <TextInput
            error={fieldErrors?.extraMonthlyPayment?.[0]}
            label="Total extra monthly payment"
            name="extra-monthly-payment"
            onChange={setExtraMonthlyPayment}
            required
            value={extraMonthlyPayment}
          />
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:col-span-2">
            <p>{strategyExplanations[strategy]}</p>
            <p className="mt-2 font-semibold">
              Assumed total monthly cash requirement:{' '}
              {formatDollarString(cashRequirement.toFixed(2))}
            </p>
          </div>
          {strategy === 'custom' ? (
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-slate-700">
                Custom payoff priority
              </p>
              <div className="mt-2 space-y-2">
                {orderedCustomPriority.map((debtId, index) => {
                  const debt = includedDebts.find((item) => item.id === debtId);
                  if (!debt) return null;
                  return (
                    <div
                      className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                      key={debt.id}
                    >
                      <span>
                        {index + 1}. {debt.name}
                      </span>
                      <span className="flex gap-2">
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-40"
                          disabled={index === 0}
                          onClick={() =>
                            setCustomPriority((current) =>
                              moveItem(
                                current.length > 0
                                  ? current
                                  : includedDebts.map((item) => item.id),
                                index,
                                -1,
                              ),
                            )
                          }
                          type="button"
                        >
                          Move up
                        </button>
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-40"
                          disabled={index === orderedCustomPriority.length - 1}
                          onClick={() =>
                            setCustomPriority((current) =>
                              moveItem(
                                current.length > 0
                                  ? current
                                  : includedDebts.map((item) => item.id),
                                index,
                                1,
                              ),
                            )
                          }
                          type="button"
                        >
                          Move down
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <FieldError error={fieldErrors?.customPriority?.[0]} />
            </div>
          ) : null}
          <section className="rounded-lg border border-slate-200 p-4 md:col-span-2">
            <h4 className="font-semibold">Included and excluded debts</h4>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-700">Included</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {includedDebts.map((debt) => (
                    <li key={debt.id}>{debt.name}</li>
                  ))}
                  {includedDebts.length === 0 ? <li>No eligible debts.</li> : null}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Excluded</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {eligibility
                    .filter((item) => !item.included)
                    .map((item) => (
                      <li key={item.debt.id}>
                        {item.debt.name}: {item.reason}
                      </li>
                    ))}
                  {eligibility.every((item) => item.included) ? (
                    <li>No excluded debts.</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </section>
          <TextInput
            label="Maximum projection months"
            name="max-projection-months"
            onChange={(value) => setMaxProjectionMonths(Number(value))}
            required
            type="number"
            value={String(maxProjectionMonths)}
          />
          <div className="flex items-end">
            <button
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Saving...' : 'Save scenario'}
            </button>
          </div>
        </form>
        {error?.fieldErrors?.scenarioStartDate ? (
          <p className="mt-3 text-sm text-red-700">
            {error.fieldErrors.scenarioStartDate.join(' ')}
          </p>
        ) : null}
      </section>

      <ComparisonChart scenarios={scenarios} />

      <section
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-labelledby="saved-scenarios-heading"
      >
        <h3 className="text-lg font-semibold" id="saved-scenarios-heading">
          Saved scenarios
        </h3>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading payoff scenarios...</p>
        ) : null}
        {!loading && scenarios.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
            No payoff scenarios saved yet. Create a scenario after posted debt balances
            exist.
          </div>
        ) : null}
        <div className="mt-5 space-y-4">
          {scenarios.map((scenario) => (
            <article
              className="rounded-lg border border-slate-200 p-4"
              key={scenario.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {renameTargetId === scenario.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={`Rename ${scenario.name}`}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        maxLength={200}
                        onChange={(event) => setRenameValue(event.target.value)}
                        value={renameValue}
                      />
                      <span className="sr-only" role="alert">
                        {renameError ?? ''}
                      </span>
                      <button
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                        onClick={() => submitRename(scenario)}
                        type="button"
                      >
                        Save name
                      </button>
                      <button
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                        onClick={() => setRenameTargetId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <h4 className="font-semibold">{scenario.name}</h4>
                  )}
                  {renameTargetId === scenario.id && renameError ? (
                    <p className="mt-1 text-sm font-medium text-red-700" role="alert">
                      {renameError}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-600">
                    {scenario.strategy} strategy - start date{' '}
                    {formatFinancialDate(scenario.scenarioStartDate)} - engine{' '}
                    {scenario.calculationEngineVersion}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
                    onClick={() => {
                      setRenameTargetId(scenario.id);
                      setRenameValue(scenario.name);
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
                    onClick={() => onRerun(scenario)}
                    type="button"
                  >
                    Rerun
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
                    onClick={() => onArchive(scenario)}
                    type="button"
                  >
                    Archive
                  </button>
                </div>
              </div>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Projected payoff date</dt>
                  <dd className="font-semibold">
                    {scenario.result.projectedPayoffDate
                      ? formatFinancialDate(scenario.result.projectedPayoffDate)
                      : 'Not within horizon'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Projected interest</dt>
                  <dd className="font-semibold">
                    {formatDollarString(scenario.result.totalProjectedInterest)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Monthly cash requirement</dt>
                  <dd className="font-semibold">
                    {formatDollarString(scenario.result.monthlyCashRequirement)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Savings vs baseline</dt>
                  <dd className="font-semibold">
                    {formatDollarString(scenario.result.interestSavings)}
                  </dd>
                </div>
              </dl>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Payoff order summary
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="py-2 pr-4">Priority</th>
                        <th className="py-2 pr-4">Debt</th>
                        <th className="py-2 pr-4">Payoff date</th>
                        <th className="py-2 pr-4 text-right">Months</th>
                        <th className="py-2 pr-4 text-right">Interest</th>
                        <th className="py-2 pr-4 text-right">Interest saved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.result.payoffOrder.map((row) => (
                        <tr className="border-b border-slate-100" key={row.debtId}>
                          <td className="py-2 pr-4">{row.priority}</td>
                          <td className="py-2 pr-4">{row.debtName}</td>
                          <td className="py-2 pr-4">
                            {row.projectedPayoffDate
                              ? formatFinancialDate(row.projectedPayoffDate)
                              : 'Not within horizon'}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {row.monthsToPayoff ?? 'N/A'}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {row.projectedInterest
                              ? formatDollarString(row.projectedInterest)
                              : 'Not reliable'}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {row.interestSaved
                              ? formatDollarString(row.interestSaved)
                              : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <dt className="text-slate-500">Total projected payoff date</dt>
                    <dd className="font-semibold">
                      {scenario.result.projectedPayoffDate
                        ? formatFinancialDate(scenario.result.projectedPayoffDate)
                        : 'Not within horizon'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Total projected interest</dt>
                    <dd className="font-semibold">
                      {formatDollarString(scenario.result.totalProjectedInterest)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Months saved</dt>
                    <dd className="font-semibold">
                      {scenario.result.monthsSaved ?? 'N/A'}
                    </dd>
                  </div>
                </dl>
              </details>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Monthly extra-payment allocation schedule
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="py-2 pr-4">Month</th>
                        <th className="py-2 pr-4">Extra payment debt</th>
                        <th className="py-2 pr-4 text-right">Required</th>
                        <th className="py-2 pr-4 text-right">Extra</th>
                        <th className="py-2 pr-4 text-right">Total to debt</th>
                        <th className="py-2 pr-4 text-right">Ending balance</th>
                        <th className="py-2 pr-4">Paid off</th>
                        <th className="py-2 pr-4">Next priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.result.monthlySchedule.map((entry) => (
                        <tr className="border-b border-slate-100" key={entry.month}>
                          <td className="py-2 pr-4">
                            {formatFinancialDate(entry.month)}
                          </td>
                          <td className="py-2 pr-4">
                            {entry.debtName ?? 'No extra payment'}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatDollarString(entry.requiredPayment)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatDollarString(entry.extraPayment)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatDollarString(entry.totalPayment)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatDollarString(entry.endingProjectedBalance)}
                          </td>
                          <td className="py-2 pr-4">
                            {entry.paidOffDebtName ?? 'None'}
                          </td>
                          <td className="py-2 pr-4">
                            {entry.nextPriorityDebtName ?? 'None'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Assumptions, debt results, and warnings
                </summary>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {scenario.result.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
                {scenario.result.warnings.length > 0 ? (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    {scenario.result.warnings.join(' ')}
                  </div>
                ) : null}
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="py-2 pr-4">Debt</th>
                        <th className="py-2 pr-4 text-right">Start balance</th>
                        <th className="py-2 pr-4">Projection status</th>
                        <th className="py-2 pr-4 text-right">Interest</th>
                        <th className="py-2 pr-4">Payoff date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.result.debts.map((debt) => (
                        <tr className="border-b border-slate-100" key={debt.debtId}>
                          <td className="py-2 pr-4">{debt.debtName}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatDollarString(debt.startingBalance)}
                          </td>
                          <td className="py-2 pr-4">
                            {debt.projectionStatus === 'projected'
                              ? 'Projected'
                              : 'Unsupported'}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {debt.projectedInterest
                              ? formatDollarString(debt.projectedInterest)
                              : 'Not reliable'}
                          </td>
                          <td className="py-2 pr-4">
                            {debt.projectionStatus === 'unsupported'
                              ? 'Unsupported'
                              : debt.projectedPayoffDate
                                ? formatFinancialDate(debt.projectedPayoffDate)
                                : 'Not within horizon'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {scenario.result.debts.some((debt) => debt.warnings.length > 0) ? (
                  <div className="mt-4 space-y-2">
                    {scenario.result.debts
                      .filter((debt) => debt.warnings.length > 0)
                      .map((debt) => (
                        <div
                          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                          key={debt.debtId}
                        >
                          <p className="font-semibold">{debt.debtName}</p>
                          <ul className="mt-1 list-disc pl-5">
                            {debt.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                ) : null}
              </details>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
