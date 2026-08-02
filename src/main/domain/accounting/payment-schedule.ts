import type { PaymentFrequency } from '../../../shared/debt-options';

export type ScheduledPaymentStatus =
  | 'upcoming'
  | 'due_today'
  | 'past_due'
  | 'satisfied'
  | 'missing_due_day'
  | 'unsupported_frequency'
  | 'not_required';

export interface ScheduleTermInput {
  readonly effectiveStartDate: string;
  readonly effectiveEndDate: string | null;
  readonly requiredPaymentCents: number;
  readonly paymentFrequency: PaymentFrequency;
}

export interface SchedulePaymentInput {
  readonly id: string;
  readonly effectiveDate: string;
  readonly amountCents: number;
}

export interface ScheduledPaymentObligation {
  readonly dueDate: string;
  readonly priorDueDate: string | null;
  readonly requiredPaymentCents: number;
  readonly paymentsAppliedCents: number;
  readonly remainingAmountDueCents: number;
  readonly status: ScheduledPaymentStatus;
}

export interface ScheduledPaymentResult {
  readonly dueDay: number | null;
  readonly status: ScheduledPaymentStatus;
  readonly priorDueDate: string | null;
  readonly dueDate: string | null;
  readonly nextDueDate: string | null;
  readonly requiredPaymentCents: number;
  readonly paymentsAppliedCents: number;
  readonly remainingAmountDueCents: number;
  readonly earliestPastDueDate: string | null;
  readonly obligations: readonly ScheduledPaymentObligation[];
  readonly reviewMessage: string | null;
}

export interface CalculateScheduledPaymentsInput {
  readonly debtId: string;
  readonly originationDate: string;
  readonly currentBalanceCents: number;
  readonly status: string;
  readonly archivedAtUtc: string | null;
  readonly paymentDueDay: number | null;
  readonly terms: readonly ScheduleTermInput[];
  readonly payments: readonly SchedulePaymentInput[];
  readonly asOfDate: string;
  readonly lookAheadDays?: number;
}

const ACTIVE_STATUS = 'active';
const SUPPORTED_FREQUENCIES = new Set<PaymentFrequency>(['monthly']);

const parseDate = (date: string): Date => {
  const [yearText, monthText, dayText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: string, days: number): string => {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatDate(parsed);
};

const addMonths = (date: string, months: number): string => {
  const parsed = parseDate(date);
  const sourceDay = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  const monthEnd = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
  ).getUTCDate();
  parsed.setUTCDate(Math.min(sourceDay, monthEnd));
  return formatDate(parsed);
};

export const dueDateForMonth = (
  year: number,
  month: number,
  dueDay: number,
): string => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(year, month - 1, Math.min(dueDay, lastDay))));
};

const monthStart = (date: string): string => `${date.slice(0, 7)}-01`;

const firstDueDateOnOrAfter = (startDate: string, dueDay: number): string => {
  const [yearText, monthText] = startDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const candidate = dueDateForMonth(year, month, dueDay);
  return candidate >= startDate ? candidate : addMonths(candidate, 1);
};

const nextMonthlyDueDate = (currentDueDate: string, dueDay: number): string => {
  const [yearText, monthText] = currentDueDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return dueDateForMonth(nextYear, nextMonth, dueDay);
};

const termForDate = (
  terms: readonly ScheduleTermInput[],
  dueDate: string,
): ScheduleTermInput | null =>
  terms.find(
    (term) =>
      term.effectiveStartDate <= dueDate &&
      (term.effectiveEndDate === null || term.effectiveEndDate >= dueDate),
  ) ??
  [...terms].reverse().find((term) => term.effectiveStartDate <= dueDate) ??
  terms[0] ??
  null;

const emptyResult = (
  dueDay: number | null,
  status: ScheduledPaymentStatus,
  reviewMessage: string | null,
): ScheduledPaymentResult => ({
  dueDay,
  status,
  priorDueDate: null,
  dueDate: null,
  nextDueDate: null,
  requiredPaymentCents: 0,
  paymentsAppliedCents: 0,
  remainingAmountDueCents: 0,
  earliestPastDueDate: null,
  obligations: [],
  reviewMessage,
});

const statusForObligation = (
  dueDate: string,
  remainingAmountDueCents: number,
  asOfDate: string,
): ScheduledPaymentStatus => {
  if (remainingAmountDueCents <= 0) return 'satisfied';
  if (dueDate < asOfDate) return 'past_due';
  if (dueDate === asOfDate) return 'due_today';
  return 'upcoming';
};

