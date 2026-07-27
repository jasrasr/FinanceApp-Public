import type {
  CreateDebtTransactionRequest,
  DebtDetailDto,
} from '../../../shared/debt-contracts';
import {
  MANUAL_ENTRY_SOURCE_TYPES,
  POSTED_ACTIVITY_TRANSACTION_TYPES,
} from '../../../shared/debt-options';
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
const sourceTypeOptions = MANUAL_ENTRY_SOURCE_TYPES;
const allocationFields = [
  ['principal', 'Principal'],
  ['interest', 'Interest'],
  ['escrow', 'Escrow'],
  ['fee', 'Fees'],
  ['penalty', 'Penalties'],
  ['extraPrincipal', 'Extra principal'],
  ['other', 'Other'],
] as const;

export const RecordTransactionForm = ({
  busy,
  debt,
  fieldErrors,
  onCancel,
  onSubmit,
}: RecordTransactionFormProps): React.JSX.Element => {
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    onSubmit({
      debtId: debt.id,
      transaction: {
        transactionType: value(
          data,
          'transaction.transactionType',
        ) as CreateDebtTransactionRequest['transaction']['transactionType'],
        effectiveDate: value(data, 'transaction.effectiveDate'),
        postingDate: value(data, 'transaction.postingDate'),
        status: 'posted',
        totalAmount: value(data, 'transaction.totalAmount'),
        description: value(data, 'transaction.description'),
        sourceType: value(
          data,
          'transaction.sourceType',
        ) as CreateDebtTransactionRequest['transaction']['sourceType'],
        sourceReference: nullableValue(data, 'transaction.sourceReference'),
        allocations: {
          principal: nullableValue(data, 'transaction.allocations.principal'),
          interest: nullableValue(data, 'transaction.allocations.interest'),
          escrow: nullableValue(data, 'transaction.allocations.escrow'),
          fee: nullableValue(data, 'transaction.allocations.fee'),
          penalty: nullableValue(data, 'transaction.allocations.penalty'),
          extraPrincipal: nullableValue(data, 'transaction.allocations.extraPrincipal'),
          other: nullableValue(data, 'transaction.allocations.other'),
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
        Record a posted transaction only. Enter signed amounts: payments are usually
        negative, while draws and charges are usually positive.
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
          >
            {transactionTypeOptions.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['transaction.sourceType']}
          label="Source type"
          name="transaction.sourceType"
        >
          <select
            className={inputClassName}
            defaultValue="manual"
            id="transaction.sourceType"
            name="transaction.sourceType"
          >
            {sourceTypeOptions.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['transaction.effectiveDate']}
          label="Effective date"
          name="transaction.effectiveDate"
        >
          <input
            className={inputClassName}
            defaultValue={today()}
            id="transaction.effectiveDate"
            name="transaction.effectiveDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={fieldErrors?.['transaction.postingDate']}
          label="Posting date"
          name="transaction.postingDate"
        >
          <input
            className={inputClassName}
            defaultValue={today()}
            id="transaction.postingDate"
            name="transaction.postingDate"
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
          hint="Enter a signed currency amount. The sign must match the transaction type."
          label="Total amount"
          name="transaction.totalAmount"
        >
          <input
            className={inputClassName}
            id="transaction.totalAmount"
            inputMode="decimal"
            name="transaction.totalAmount"
            required
          />
        </Field>
        <Field
          error={fieldErrors?.['transaction.sourceReference']}
          label="Source reference"
          name="transaction.sourceReference"
          optional
        >
          <input
            className={inputClassName}
            id="transaction.sourceReference"
            name="transaction.sourceReference"
          />
        </Field>
        <div className="lg:col-span-2">
          <Field
            error={fieldErrors?.['transaction.description']}
            label="Description"
            name="transaction.description"
          >
            <input
              className={inputClassName}
              id="transaction.description"
              name="transaction.description"
              required
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
            Fill only the classifications that apply. Amounts must reconcile to the
            signed total.
          </p>
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
                className={inputClassName}
                id={`transaction.allocations.${fieldName}`}
                inputMode="decimal"
                name={`transaction.allocations.${fieldName}`}
              />
            </Field>
          ))}
        </div>
      </section>

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Record transaction" />
    </form>
  );
};
