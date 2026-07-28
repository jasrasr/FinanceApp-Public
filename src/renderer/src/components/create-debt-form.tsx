import { useRef, useState } from 'react';
import type { CreateDebtRequest } from '../../../shared/debt-contracts';
import {
  DAY_COUNT_CONVENTIONS,
  DEBT_STATUSES,
  INTEREST_CALCULATION_CONVENTIONS,
  INTEREST_RATE_TYPES,
  PAYMENT_FREQUENCIES,
  TAX_CATEGORIES,
  USER_SELECTABLE_DEBT_TYPES,
} from '../../../shared/debt-options';
import { Field, FormActions } from './form-controls';
import { inputClassName, labelFromValue } from './form-utils';

export interface CreateDebtFormProps {
  readonly busy: boolean;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly onCancel: () => void;
  readonly onSubmit: (request: CreateDebtRequest) => void;
}

const value = (data: FormData, name: string): string =>
  String(data.get(name) ?? '').trim();
const nullableValue = (data: FormData, name: string): string | null => {
  const result = value(data, name);
  return result === '' ? null : result;
};

const Options = ({ values }: { readonly values: readonly string[] }) => (
  <>
    {values.map((option) => (
      <option key={option} value={option}>
        {labelFromValue(option)}
      </option>
    ))}
  </>
);

