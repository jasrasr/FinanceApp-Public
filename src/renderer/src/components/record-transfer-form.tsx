import type {
  CreateDebtTransferRequest,
  DebtDetailDto,
  DebtSummaryDto,
} from '../../../shared/debt-contracts';
import { Field, FormActions } from './form-controls';
import { inputClassName } from './form-utils';

export const RecordTransferForm = ({
  debt,
  debts,
  busy,
  fieldErrors,
  onCancel,
  onSubmit,
}: {
  debt: DebtDetailDto;
  debts: readonly DebtSummaryDto[];
  busy: boolean;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  onCancel: () => void;
  onSubmit: (request: CreateDebtTransferRequest) => void;
}): React.JSX.Element => {
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string): string => String(data.get(name) ?? '').trim();
    onSubmit({
      sourceDebtId: debt.id,
      destinationDebtId: value('destinationDebtId'),
      effectiveDate: value('effectiveDate'),
      postingDate: value('postingDate'),
      amount: value('amount'),
      description: value('description') || null,
      sourceReference: null,
    });
  };
  return (
    <form
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={submit}
    >
      <p className="text-sm text-slate-600">
        Transfer existing principal from {debt.name}. Both ledger sides are created
        atomically; this is not a payment or borrowing.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          error={fieldErrors?.destinationDebtId}
          label="Destination debt"
          name="destinationDebtId"
        >
          <select
            className={inputClassName}
            name="destinationDebtId"
            required
            defaultValue=""
          >
            <option disabled value="">
              Select a destination
            </option>
            {debts
              .filter(
                (candidate) =>
                  candidate.id !== debt.id && candidate.status === 'active',
              )
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} · {candidate.creditor}
                </option>
              ))}
          </select>
        </Field>
        <Field error={fieldErrors?.amount} label="Transfer amount" name="amount">
          <input
            className={inputClassName}
            name="amount"
            required
            inputMode="decimal"
          />
        </Field>
        <Field
          error={fieldErrors?.effectiveDate}
          label="Effective date"
          name="effectiveDate"
        >
          <input
            className={inputClassName}
            name="effectiveDate"
            required
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field error={fieldErrors?.postingDate} label="Posting date" name="postingDate">
          <input
            className={inputClassName}
            name="postingDate"
            required
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description" name="description" optional>
            <input
              className={inputClassName}
              name="description"
              placeholder="Balance transfer"
            />
          </Field>
        </div>
      </div>
      <FormActions busy={busy} onCancel={onCancel} submitLabel="Record transfer" />
    </form>
  );
};
