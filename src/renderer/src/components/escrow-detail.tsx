import { useState } from 'react';
import type {
  CreateDebtTransactionRequest,
  DebtDetailDto,
  DebtTransactionDto,
} from '../../../shared/debt-contracts';
import { combinedDebtLabel } from './debt-label';
import { formatAbsoluteDollarString, formatDollarString } from './display-format';
import { Field } from './form-controls';
import { inputClassName, labelFromValue } from './form-utils';

export interface EscrowDetailProps {
  readonly debts: readonly DebtDetailDto[];
  readonly effectiveDate: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly loading: boolean;
  readonly onBackToDashboard: () => void;
  readonly onRecordEscrowActivity: (request: CreateDebtTransactionRequest) => void;
  readonly onSelectDebt: (id: string) => void;
  readonly saving: boolean;
}

type EscrowActivityKind =
  | 'real_estate_tax'
  | 'homeowners_insurance'
  | 'mortgage_insurance'
  | 'escrow_refund'
  | 'escrow_adjustment'
  | 'other_expense';

const today = (): string => new Date().toISOString().slice(0, 10);

const activityLabels: Record<EscrowActivityKind, string> = {
  real_estate_tax: 'Real estate tax payment',
  homeowners_insurance: 'Homeowners insurance payment',
  mortgage_insurance: 'Mortgage insurance payment',
  escrow_refund: 'Escrow refund',
  escrow_adjustment: 'Escrow adjustment',
  other_expense: 'Other named escrow expense',
};

const transactionTypeForActivity = (
  activityKind: EscrowActivityKind,
): CreateDebtTransactionRequest['transaction']['transactionType'] =>
  activityKind === 'escrow_refund'
    ? 'escrow_refund'
    : activityKind === 'escrow_adjustment'
      ? 'escrow_adjustment'
      : 'escrow_disbursement';

const value = (data: FormData, name: string): string =>
  String(data.get(name) ?? '').trim();

