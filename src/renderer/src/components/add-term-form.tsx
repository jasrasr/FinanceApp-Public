import type { AddDebtTermRequest, DebtDetailDto } from '../../../shared/debt-contracts';
import {
  DAY_COUNT_CONVENTIONS,
  INTEREST_CALCULATION_CONVENTIONS,
  INTEREST_RATE_TYPES,
  PAYMENT_FREQUENCIES,
} from '../../../shared/debt-options';
import { Field, FormActions } from './form-controls';
import { inputClassName, labelFromValue } from './form-utils';

export interface AddTermFormProps {
  readonly busy: boolean;
  readonly debt: DebtDetailDto;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly onCancel: () => void;
  readonly onSubmit: (request: AddDebtTermRequest) => void;
}

const value = (data: FormData, name: string): string =>
  String(data.get(name) ?? '').trim();

export const AddTermForm = ({
  busy,
  debt,
  fieldErrors,
  onCancel,
  onSubmit,
}: AddTermFormProps): React.JSX.Element => {
  const latestTerm = debt.terms.at(-1);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const notes = value(data, 'term.notes');

    onSubmit({
      debtId: debt.id,
      expectedUpdatedAtUtc: debt.updatedAtUtc,
      term: {
        effectiveStartDate: value(data, 'term.effectiveStartDate'),
        interestRateType: value(
          data,
          'term.interestRateType',
        ) as AddDebtTermRequest['term']['interestRateType'],
        annualInterestRatePercent: value(data, 'term.annualInterestRatePercent'),
        dayCountConvention: value(
          data,
          'term.dayCountConvention',
        ) as AddDebtTermRequest['term']['dayCountConvention'],
        calculationConvention: value(
          data,
          'term.calculationConvention',
        ) as AddDebtTermRequest['term']['calculationConvention'],
        requiredPayment: value(data, 'term.requiredPayment'),
        paymentFrequency: value(
          data,
          'term.paymentFrequency',
        ) as AddDebtTermRequest['term']['paymentFrequency'],
        notes: notes === '' ? null : notes,
      },
    });
  };

  return (
    <form className="space-y-8" noValidate onSubmit={submit}>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Review the effective date before saving. The latest open term will end on the
        preceding date; the prior record will remain in history.
        {latestTerm ? (
          <span className="mt-1 block font-medium">
            Latest term begins {latestTerm.effectiveStartDate}.
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Field
          error={fieldErrors?.['term.effectiveStartDate']}
          label="New effective start date"
          name="term.effectiveStartDate"
        >
          <input
            className={inputClassName}
            id="term.effectiveStartDate"
            name="term.effectiveStartDate"
            required
            type="date"
          />
        </Field>
        <Field
          error={fieldErrors?.['term.interestRateType']}
          label="Interest-rate type"
          name="term.interestRateType"
        >
          <select
            className={inputClassName}
            defaultValue={latestTerm?.interestRateType ?? 'fixed'}
            id="term.interestRateType"
            name="term.interestRateType"
          >
            {INTEREST_RATE_TYPES.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['term.annualInterestRatePercent']}
          label="Annual interest rate (%)"
          name="term.annualInterestRatePercent"
        >
          <input
            className={inputClassName}
            defaultValue={latestTerm?.annualInterestRatePercent ?? ''}
            id="term.annualInterestRatePercent"
            inputMode="decimal"
            name="term.annualInterestRatePercent"
            required
          />
        </Field>
        <Field
          error={fieldErrors?.['term.dayCountConvention']}
          label="Day-count convention"
          name="term.dayCountConvention"
        >
          <select
            className={inputClassName}
            defaultValue={latestTerm?.dayCountConvention ?? 'actual_365'}
            id="term.dayCountConvention"
            name="term.dayCountConvention"
          >
            {DAY_COUNT_CONVENTIONS.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['term.calculationConvention']}
          label="Calculation convention"
          name="term.calculationConvention"
        >
          <select
            className={inputClassName}
            defaultValue={latestTerm?.calculationConvention ?? 'simple_daily'}
            id="term.calculationConvention"
            name="term.calculationConvention"
          >
            {INTEREST_CALCULATION_CONVENTIONS.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          error={fieldErrors?.['term.requiredPayment']}
          label="Required payment"
          name="term.requiredPayment"
        >
          <input
            className={inputClassName}
            defaultValue={latestTerm?.requiredPayment ?? ''}
            id="term.requiredPayment"
            inputMode="decimal"
            name="term.requiredPayment"
            required
          />
        </Field>
        <Field
          error={fieldErrors?.['term.paymentFrequency']}
          label="Payment frequency"
          name="term.paymentFrequency"
        >
          <select
            className={inputClassName}
            defaultValue={latestTerm?.paymentFrequency ?? 'monthly'}
            id="term.paymentFrequency"
            name="term.paymentFrequency"
          >
            {PAYMENT_FREQUENCIES.map((option) => (
              <option key={option} value={option}>
                {labelFromValue(option)}
              </option>
            ))}
          </select>
        </Field>
        <div className="lg:col-span-2">
          <Field
            error={fieldErrors?.['term.notes']}
            label="Term notes"
            name="term.notes"
            optional
          >
            <textarea
              className={inputClassName}
              id="term.notes"
              name="term.notes"
              rows={4}
            />
          </Field>
        </div>
      </div>
      <FormActions busy={busy} onCancel={onCancel} submitLabel="Add term period" />
    </form>
  );
};
