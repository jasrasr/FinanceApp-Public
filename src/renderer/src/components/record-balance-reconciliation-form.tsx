import { useState } from 'react';
import type {
  CreateBalanceReconciliationRequest,
  DebtDetailDto,
} from '../../../shared/debt-contracts';
import { RECONCILIATION_STATUSES } from '../../../shared/debt-options';
import { Field, FormActions } from './form-controls';
import { inputClassName, labelFromValue } from './form-utils';

export interface RecordBalanceReconciliationFormProps {
  readonly busy: boolean;
  readonly debt: DebtDetailDto;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly onCancel: () => void;
  readonly onSubmit: (request: CreateBalanceReconciliationRequest) => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const value = (data: FormData, name: string): string =>
  String(data.get(name) ?? '').trim();
const nullableValue = (data: FormData, name: string): string | null => {
  const result = value(data, name);
  return result === '' ? null : result;
};

const allocationFields = [
  ['principal', 'Principal'],
  ['interest', 'Interest'],
  ['escrow', 'Escrow'],
  ['fee', 'Fees'],
  ['penalty', 'Penalties'],
] as const;

export const RecordBalanceReconciliationForm = ({
  busy,
  debt,
  fieldErrors,
  onCancel,
  onSubmit,
}: RecordBalanceReconciliationFormProps): React.JSX.Element => {
  const [status, setStatus] =
    useState<
      CreateBalanceReconciliationRequest['reconciliation']['reconciliationStatus']
    >('unreconciled');
  const includesAdjustment = status === 'reconciled_with_adjustment';

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    onSubmit({
      debtId: debt.id,
      reconciliation: {
        statementDate: value(data, 'reconciliation.statementDate'),
        statementEndingBalance: value(data, 'reconciliation.statementEndingBalance'),
        reconciliationStatus: status,
        explanation: nullableValue(data, 'reconciliation.explanation'),
        approvedAdjustment: includesAdjustment
          ? {
              totalAmount: value(data, 'reconciliation.approvedAdjustment.totalAmount'),
              description: nullableValue(
                data,
                'reconciliation.approvedAdjustment.description',
              ),
              allocations: {
                principal: nullableValue(
                  data,
                  'reconciliation.approvedAdjustment.allocations.principal',
                ),
                interest: nullableValue(
                  data,
                  'reconciliation.approvedAdjustment.allocations.interest',
                ),
                escrow: nullableValue(
                  data,
                  'reconciliation.approvedAdjustment.allocations.escrow',
                ),
                fee: nullableValue(
                  data,
                  'reconciliation.approvedAdjustment.allocations.fee',
                ),
                penalty: nullableValue(
                  data,
                  'reconciliation.approvedAdjustment.allocations.penalty',
                ),
                extraPrincipal: null,
                other: null,
              },
            }
          : null,
        sourceReference: null,
        supportingNotes: nullableValue(data, 'reconciliation.supportingNotes'),
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
        Enter the verified lender balance once. Debt Tracker records it as supporting
        confirmed balance evidence and calculates the ledger difference through the same
        date without overwriting posted activity.
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Field
          error={fieldErrors?.['reconciliation.statementDate']}
          label="Reconciliation date"
          name="reconciliation.statementDate"
        >
          <input
            className={inputClassName}
            defaultValue={today()}
            id="reconciliation.statementDate"
            name="reconciliation.statementDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={fieldErrors?.['reconciliation.statementEndingBalance']}
          hint="Enter the verified lender balance as a positive obligation."
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
        <Field
          error={fieldErrors?.['reconciliation.reconciliationStatus']}
          label="Reconciliation status"
          name="reconciliation.reconciliationStatus"
        >
          <select
            className={inputClassName}
            id="reconciliation.reconciliationStatus"
            name="reconciliation.reconciliationStatus"
            onChange={(event) =>
              setStatus(
                event.currentTarget
                  .value as CreateBalanceReconciliationRequest['reconciliation']['reconciliationStatus'],
              )
            }
            value={status}
          >
            {RECONCILIATION_STATUSES.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <div className="lg:col-span-2">
          <Field
            error={fieldErrors?.['reconciliation.explanation']}
            label="Explanation"
            name="reconciliation.explanation"
            optional
          >
            <textarea
              className={inputClassName}
              id="reconciliation.explanation"
              name="reconciliation.explanation"
              rows={3}
            />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Field
            error={fieldErrors?.['reconciliation.supportingNotes']}
            label="Supporting notes"
            name="reconciliation.supportingNotes"
            optional
          >
            <textarea
              className={inputClassName}
              id="reconciliation.supportingNotes"
              name="reconciliation.supportingNotes"
              rows={3}
            />
          </Field>
        </div>
      </div>

      {includesAdjustment ? (
        <section
          className="rounded-lg border border-amber-200 bg-amber-50 p-5"
          aria-labelledby="reconciliation-adjustment-heading"
        >
          <h3
            className="text-base font-semibold text-amber-950"
            id="reconciliation-adjustment-heading"
          >
            Approved adjustment transaction
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            The adjustment is posted to the ledger and linked to this reconciliation.
            Its signed total must equal the calculated difference.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Field
              error={fieldErrors?.['reconciliation.approvedAdjustment.totalAmount']}
              label="Adjustment total"
              name="reconciliation.approvedAdjustment.totalAmount"
            >
              <input
                className={inputClassName}
                id="reconciliation.approvedAdjustment.totalAmount"
                inputMode="decimal"
                name="reconciliation.approvedAdjustment.totalAmount"
                required
              />
            </Field>
            <Field
              error={fieldErrors?.['reconciliation.approvedAdjustment.description']}
              label="Adjustment description"
              name="reconciliation.approvedAdjustment.description"
              optional
            >
              <input
                className={inputClassName}
                id="reconciliation.approvedAdjustment.description"
                name="reconciliation.approvedAdjustment.description"
              />
            </Field>
            {allocationFields.map(([fieldName, label]) => (
              <Field
                error={
                  fieldErrors?.[
                    `reconciliation.approvedAdjustment.allocations.${fieldName}`
                  ]
                }
                label={label}
                name={`reconciliation.approvedAdjustment.allocations.${fieldName}`}
                optional
                key={fieldName}
              >
                <input
                  className={inputClassName}
                  id={`reconciliation.approvedAdjustment.allocations.${fieldName}`}
                  inputMode="decimal"
                  name={`reconciliation.approvedAdjustment.allocations.${fieldName}`}
                />
              </Field>
            ))}
          </div>
        </section>
      ) : null}

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Reconcile balance" />
    </form>
  );
};