export const CreateDebtForm = ({
  busy,
  fieldErrors,
  onCancel,
  onSubmit,
}: CreateDebtFormProps): React.JSX.Element => {
  const [originationDate, setOriginationDate] = useState('');
  const [termStartDate, setTermStartDate] = useState('');
  const termDateWasEdited = useRef(false);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    onSubmit({
      debt: {
        name: value(data, 'debt.name'),
        creditor: value(data, 'debt.creditor'),
        ownerEntity: 'Personal',
        debtType: value(data, 'debt.debtType') as CreateDebtRequest['debt']['debtType'],
        purpose: value(data, 'debt.purpose'),
        status: value(data, 'debt.status') as CreateDebtRequest['debt']['status'],
        originalPrincipal: value(data, 'debt.originalPrincipal'),
        originationDate: value(data, 'debt.originationDate'),
        maturityDate: nullableValue(data, 'debt.maturityDate'),
        minimumPayment: value(data, 'initialTerm.requiredPayment'),
        paymentFrequency: value(
          data,
          'initialTerm.paymentFrequency',
        ) as CreateDebtRequest['debt']['paymentFrequency'],
        creditLimit: nullableValue(data, 'debt.creditLimit'),
        collateralDescription: nullableValue(data, 'debt.collateralDescription'),
        taxCategory: value(
          data,
          'debt.taxCategory',
        ) as CreateDebtRequest['debt']['taxCategory'],
        deductiblePercentage: value(data, 'debt.deductiblePercentage'),
        notes: nullableValue(data, 'debt.notes'),
      },
      initialTerm: {
        effectiveStartDate: value(data, 'initialTerm.effectiveStartDate'),
        interestRateType: value(
          data,
          'initialTerm.interestRateType',
        ) as CreateDebtRequest['initialTerm']['interestRateType'],
        annualInterestRatePercent: value(data, 'initialTerm.annualInterestRatePercent'),
        dayCountConvention: value(
          data,
          'initialTerm.dayCountConvention',
        ) as CreateDebtRequest['initialTerm']['dayCountConvention'],
        calculationConvention: value(
          data,
          'initialTerm.calculationConvention',
        ) as CreateDebtRequest['initialTerm']['calculationConvention'],
        requiredPayment: value(data, 'initialTerm.requiredPayment'),
        paymentFrequency: value(
          data,
          'initialTerm.paymentFrequency',
        ) as CreateDebtRequest['initialTerm']['paymentFrequency'],
        notes: nullableValue(data, 'initialTerm.notes'),
      },
    });
  };

  return (
    <form className="space-y-8" noValidate onSubmit={submit}>
      <section aria-labelledby="debt-fields-heading">
        <h3 className="text-lg font-semibold text-slate-950" id="debt-fields-heading">
          Debt information
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Required fields are marked with an asterisk. Original principal is an opening
          fact, not a current balance.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field error={fieldErrors?.['debt.name']} label="Debt name" name="debt.name">
            <input
              className={inputClassName}
              id="debt.name"
              name="debt.name"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.['debt.creditor']}
            label="Creditor"
            name="debt.creditor"
          >
            <input
              className={inputClassName}
              id="debt.creditor"
              name="debt.creditor"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.['debt.debtType']}
            label="Debt type"
            name="debt.debtType"
          >
            <select
              className={inputClassName}
              defaultValue="mortgage"
              id="debt.debtType"
              name="debt.debtType"
            >
              <Options values={USER_SELECTABLE_DEBT_TYPES} />
            </select>
          </Field>
          <Field error={fieldErrors?.['debt.status']} label="Status" name="debt.status">
            <select
              className={inputClassName}
              defaultValue="active"
              id="debt.status"
              name="debt.status"
            >
              <Options values={DEBT_STATUSES} />
            </select>
          </Field>
          <Field
            error={fieldErrors?.['debt.originalPrincipal']}
            hint="Enter dollars and cents. This is not a current balance."
            label="Original principal"
            name="debt.originalPrincipal"
          >
            <input
              className={inputClassName}
              id="debt.originalPrincipal"
              inputMode="decimal"
              name="debt.originalPrincipal"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.['debt.originationDate']}
            label="Origination date"
            name="debt.originationDate"
          >
            <input
              className={inputClassName}
              id="debt.originationDate"
              name="debt.originationDate"
              onChange={(event) => {
                const nextDate = event.currentTarget.value;
                setOriginationDate(nextDate);
                if (!termDateWasEdited.current) setTermStartDate(nextDate);
              }}
              required
              type="date"
              value={originationDate}
            />
          </Field>
          <Field
            error={fieldErrors?.['debt.maturityDate']}
            label="Maturity date"
            name="debt.maturityDate"
            optional
          >
            <input
              className={inputClassName}
              id="debt.maturityDate"
              name="debt.maturityDate"
              type="date"
            />
          </Field>
          <Field
            error={fieldErrors?.['debt.creditLimit']}
            hint="Required for HELOC and credit-card obligations; otherwise use only when the obligation has a contractual limit."
            label="Credit limit"
            name="debt.creditLimit"
            optional
          >
            <input
              className={inputClassName}
              id="debt.creditLimit"
              inputMode="decimal"
              name="debt.creditLimit"
            />
          </Field>
          <Field
            error={fieldErrors?.['debt.taxCategory']}
            label="Tax category"
            name="debt.taxCategory"
          >
            <select
              className={inputClassName}
              defaultValue="unknown"
              id="debt.taxCategory"
              name="debt.taxCategory"
            >
              <Options values={TAX_CATEGORIES} />
            </select>
          </Field>
          <Field
            error={fieldErrors?.['debt.deductiblePercentage']}
            hint="Enter a percentage from 0 through 100."
            label="Deductible percentage"
            name="debt.deductiblePercentage"
          >
            <input
              className={inputClassName}
              defaultValue="0"
              id="debt.deductiblePercentage"
              inputMode="decimal"
              name="debt.deductiblePercentage"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.['debt.collateralDescription']}
            label="Collateral description"
            name="debt.collateralDescription"
            optional
          >
            <input
              className={inputClassName}
              id="debt.collateralDescription"
              name="debt.collateralDescription"
            />
          </Field>
          <div className="lg:col-span-2">
            <Field
              error={fieldErrors?.['debt.purpose']}
              label="Purpose"
              name="debt.purpose"
            >
              <input
                className={inputClassName}
                id="debt.purpose"
                name="debt.purpose"
                required
              />
            </Field>
          </div>
          <div className="lg:col-span-2">
            <Field
              error={fieldErrors?.['debt.notes']}
              label="Debt notes"
              name="debt.notes"
              optional
            >
              <textarea
                className={inputClassName}
                id="debt.notes"
                name="debt.notes"
                rows={3}
              />
            </Field>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="initial-term-heading"
        className="border-t border-slate-200 pt-8"
      >
        <h3 className="text-lg font-semibold text-slate-950" id="initial-term-heading">
          Initial effective-dated terms
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Review the effective date explicitly. Later changes create new historical
          periods and never overwrite this record.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field
            error={fieldErrors?.['initialTerm.effectiveStartDate']}
            label="Effective start date"
            name="initialTerm.effectiveStartDate"
          >
            <input
              className={inputClassName}
              id="initialTerm.effectiveStartDate"
              name="initialTerm.effectiveStartDate"
              onChange={(event) => {
                termDateWasEdited.current = true;
                setTermStartDate(event.currentTarget.value);
              }}
              required
              type="date"
              value={termStartDate}
            />
          </Field>
          <Field
            error={fieldErrors?.['initialTerm.interestRateType']}
            label="Interest-rate type"
            name="initialTerm.interestRateType"
          >
            <select
              className={inputClassName}
              defaultValue="fixed"
              id="initialTerm.interestRateType"
              name="initialTerm.interestRateType"
            >
              <Options values={INTEREST_RATE_TYPES} />
            </select>
          </Field>
          <Field
            error={fieldErrors?.['initialTerm.annualInterestRatePercent']}
            hint="Enter the annual percentage rate; use 0 for a zero-rate term."
            label="Annual interest rate (%)"
            name="initialTerm.annualInterestRatePercent"
          >
            <input
              className={inputClassName}
              id="initialTerm.annualInterestRatePercent"
              inputMode="decimal"
              name="initialTerm.annualInterestRatePercent"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.['initialTerm.dayCountConvention']}
            label="Day-count convention"
            name="initialTerm.dayCountConvention"
          >
            <select
              className={inputClassName}
              defaultValue="actual_365"
              id="initialTerm.dayCountConvention"
              name="initialTerm.dayCountConvention"
            >
              <Options values={DAY_COUNT_CONVENTIONS} />
            </select>
          </Field>
          <Field
            error={fieldErrors?.['initialTerm.calculationConvention']}
            label="Calculation convention"
            name="initialTerm.calculationConvention"
          >
            <select
              className={inputClassName}
              defaultValue="simple_daily"
              id="initialTerm.calculationConvention"
              name="initialTerm.calculationConvention"
            >
              <Options values={INTEREST_CALCULATION_CONVENTIONS} />
            </select>
          </Field>
          <Field
            error={fieldErrors?.['initialTerm.requiredPayment']}
            label="Required payment"
            name="initialTerm.requiredPayment"
          >
            <input
              className={inputClassName}
              id="initialTerm.requiredPayment"
              inputMode="decimal"
              name="initialTerm.requiredPayment"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.['initialTerm.paymentFrequency']}
            label="Term payment frequency"
            name="initialTerm.paymentFrequency"
          >
            <select
              className={inputClassName}
              defaultValue="monthly"
              id="initialTerm.paymentFrequency"
              name="initialTerm.paymentFrequency"
            >
              <Options values={PAYMENT_FREQUENCIES} />
            </select>
          </Field>
          <div className="lg:col-span-2">
            <Field
              error={fieldErrors?.['initialTerm.notes']}
              label="Term notes"
              name="initialTerm.notes"
              optional
            >
              <textarea
                className={inputClassName}
                id="initialTerm.notes"
                name="initialTerm.notes"
                rows={3}
              />
            </Field>
          </div>
        </div>
      </section>

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Create debt" />
    </form>
  );
};