const EscrowActivityForm = ({
  debts,
  fieldErrors,
  onSubmit,
  saving,
}: {
  readonly debts: readonly DebtDetailDto[];
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly onSubmit: (request: CreateDebtTransactionRequest) => void;
  readonly saving: boolean;
}): React.JSX.Element | null => {
  const [activityKind, setActivityKind] =
    useState<EscrowActivityKind>('real_estate_tax');

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectedActivity = value(data, 'escrow.activityKind') as EscrowActivityKind;
    const transactionDate = value(data, 'escrow.transactionDate');
    const amount = value(data, 'escrow.amount');
    const customName = value(data, 'escrow.customName');
    const label =
      selectedActivity === 'other_expense' && customName
        ? customName
        : activityLabels[selectedActivity];

    onSubmit({
      debtId: value(data, 'escrow.debtId'),
      transaction: {
        transactionType: transactionTypeForActivity(selectedActivity),
        effectiveDate: transactionDate,
        postingDate: transactionDate,
        status: 'posted',
        totalAmount: amount,
        description: label,
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: null,
          interest: null,
          escrow: amount,
          fee: null,
          penalty: null,
          extraPrincipal: null,
          other: null,
        },
      },
    });
  };

  if (debts.length === 0) return null;

  return (
    <form
      className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={submit}
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-950">Record escrow activity</h3>
        <p className="mt-1 text-sm text-slate-600">
          Select the mortgage debt and enter a positive amount. Debt Tracker applies
          escrow accounting direction from the activity type.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Field label="Mortgage debt" name="escrow.debtId">
          <select className={inputClassName} id="escrow.debtId" name="escrow.debtId">
            {debts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {combinedDebtLabel(debt)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Escrow activity type" name="escrow.activityKind">
          <select
            className={inputClassName}
            id="escrow.activityKind"
            name="escrow.activityKind"
            onChange={(event) =>
              setActivityKind(event.target.value as EscrowActivityKind)
            }
            value={activityKind}
          >
            {Object.entries(activityLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['transaction.effectiveDate']}
          label="Transaction date"
          name="escrow.transactionDate"
        >
          <input
            className={inputClassName}
            defaultValue={today()}
            id="escrow.transactionDate"
            name="escrow.transactionDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={fieldErrors?.['transaction.totalAmount']}
          hint="Enter a positive currency amount."
          label="Amount"
          name="escrow.amount"
        >
          <input
            className={inputClassName}
            id="escrow.amount"
            inputMode="decimal"
            name="escrow.amount"
            required
          />
        </Field>
        {activityKind === 'other_expense' ? (
          <div className="lg:col-span-2">
            <Field label="Expense name" name="escrow.customName">
              <input
                className={inputClassName}
                id="escrow.customName"
                name="escrow.customName"
                placeholder="Describe the escrow expense"
                required
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end border-t border-slate-200 pt-6">
        <button
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving}
          type="submit"
        >
          {saving ? 'Saving…' : 'Record escrow activity'}
        </button>
      </div>
    </form>
  );
};

const escrowTransactions = (debt: DebtDetailDto): readonly DebtTransactionDto[] =>
  debt.transactions.filter(
    (transaction) =>
      transaction.transactionType !== 'reversal' &&
      transaction.status === 'posted' &&
      transaction.allocations.some(
        (allocation) => allocation.allocationType === 'escrow',
      ),
  );

export const EscrowDetail = ({
  debts,
  effectiveDate,
  fieldErrors,
  loading,
  onBackToDashboard,
  onRecordEscrowActivity,
  onSelectDebt,
  saving,
}: EscrowDetailProps): React.JSX.Element => (
  <section aria-labelledby="escrow-detail-heading">
    <button
      className="text-sm font-semibold text-blue-700 hover:text-blue-900 focus:underline focus:outline-none"
      onClick={onBackToDashboard}
      type="button"
    >
      ← Back to dashboard
    </button>

    <div className="mt-5">
      <p className="text-sm font-medium text-slate-500">Escrow detail</p>
      <h2
        className="mt-1 text-3xl font-semibold tracking-tight"
        id="escrow-detail-heading"
      >
        Escrow balances and activity
      </h2>
      <p className="sr-only">
        Escrow amounts are calculated from posted escrow allocations and remain separate
        from debt principal balances as of {effectiveDate}.
      </p>
    </div>

    {loading ? (
      <section
        aria-label="Loading escrow detail"
        className="mt-8 rounded-xl border border-slate-200 bg-white p-10"
      >
        <p className="text-sm font-medium text-slate-600">Loading escrow detail…</p>
      </section>
    ) : null}

    {!loading && debts.length === 0 ? (
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
        <h3 className="text-lg font-semibold text-slate-900">
          No escrow activity recorded
        </h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
          Mortgage escrow deposits, disbursements, refunds, and adjustments will appear
          here after they are posted.
        </p>
      </div>
    ) : null}

    {!loading ? (
      <EscrowActivityForm
        debts={debts.filter((debt) => debt.debtType === 'mortgage')}
        fieldErrors={fieldErrors}
        onSubmit={onRecordEscrowActivity}
        saving={saving}
      />
    ) : null}

    {!loading ? (
      <div className="mt-6 space-y-6">
        {debts.map((debt) => (
          <section
            aria-labelledby={`escrow-${debt.id}`}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            key={debt.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold" id={`escrow-${debt.id}`}>
                  <button
                    className="text-left hover:text-blue-800 focus:underline focus:outline-none"
                    onClick={() => onSelectDebt(debt.id)}
                    type="button"
                  >
                    {combinedDebtLabel(debt)}
                  </button>
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Balance as of {effectiveDate}
                </p>
              </div>
              <p className="text-right">
                <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Current escrow balance
                </span>
                <span className="mt-1 block text-xl font-semibold tabular-nums">
                  {formatDollarString(debt.calculatedEscrowBalance)}
                </span>
              </p>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="py-3 pr-4 font-semibold" scope="col">
                      Date
                    </th>
                    <th className="px-4 py-3 font-semibold" scope="col">
                      Activity
                    </th>
                    <th className="px-4 py-3 text-right font-semibold" scope="col">
                      Escrow amount
                    </th>
                    <th className="px-4 py-3 font-semibold" scope="col">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {escrowTransactions(debt).map((transaction) => {
                    const escrowAllocation = transaction.allocations.find(
                      (allocation) => allocation.allocationType === 'escrow',
                    );

                    return (
                      <tr key={transaction.id}>
                        <td className="py-4 pr-4 align-top font-medium">
                          {transaction.effectiveDate}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {labelFromValue(transaction.transactionType)}
                        </td>
                        <td className="px-4 py-4 text-right align-top tabular-nums">
                          {escrowAllocation
                            ? formatAbsoluteDollarString(escrowAllocation.amount)
                            : '—'}
                        </td>
                        <td className="px-4 py-4 align-top text-slate-600">
                          {transaction.description}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    ) : null}
  </section>
);
