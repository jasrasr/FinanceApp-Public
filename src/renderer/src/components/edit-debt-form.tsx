import type { DebtDetailDto, UpdateDebtRequest } from '../../../shared/debt-contracts';
import {
  DEBT_STATUSES,
  DEBT_TYPES,
  TAX_CATEGORIES,
} from '../../../shared/debt-options';
import { Field, FormActions } from './form-controls';
import { inputClassName, labelFromValue } from './form-utils';

export interface EditDebtFormProps {
  readonly busy: boolean;
  readonly debt: DebtDetailDto;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly onCancel: () => void;
  readonly onSubmit: (request: UpdateDebtRequest) => void;
}

const value = (data: FormData, name: string): string =>
  String(data.get(name) ?? '').trim();
const nullableValue = (data: FormData, name: string): string | null => {
  const result = value(data, name);
  return result === '' ? null : result;
};

export const EditDebtForm = ({
  busy,
  debt,
  fieldErrors,
  onCancel,
  onSubmit,
}: EditDebtFormProps): React.JSX.Element => {
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    onSubmit({
      id: debt.id,
      expectedUpdatedAtUtc: debt.updatedAtUtc,
      changes: {
        name: value(data, 'changes.name'),
        creditor: value(data, 'changes.creditor'),
        ownerEntity: value(data, 'changes.ownerEntity'),
        debtType: value(
          data,
          'changes.debtType',
        ) as UpdateDebtRequest['changes']['debtType'],
        purpose: value(data, 'changes.purpose'),
        status: value(data, 'changes.status') as UpdateDebtRequest['changes']['status'],
        maturityDate: nullableValue(data, 'changes.maturityDate'),
        creditLimit: nullableValue(data, 'changes.creditLimit'),
        collateralDescription: nullableValue(data, 'changes.collateralDescription'),
        taxCategory: value(
          data,
          'changes.taxCategory',
        ) as UpdateDebtRequest['changes']['taxCategory'],
        deductiblePercentage: value(data, 'changes.deductiblePercentage'),
        notes: nullableValue(data, 'changes.notes'),
      },
    });
  };

  return (
    <form className="space-y-8" noValidate onSubmit={submit}>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Original principal and origination date are opening facts and cannot be edited
        here. Rate, payment, and calculation changes require a new effective-dated term.
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Field
          error={fieldErrors?.['changes.name']}
          label="Debt name"
          name="changes.name"
        >
          <input
            className={inputClassName}
            defaultValue={debt.name}
            id="changes.name"
            name="changes.name"
            required
          />
        </Field>
        <Field
          error={fieldErrors?.['changes.creditor']}
          label="Creditor"
          name="changes.creditor"
        >
          <input
            className={inputClassName}
            defaultValue={debt.creditor}
            id="changes.creditor"
            name="changes.creditor"
            required
          />
        </Field>
        <Field
          error={fieldErrors?.['changes.ownerEntity']}
          label="Owner or entity"
          name="changes.ownerEntity"
        >
          <input
            className={inputClassName}
            defaultValue={debt.ownerEntity}
            id="changes.ownerEntity"
            name="changes.ownerEntity"
            required
          />
        </Field>
        <Field
          error={fieldErrors?.['changes.debtType']}
          label="Debt type"
          name="changes.debtType"
        >
          <select
            className={inputClassName}
            defaultValue={debt.debtType}
            id="changes.debtType"
            name="changes.debtType"
          >
            {DEBT_TYPES.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['changes.status']}
          label="Status"
          name="changes.status"
        >
          <select
            className={inputClassName}
            defaultValue={debt.status}
            id="changes.status"
            name="changes.status"
          >
            {DEBT_STATUSES.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['changes.maturityDate']}
          label="Maturity date"
          name="changes.maturityDate"
          optional
        >
          <input
            className={inputClassName}
            defaultValue={debt.maturityDate ?? ''}
            id="changes.maturityDate"
            name="changes.maturityDate"
            type="date"
          />
        </Field>
        <Field
          error={fieldErrors?.['changes.creditLimit']}
          hint="Required for HELOC and credit-card obligations."
          label="Credit limit"
          name="changes.creditLimit"
          optional
        >
          <input
            className={inputClassName}
            defaultValue={debt.creditLimit ?? ''}
            id="changes.creditLimit"
            inputMode="decimal"
            name="changes.creditLimit"
          />
        </Field>
        <Field
          error={fieldErrors?.['changes.taxCategory']}
          label="Tax category"
          name="changes.taxCategory"
        >
          <select
            className={inputClassName}
            defaultValue={debt.taxCategory}
            id="changes.taxCategory"
            name="changes.taxCategory"
          >
            {TAX_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['changes.deductiblePercentage']}
          label="Deductible percentage"
          name="changes.deductiblePercentage"
        >
          <input
            className={inputClassName}
            defaultValue={debt.deductiblePercentage}
            id="changes.deductiblePercentage"
            inputMode="decimal"
            name="changes.deductiblePercentage"
            required
          />
        </Field>
        <Field
          error={fieldErrors?.['changes.collateralDescription']}
          label="Collateral description"
          name="changes.collateralDescription"
          optional
        >
          <input
            className={inputClassName}
            defaultValue={debt.collateralDescription ?? ''}
            id="changes.collateralDescription"
            name="changes.collateralDescription"
          />
        </Field>
        <div className="lg:col-span-2">
          <Field
            error={fieldErrors?.['changes.purpose']}
            label="Purpose"
            name="changes.purpose"
          >
            <input
              className={inputClassName}
              defaultValue={debt.purpose}
              id="changes.purpose"
              name="changes.purpose"
              required
            />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Field
            error={fieldErrors?.['changes.notes']}
            label="Debt notes"
            name="changes.notes"
            optional
          >
            <textarea
              className={inputClassName}
              defaultValue={debt.notes ?? ''}
              id="changes.notes"
              name="changes.notes"
              rows={4}
            />
          </Field>
        </div>
      </div>

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Save changes" />
    </form>
  );
};
