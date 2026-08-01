import { useState } from 'react';
import type {
  DebtDetailDto,
  RecordRefinanceRequest,
} from '../../../shared/debt-contracts';
import {
  DAY_COUNT_CONVENTIONS,
  INTEREST_CALCULATION_CONVENTIONS,
  INTEREST_RATE_TYPES,
  PAYMENT_FREQUENCIES,
} from '../../../shared/debt-options';
import { Field, FormActions } from './form-controls';
import { formatDollarString } from './display-format';
import { inputClassName, labelFromValue } from './form-utils';

export interface RecordRefinanceFormProps {
  readonly busy: boolean;
  readonly debt: DebtDetailDto;
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
  readonly onCancel: () => void;
  readonly onSubmit: (request: RecordRefinanceRequest) => void;
}

const ESCROW_HANDLING_OPTIONS = [
  'carry_forward',
  'reset_opening_balance',
  'refund',
  'new_deposit',
] as const;

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

export const RecordRefinanceForm = ({
  busy,
  debt,
  fieldErrors,
  onCancel,
  onSubmit,
}: RecordRefinanceFormProps): React.JSX.Element => {
  const [escrowHandling, setEscrowHandling] =
    useState<(typeof ESCROW_HANDLING_OPTIONS)[number]>('carry_forward');

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    onSubmit({
      debtId: debt.id,
      expectedUpdatedAtUtc: debt.updatedAtUtc,
      refinanceDate: value(data, 'refinanceDate'),
      newRefinancedPrincipal: value(data, 'newRefinancedPrincipal'),
      newAnnualInterestRatePercent: value(data, 'newAnnualInterestRatePercent'),
      newRequiredPayment: value(data, 'newRequiredPayment'),
      newPaymentFrequency: value(
        data,
        'newPaymentFrequency',
      ) as RecordRefinanceRequest['newPaymentFrequency'],
      newMaturityDate: value(data, 'newMaturityDate'),
      interestRateType: value(
        data,
        'interestRateType',
      ) as RecordRefinanceRequest['interestRateType'],
      dayCountConvention: value(
        data,
        'dayCountConvention',
      ) as RecordRefinanceRequest['dayCountConvention'],
      calculationConvention: value(
        data,
        'calculationConvention',
      ) as RecordRefinanceRequest['calculationConvention'],
      financedFees: value(data, 'financedFees'),
      cashFees: value(data, 'cashFees'),
      escrowHandling: value(
        data,
        'escrowHandling',
      ) as RecordRefinanceRequest['escrowHandling'],
      escrowAmount: nullableValue(data, 'escrowAmount'),
      lenderPayoffBalance: nullableValue(data, 'lenderPayoffBalance'),
      payoffDifferenceAcknowledged: data.get('payoffDifferenceAcknowledged') === 'on',
      notes: nullableValue(data, 'notes'),
    });
  };

  return (
    <form className="space-y-8" noValidate onSubmit={submit}>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        The refinance stays on {debt.name}. Debt Tracker posts only the net principal
        change and creates a new effective-dated term beginning on the refinance date.
      </div>

      <section aria-labelledby="refinance-core-heading">
        <h3
          className="text-lg font-semibold text-slate-950"
          id="refinance-core-heading"
        >
          Refinance terms
        </h3>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-600">Current calculated balance</dt>
            <dd className="mt-1 text-slate-950">
              {formatDollarString(debt.currentBalance)} as of{' '}
              {debt.currentBalanceEffectiveDate}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-600">Current term</dt>
            <dd className="mt-1 text-slate-950">
              {debt.currentTerm.annualInterestRatePercent}% through{' '}
              {debt.currentTerm.effectiveEndDate ?? 'open end'}
            </dd>
          </div>
        </dl>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field
            error={fieldErrors?.refinanceDate}
            label="Refinance date"
            name="refinanceDate"
          >
            <input
              className={inputClassName}
              id="refinanceDate"
              name="refinanceDate"
              required
              type="date"
            />
          </Field>
          <Field
            error={fieldErrors?.newRefinancedPrincipal}
            label="New refinanced principal balance"
            name="newRefinancedPrincipal"
          >
            <input
              className={inputClassName}
              id="newRefinancedPrincipal"
              inputMode="decimal"
              name="newRefinancedPrincipal"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.newAnnualInterestRatePercent}
            label="New annual interest rate (%)"
            name="newAnnualInterestRatePercent"
          >
            <input
              className={inputClassName}
              id="newAnnualInterestRatePercent"
              inputMode="decimal"
              name="newAnnualInterestRatePercent"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.newRequiredPayment}
            label="New required payment"
            name="newRequiredPayment"
          >
            <input
              className={inputClassName}
              id="newRequiredPayment"
              inputMode="decimal"
              name="newRequiredPayment"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.newPaymentFrequency}
            label="New payment frequency"
            name="newPaymentFrequency"
          >
            <select
              className={inputClassName}
              defaultValue={debt.paymentFrequency}
              id="newPaymentFrequency"
              name="newPaymentFrequency"
            >
              <Options values={PAYMENT_FREQUENCIES} />
            </select>
          </Field>
          <Field
            error={fieldErrors?.newMaturityDate}
            label="New maturity date"
            name="newMaturityDate"
          >
            <input
              className={inputClassName}
              id="newMaturityDate"
              name="newMaturityDate"
              required
              type="date"
            />
          </Field>
          <Field
            error={fieldErrors?.interestRateType}
            label="Rate type"
            name="interestRateType"
          >
            <select
              className={inputClassName}
              defaultValue={debt.currentTerm.interestRateType}
              id="interestRateType"
              name="interestRateType"
            >
              <Options values={INTEREST_RATE_TYPES} />
            </select>
          </Field>
          <Field
            error={fieldErrors?.dayCountConvention}
            label="Day-count convention"
            name="dayCountConvention"
          >
            <select
              className={inputClassName}
              defaultValue={debt.currentTerm.dayCountConvention}
              id="dayCountConvention"
              name="dayCountConvention"
            >
              <Options values={DAY_COUNT_CONVENTIONS} />
            </select>
          </Field>
          <Field
            error={fieldErrors?.calculationConvention}
            label="Calculation convention"
            name="calculationConvention"
          >
            <select
              className={inputClassName}
              defaultValue={debt.currentTerm.calculationConvention}
              id="calculationConvention"
              name="calculationConvention"
            >
              <Options values={INTEREST_CALCULATION_CONVENTIONS} />
            </select>
          </Field>
        </div>
      </section>

      <section
        aria-labelledby="refinance-fees-heading"
        className="border-t border-slate-200 pt-8"
      >
        <h3
          className="text-lg font-semibold text-slate-950"
          id="refinance-fees-heading"
        >
          Fees and escrow
        </h3>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field
            error={fieldErrors?.financedFees}
            label="Refinance fees financed into loan"
            name="financedFees"
          >
            <input
              className={inputClassName}
              defaultValue="0"
              id="financedFees"
              inputMode="decimal"
              name="financedFees"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.cashFees}
            label="Refinance fees paid in cash"
            name="cashFees"
          >
            <input
              className={inputClassName}
              defaultValue="0"
              id="cashFees"
              inputMode="decimal"
              name="cashFees"
              required
            />
          </Field>
          <Field
            error={fieldErrors?.escrowHandling}
            label="Escrow handling"
            name="escrowHandling"
          >
            <select
              className={inputClassName}
              id="escrowHandling"
              name="escrowHandling"
              onChange={(event) =>
                setEscrowHandling(
                  event.currentTarget.value as (typeof ESCROW_HANDLING_OPTIONS)[number],
                )
              }
              value={escrowHandling}
            >
              <Options values={ESCROW_HANDLING_OPTIONS} />
            </select>
          </Field>
          {escrowHandling !== 'carry_forward' ? (
            <Field
              error={fieldErrors?.escrowAmount}
              label="Escrow amount"
              name="escrowAmount"
            >
              <input
                className={inputClassName}
                defaultValue="0"
                id="escrowAmount"
                inputMode="decimal"
                name="escrowAmount"
                required
              />
            </Field>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="refinance-reconciliation-heading"
        className="border-t border-slate-200 pt-8"
      >
        <h3
          className="text-lg font-semibold text-slate-950"
          id="refinance-reconciliation-heading"
        >
          Reconciliation review
        </h3>
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field
            error={fieldErrors?.lenderPayoffBalance}
            label="Lender payoff balance"
            name="lenderPayoffBalance"
            optional
          >
            <input
              className={inputClassName}
              id="lenderPayoffBalance"
              inputMode="decimal"
              name="lenderPayoffBalance"
            />
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="flex gap-3 text-sm font-medium text-slate-900">
              <input
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700"
                name="payoffDifferenceAcknowledged"
                type="checkbox"
              />
              <span>
                I reviewed the calculated payoff balance and documented any lender
                payoff difference.
              </span>
            </label>
            {fieldErrors?.payoffDifferenceAcknowledged ? (
              <p className="mt-2 text-sm text-red-700">
                {fieldErrors.payoffDifferenceAcknowledged.join(' ')}
              </p>
            ) : null}
          </div>
          <div className="lg:col-span-2">
            <Field
              error={fieldErrors?.notes}
              label="Refinance notes"
              name="notes"
              optional
            >
              <textarea className={inputClassName} id="notes" name="notes" rows={4} />
            </Field>
          </div>
        </div>
      </section>

      <FormActions busy={busy} onCancel={onCancel} submitLabel="Record refinance" />
    </form>
  );
};
