import type {
  CreateDebtTransactionRequest,
  DebtDetailDto,
} from '../../../shared/debt-contracts';
import { useMemo, useState } from 'react';
import { POSTED_ACTIVITY_TRANSACTION_TYPES } from '../../../shared/debt-options';
import { Field, FormActions } from './form-controls';
import { inputClassName, labelFromValue } from './form-utils';

export interface RecordTransactionFormProps {
  readonly busy: boolean;
  readonly debt: DebtDetailDto;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly onCancel: () => void;
  readonly onSubmit: (request: CreateDebtTransactionRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const value = (data: FormData, name: string): string =>
  String(data.get(name) ?? '').trim();
const nullableValue = (data: FormData, name: string): string | null => {
  const result = value(data, name);
  return result === '' ? null : result;
};

const transactionTypeOptions = POSTED_ACTIVITY_TRANSACTION_TYPES;
const allocationFields = [
  ['principal', 'Principal'],
  ['interest', 'Interest'],
  ['escrow', 'Escrow'],
  ['fee', 'Fees'],
  ['penalty', 'Penalties'],
] as const;

const nonPrincipalPaymentAllocationFields = [
  ['interest', 'Interest'],
  ['escrow', 'Escrow'],
  ['fee', 'Fees'],
  ['penalty', 'Penalties'],
] as const;
type NonPrincipalPaymentAllocationField =
  (typeof nonPrincipalPaymentAllocationFields)[number][0];

const isNonPrincipalPaymentAllocationField = (
  fieldName: (typeof allocationFields)[number][0],
): fieldName is NonPrincipalPaymentAllocationField =>
  nonPrincipalPaymentAllocationFields.some(([name]) => name === fieldName);

const parseCurrencyInputCents = (raw: string): number | null => {
  const normalized = raw.replace(/[$,\s]/g, '');
  if (normalized === '') return 0;
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;

  const [dollars = '0', cents = ''] = normalized.split('.');
  return Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
};

const currencyInputFromCents = (cents: number): string => (cents / 100).toFixed(2);

export const RecordTransactionForm = ({
  busy,
  debt,
  fieldErrors,
  onCancel,
  onSubmit,
}: RecordTransactionFormProps): React.JSX.Element => {
  const [transactionType, setTransactionType] =
    useState<CreateDebtTransactionRequest['transaction']['transactionType']>('payment');
  const [totalAmount, setTotalAmount] = useState('');
  const [nonPrincipalAllocations, setNonPrincipalAllocations] = useState({
    interest: '',
    escrow: '',
    fee: '',
    penalty: '',
  });

  const autoPrincipal = useMemo(() => {
    if (transactionType !== 'payment') {
      return { cents: null, display: '', negative: false };
    }

    const totalCents = parseCurrencyInputCents(totalAmount);
    const allocationCents = Object.values(nonPrincipalAllocations).map(
      parseCurrencyInputCents,
    );
    if (totalCents === null || allocationCents.some((amount) => amount === null)) {
      return { cents: null, display: '', negative: false };
    }

    const nonPrincipalTotal = (allocationCents as number[]).reduce(
      (total, amount) => total + amount,
      0,
    );
    const remaining = totalCents - nonPrincipalTotal;

    return {
      cents: remaining,
      display: remaining >= 0 ? currencyInputFromCents(remaining) : '',
      negative: remaining < 0,
    };
  }, [nonPrincipalAllocations, totalAmount, transactionType]);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    const transactionDate = value(data, 'transaction.transactionDate');
    const transactionType = value(
      data,
      'transaction.transactionType',
    ) as CreateDebtTransactionRequest['transaction']['transactionType'];

    if (transactionType === 'payment' && autoPrincipal.negative) {
      return;
    }

    const principalAllocation =
      transactionType === 'payment'
        ? autoPrincipal.cents === null || autoPrincipal.cents === 0
          ? null
          : currencyInputFromCents(autoPrincipal.cents)
        : nullableValue(data, 'transaction.allocations.principal');

    onSubmit({
      debtId: debt.id,
      transaction: {
        transactionType,
        effectiveDate: transactionDate,
        postingDate: transactionDate,
        status: 'posted',
        totalAmount: value(data, 'transaction.totalAmount'),
        description: nullableValue(data, 'transaction.description'),
        sourceType: 'manual',
        sourceReference: null,
        allocations: {
          principal: principalAllocation,
          interest: nullableValue(data, 'transaction.allocations.interest'),
          escrow: nullableValue(data, 'transaction.allocations.escrow'),
          fee: nullableValue(data, 'transaction.allocations.fee'),
          penalty: nullableValue(data, 'transaction.allocations.penalty'),
          extraPrincipal: null,
          other: null,
        },
      },
    });
  };

  return (
    <form
      className="space-y-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      noValidate
      onSubmit={submit}
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Record posted activity only. Use one transaction date for both posting and
        accounting effect. Enter positive amounts; Debt Tracker applies the accounting
        direction from the transaction type. Mortgage escrow deposits are tracked
        separately from principal.
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Field
          error={fieldErrors?.['transaction.transactionType']}
          label="Transaction type"
          name="transaction.transactionType"
        >
          <select
            className={inputClassName}
            defaultValue="payment"
            id="transaction.transactionType"
            name="transaction.transactionType"
            onChange={(event) =>
              setTransactionType(
                event.target
                  .value as CreateDebtTransactionRequest['transaction']['transactionType'],
              )
            }
          >
            {transactionTypeOptions.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['transaction.effectiveDate']}
          label="Transaction date"
          name="transaction.transactionDate"
        >
          <input
            className={inputClassName}
            defaultValue={today()}
            id="transaction.transactionDate"
            name="transaction.transactionDate"
            required
            type="date"
          />
        </Field>
        <Field label="Transaction status" name="transaction.status" optional>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
            Posted only in this phase
          </div>
        </Field>
        <Field
          error={fieldErrors?.['transaction.totalAmount']}
          hint="Enter a positive currency amount. Debt Tracker applies the sign from the transaction type."
          label="Amount"
          name="transaction.totalAmount"
        >
          <input
            className={inputClassName}
            id="transaction.totalAmount"
            inputMode="decimal"
            name="transaction.totalAmount"
            onChange={(event) => setTotalAmount(event.target.value)}
            required
            value={totalAmount}
          />
        </Field>
        <div className="lg:col-span-2">
          <Field
            error={fieldErrors?.['transaction.description']}
            label="Description"
            name="transaction.description"
            optional
          >
            <input
              className={inputClassName}
              id="transaction.description"
              name="transaction.description"
            />
          </Field>
        </div>
      </div>

      <section aria-labelledby="transaction-allocations-heading">
        <div>
          <h3
            className="text-lg font-semibold text-slate-950"
            id="transaction-allocations-heading"
          >
            Allocation amounts
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Fill only the classifications that apply. Enter positive allocation amounts
            that reconcile to the amount above before Debt Tracker applies the
            accounting direction.
          </p>
          {transactionType === 'payment' ? (
            <p className="mt-2 text-sm text-slate-600">
              Principal is auto-calculated as the payment amount remaining after
              interest, escrow, fees, and penalties.
            </p>
          ) : null}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {allocationFields.map(([fieldName, label]) => (
            <Field
              error={fieldErrors?.[`transaction.allocations.${fieldName}`]}
              label={label}
              name={`transaction.allocations.${fieldName}`}
              optional
              key={fieldName}
            >
              <input
                aria-describedby={
                  transactionType === 'payment' && fieldName === 'principal'
                    ? 'auto-principal-helper'
                    : undefined
                }
                className={
                  transactionType === 'payment' && fieldName === 'principal'
                    ? `${inputClassName} bg-slate-100 text-slate-700`
                    : inputClassName
                }
                id={`transaction.allocations.${fieldName}`}
                inputMode="decimal"
                key={`${transactionType}-${fieldName}`}
                name={`transaction.allocations.${fieldName}`}
                onChange={
                  transactionType === 'payment' &&
                  isNonPrincipalPaymentAllocationField(fieldName)
                    ? (event) =>
                        setNonPrincipalAllocations((current) => ({
                          ...current,
                          [fieldName]: event.target.value,
                        }))
                    : undefined
                }
                readOnly={transactionType === 'payment' && fieldName === 'principal'}
                value={
                  transactionType === 'payment'
                    ? fieldName === 'principal'
                      ? autoPrincipal.display
                      : isNonPrincipalPaymentAllocationField(fieldName)
                        ? nonPrincipalAllocations[fieldName]
                        : ''
                    : undefined
                }
              />
              {transactionType === 'payment' && fieldName === 'principal' ? (
                <p className="mt-1 text-xs text-slate-500" id="auto-principal-helper">
                  Auto-calculated from the payment amount less nonprincipal allocations.
                </p>
              ) : null}
            </Field>
          ))}
        </div>
        {transactionType === 'payment' && autoPrincipal.negative ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Interest, escrow, fees, and penalties cannot exceed the payment amount.
          </p>
        ) : null}
      </section>

      <FormActions
        busy={busy}
        disabled={transactionType === 'payment' && autoPrincipal.negative}
        onCancel={onCancel}
        submitLabel="Record transaction"
      />
    </form>
  );
};
