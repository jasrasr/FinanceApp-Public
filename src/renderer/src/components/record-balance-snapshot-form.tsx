import type {
  CreateBalanceSnapshotRequest,
  DebtDetailDto,
} from '../../../shared/debt-contracts';
import { BALANCE_SNAPSHOT_SOURCE_TYPES } from '../../../shared/debt-options';
import { Field, FormActions } from './form-controls';
import { inputClassName, labelFromValue } from './form-utils';

export interface RecordBalanceSnapshotFormProps {
  readonly busy: boolean;
  readonly debt: DebtDetailDto;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly onCancel: () => void;
  readonly onSubmit: (request: CreateBalanceSnapshotRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const value = (data: FormData, name: string): string =>
  String(data.get(name) ?? '').trim();
const nullableValue = (data: FormData, name: string): string | null => {
  const result = value(data, name);
  return result === '' ? null : result;
};

export const RecordBalanceSnapshotForm = ({
  busy,
  debt,
  fieldErrors,
  onCancel,
  onSubmit,
}: RecordBalanceSnapshotFormProps): React.JSX.Element => {
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    onSubmit({
      debtId: debt.id,
      snapshot: {
        effectiveDate: value(data, 'snapshot.effectiveDate'),
        confirmedBalance: value(data, 'snapshot.confirmedBalance'),
        sourceType: value(
          data,
          'snapshot.sourceType',
        ) as CreateBalanceSnapshotRequest['snapshot']['sourceType'],
        sourceReference: nullableValue(data, 'snapshot.sourceReference'),
        notes: nullableValue(data, 'snapshot.notes'),
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
        Record a confirmed balance snapshot as evidence for a specific date. This
        records support only and does not overwrite the posted ledger.
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Field
          error={fieldErrors?.['snapshot.effectiveDate']}
          label="Effective date"
          name="snapshot.effectiveDate"
        >
          <input
            className={inputClassName}
            defaultValue={today()}
            id="snapshot.effectiveDate"
            name="snapshot.effectiveDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={fieldErrors?.['snapshot.confirmedBalance']}
          hint="Enter the confirmed balance as a positive currency amount."
          label="Confirmed balance"
          name="snapshot.confirmedBalance"
        >
          <input
            className={inputClassName}
            id="snapshot.confirmedBalance"
            inputMode="decimal"
            name="snapshot.confirmedBalance"
            required
          />
        </Field>
        <Field
          error={fieldErrors?.['snapshot.sourceType']}
          label="Source type"
          name="snapshot.sourceType"
        >
          <select
            className={inputClassName}
            defaultValue="manual"
            id="snapshot.sourceType"
            name="snapshot.sourceType"
          >
            {BALANCE_SNAPSHOT_SOURCE_TYPES.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['snapshot.sourceReference']}
          label="Source reference"
          name="snapshot.sourceReference"
          optional
        >
          <input
            className={inputClassName}
            id="snapshot.sourceReference"
            name="snapshot.sourceReference"
          />
        </Field>
        <div className="lg:col-span-2">
          <Field
            error={fieldErrors?.['snapshot.notes']}
            label="Notes"
            name="snapshot.notes"
            optional
          >
            <textarea
              className={inputClassName}
              id="snapshot.notes"
              name="snapshot.notes"
              rows={4}
            />
          </Field>
        </div>
      </div>

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Record snapshot" />
    </form>
  );
};