export const calculateScheduledPayments = ({
  archivedAtUtc,
  asOfDate,
  currentBalanceCents,
  originationDate,
  paymentDueDay,
  payments,
  status,
  terms,
  lookAheadDays = 30,
}: CalculateScheduledPaymentsInput): ScheduledPaymentResult => {
  if (archivedAtUtc || status !== ACTIVE_STATUS || currentBalanceCents <= 0) {
    return emptyResult(paymentDueDay, 'not_required', null);
  }

  if (paymentDueDay === null) {
    return emptyResult(
      paymentDueDay,
      'missing_due_day',
      'Payment due day is missing; edit the debt to add scheduling information.',
    );
  }

  const firstTerm = termForDate(terms, originationDate);
  if (!firstTerm || !SUPPORTED_FREQUENCIES.has(firstTerm.paymentFrequency)) {
    return emptyResult(
      paymentDueDay,
      'unsupported_frequency',
      'Payment frequency is not yet supported for scheduled-payment tracking.',
    );
  }

  const horizon = addDays(asOfDate, lookAheadDays);
  let dueDate = firstDueDateOnOrAfter(monthStart(originationDate), paymentDueDay);
  let priorDueDate: string | null = null;
  const obligations: ScheduledPaymentObligation[] = [];

  while (dueDate <= horizon) {
    const term = termForDate(terms, dueDate);
    if (!term || !SUPPORTED_FREQUENCIES.has(term.paymentFrequency)) {
      priorDueDate = dueDate;
      dueDate = nextMonthlyDueDate(dueDate, paymentDueDay);
      continue;
    }

    if (term.requiredPaymentCents > 0 && dueDate >= originationDate) {
      obligations.push({
        dueDate,
        priorDueDate,
        requiredPaymentCents: term.requiredPaymentCents,
        paymentsAppliedCents: 0,
        remainingAmountDueCents: term.requiredPaymentCents,
        status: statusForObligation(dueDate, term.requiredPaymentCents, asOfDate),
      });
    }
    priorDueDate = dueDate;
    dueDate = nextMonthlyDueDate(dueDate, paymentDueDay);
  }

  if (obligations.length === 0) {
    return emptyResult(paymentDueDay, 'not_required', null);
  }

  const mutableObligations = obligations.map((obligation) => ({ ...obligation }));
  const sortedPayments = [...payments].sort((left, right) => {
    const dateComparison = left.effectiveDate.localeCompare(right.effectiveDate);
    return dateComparison === 0 ? left.id.localeCompare(right.id) : dateComparison;
  });

  for (const payment of sortedPayments) {
    let remainingPayment = payment.amountCents;
    for (const obligation of mutableObligations) {
      if (remainingPayment <= 0) break;
      if (obligation.remainingAmountDueCents <= 0) continue;
      const windowStart = obligation.priorDueDate ?? originationDate;
      const isInCurrentWindow =
        payment.effectiveDate > windowStart &&
        payment.effectiveDate <= obligation.dueDate;
      const isLateForObligation = payment.effectiveDate > obligation.dueDate;
      if (!isInCurrentWindow && !isLateForObligation) continue;

      const applied = Math.min(remainingPayment, obligation.remainingAmountDueCents);
      obligation.paymentsAppliedCents += applied;
      obligation.remainingAmountDueCents -= applied;
      remainingPayment -= applied;

      if (payment.effectiveDate <= obligation.dueDate) {
        break;
      }
    }
  }

  const calculatedObligations = mutableObligations.map((obligation) => ({
    ...obligation,
    status: statusForObligation(
      obligation.dueDate,
      obligation.remainingAmountDueCents,
      asOfDate,
    ),
  }));
  const earliestUnpaid = calculatedObligations.find(
    (obligation) => obligation.remainingAmountDueCents > 0,
  );
  const nextUpcoming = calculatedObligations.find(
    (obligation) => obligation.dueDate >= asOfDate,
  );
  const selected = earliestUnpaid ?? nextUpcoming ?? calculatedObligations.at(-1);
  const earliestPastDue =
    calculatedObligations.find((obligation) => obligation.status === 'past_due')
      ?.dueDate ?? null;

  if (!selected) {
    return emptyResult(paymentDueDay, 'not_required', null);
  }

  return {
    dueDay: paymentDueDay,
    status: selected.status,
    priorDueDate: selected.priorDueDate,
    dueDate: selected.dueDate,
    nextDueDate:
      selected.status === 'satisfied'
        ? (calculatedObligations.find(
            (obligation) => obligation.dueDate > selected.dueDate,
          )?.dueDate ?? null)
        : selected.dueDate,
    requiredPaymentCents: selected.requiredPaymentCents,
    paymentsAppliedCents: selected.paymentsAppliedCents,
    remainingAmountDueCents: selected.remainingAmountDueCents,
    earliestPastDueDate: earliestPastDue,
    obligations: calculatedObligations,
    reviewMessage: null,
  };
};
