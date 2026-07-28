import { useState } from 'react';
import type {
  ApplicationError,
  CreatePayoffScenarioRequest,
  PayoffScenarioDto,
} from '../../../shared/debt-contracts';
import { formatDollarString } from './display-format';

export interface PayoffScenariosProps {
  readonly scenarios: readonly PayoffScenarioDto[];
  readonly loading: boolean;
  readonly saving: boolean;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly error: ApplicationError | null;
  readonly onArchive: (scenario: PayoffScenarioDto) => void;
  readonly onCreate: (request: CreatePayoffScenarioRequest) => void;
  readonly onRerun: (scenario: PayoffScenarioDto) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const formatFinancialDate = (value: string): string =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );

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

export const PayoffScenarios = ({
  scenarios,
  loading,
  saving,
  fieldErrors,
  error,
  onArchive,
  onCreate,
  onRerun,
}: PayoffScenariosProps): React.JSX.Element => {
  const [name, setName] = useState('Generated payoff scenario');
  const [scenarioStartDate, setScenarioStartDate] = useState(today());
  const [strategy, setStrategy] =
    useState<CreatePayoffScenarioRequest['strategy']>('avalanche');
  const [extraMonthlyPayment, setExtraMonthlyPayment] = useState('0.00');
  const [customPriorityText, setCustomPriorityText] = useState('');
  const [maxProjectionMonths, setMaxProjectionMonths] = useState(360);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onCreate({
      name,
      scenarioStartDate,
      strategy,
      extraMonthlyPayment,
      customPriority: customPriorityText
        .split(/\s*,\s*/)
        .map((value) => value.trim())
        .filter(Boolean),
      variableRateOverrides: {},
      maxProjectionMonths,
    });
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
            label="Extra monthly payment"
            name="extra-monthly-payment"
            onChange={setExtraMonthlyPayment}
            required
            value={extraMonthlyPayment}
          />
          <label className="block text-sm font-medium text-slate-700 md:col-span-2">
            Custom priority debt IDs
            <textarea
              className="mt-1 block min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:ring-slate-500"
              onChange={(event) => setCustomPriorityText(event.target.value)}
              placeholder="Comma-separated debt IDs; required only for custom strategy."
              value={customPriorityText}
            />
            <FieldError error={fieldErrors?.customPriority?.[0]} />
          </label>
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
              {saving ? 'Saving…' : 'Save scenario'}
            </button>
          </div>
        </form>
        {error?.fieldErrors?.scenarioStartDate ? (
          <p className="mt-3 text-sm text-red-700">
            {error.fieldErrors.scenarioStartDate.join(' ')}
          </p>
        ) : null}
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-labelledby="saved-scenarios-heading"
      >
        <h3 className="text-lg font-semibold" id="saved-scenarios-heading">
          Saved scenarios
        </h3>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading payoff scenarios…</p>
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
                  <h4 className="font-semibold">{scenario.name}</h4>
                  <p className="mt-1 text-sm text-slate-600">
                    {scenario.strategy} strategy • start date{' '}
                    {formatFinancialDate(scenario.scenarioStartDate)} • engine{' '}
                    {scenario.calculationEngineVersion}
                  </p>
                </div>
                <div className="flex gap-2">
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
