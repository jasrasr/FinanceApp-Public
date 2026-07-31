import type {
  BalanceReconciliationDto,
  CreateBalanceReconciliationRequest,
  DebtDetailDto,
} from '../../../shared/debt-contracts';
import { Field, FormActions } from './form-controls';
import { inputClassName } from './form-utils';

export interface RecordBalanceReconciliationFormProps {
  readonly busy: boolean;
  readonly debt: DebtDetailDto;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly supersedesReconciliation?: BalanceReconciliationDto | null;
  readonly onCancel: () => void;
  readonly onSubmit: (request: CreateBalanceReconciliationRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const value = (data: FormData, name: string): string =>
  String(data.get(name) ?? '').trim();
export const RecordBalanceReconciliationForm = ({
  busy,
  debt,
  fieldErrors,
  supersedesReconciliation = null,
  onCancel,
  onSubmit,
}: RecordBalanceReconciliationFormProps): React.JSX.Element => {
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    onSubmit({
      debtId: debt.id,
      reconciliation: {
        statementDate: value(data, 'reconciliation.statementDate'),
        statementEndingBalance: value(data, 'reconciliation.statementEndingBalance'),
        supersedesReconciliationId: supersedesReconciliation?.id ?? null,
        sourceReference: null,
      },
    });
  };

  return (
    <form
      className="space-y-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      noValidate
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Field
          error={fieldErrors?.['reconciliation.statementDate']}
          label="Reconciliation date"
          name="reconciliation.statementDate"
        >
          <input
            className={inputClassName}
            defaultValue={supersedesReconciliation?.statementDate ?? today()}
            id="reconciliation.statementDate"
            name="reconciliation.statementDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={fieldErrors?.['reconciliation.statementEndingBalance']}
          label="Verified lender balance"
          name="reconciliation.statementEndingBalance"
        >
          <input
            className={inputClassName}
            id="reconciliation.statementEndingBalance"
            inputMode="decimal"
            name="reconciliation.statementEndingBalance"
            required
          />
        </Field>
      </div>

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Reconcile balance" />
    </form>
  );
};
