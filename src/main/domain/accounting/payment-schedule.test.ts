import { describe, expect, it } from 'vitest';
import {
  calculateScheduledPayments,
  dueDateForMonth,
  type ScheduleTermInput,
} from './payment-schedule';
import type { PaymentFrequency } from '../../../shared/debt-options';

const term = (
  effectiveStartDate = '2026-01-01',
  requiredPaymentCents = 100_00,
  paymentFrequency: PaymentFrequency = 'monthly',
): ScheduleTermInput => ({
  effectiveStartDate,
  effectiveEndDate: null,
  requiredPaymentCents,
  paymentFrequency,
});

const payment = (id: string, effectiveDate: string) => ({
  id,
  effectiveDate,
});

const schedule = (
  payments: readonly ReturnType<typeof payment>[],
  asOfDate = '2026-08-15',
  terms = [term()],
) =>
  calculateScheduledPayments({
    debtId: 'debt-1',
    originationDate: '2026-07-01',
    currentBalanceCents: 1_000_00,
    status: 'active',
    archivedAtUtc: null,
    paymentDueDay: 15,
    terms,
    payments,
    asOfDate,
    lookAheadDays: 30,
  });

describe('scheduled payment calculation', () => {
  it('uses the final calendar day when the configured day is missing', () => {
    expect(dueDateForMonth(2026, 2, 31)).toBe('2026-02-28');
    expect(dueDateForMonth(2028, 2, 31)).toBe('2028-02-29');
    expect(dueDateForMonth(2026, 4, 31)).toBe('2026-04-30');

    const result = calculateScheduledPayments({
      debtId: 'debt-1',
      originationDate: '2026-01-01',
      currentBalanceCents: 1_000_00,
      status: 'active',
      archivedAtUtc: null,
      paymentDueDay: 31,
      terms: [term('2026-01-01')],
      payments: [],
      asOfDate: '2026-03-31',
      lookAheadDays: 0,
    });
    expect(result.obligations.map((obligation) => obligation.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('applies payment-window examples for an August 15 due date', () => {
    expect(schedule([payment('july-due', '2026-07-15')]).obligations[0]).toMatchObject({
      dueDate: '2026-07-15',
      status: 'satisfied',
    });

    expect(
      schedule([
        payment('july-due', '2026-07-15'),
        payment('after-prior', '2026-07-16'),
      ]).obligations[1],
    ).toMatchObject({
      dueDate: '2026-08-15',
      status: 'satisfied',
    });

    expect(
      schedule([
        payment('july-due', '2026-07-15'),
        payment('current-due', '2026-08-15'),
      ]).obligations[1],
    ).toMatchObject({
      dueDate: '2026-08-15',
      status: 'satisfied',
    });

    expect(
      schedule(
        [payment('july-due', '2026-07-15'), payment('late', '2026-08-20')],
        '2026-08-20',
      ).obligations[1],
    ).toMatchObject({
      dueDate: '2026-08-15',
      status: 'satisfied',
    });
  });

  it('treats any qualifying payment as satisfying one obligation regardless of amount', () => {
    const result = schedule([
      payment('july-due', '2026-07-15'),
      payment('small-payment', '2026-08-01'),
    ]);

    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-08-15',
      satisfied: true,
      status: 'satisfied',
    });
    expect(result.nextDueDate).toBe('2026-09-15');
  });

  it('does not let multiple payments in one window satisfy later future obligations', () => {
    const result = schedule([
      payment('july-due', '2026-07-15'),
      payment('first-august-window-payment', '2026-07-16'),
      payment('second-august-window-payment', '2026-08-14'),
    ]);
    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-08-15',
      satisfied: true,
      status: 'satisfied',
    });
    expect(result.nextDueDate).toBe('2026-09-15');
    expect(result.obligations.at(-1)?.dueDate).toBe('2026-08-15');
  });

  it('applies late payments to oldest missed obligations before later due dates', () => {
    const result = schedule([payment('late', '2026-09-01')], '2026-09-01');

    expect(result.obligations[0]).toMatchObject({
      dueDate: '2026-07-15',
      status: 'satisfied',
    });
    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-08-15',
      status: 'past_due',
    });
    expect(result.obligations[2]).toMatchObject({
      dueDate: '2026-09-15',
      status: 'upcoming',
    });
  });

  it('does not automatically satisfy a future due date with an overpayment', () => {
    const result = schedule(
      [payment('july-due', '2026-07-15'), payment('overpay', '2026-08-15')],
      '2026-08-15',
      [term()],
    );

    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-08-15',
      status: 'satisfied',
    });
    expect(result.obligations.at(-1)?.dueDate).toBe('2026-08-15');
  });

  it('flags missing due days and unsupported frequencies for review', () => {
    const missing = calculateScheduledPayments({
      debtId: 'debt-1',
      originationDate: '2026-01-01',
      currentBalanceCents: 100_00,
      status: 'active',
      archivedAtUtc: null,
      paymentDueDay: null,
      terms: [term()],
      payments: [],
      asOfDate: '2026-08-15',
    });
    expect(missing.status).toBe('missing_due_day');

    const unsupported = calculateScheduledPayments({
      debtId: 'debt-1',
      originationDate: '2026-01-01',
      currentBalanceCents: 100_00,
      status: 'active',
      archivedAtUtc: null,
      paymentDueDay: 15,
      terms: [term('2026-01-01', 100_00, 'irregular')],
      payments: [],
      asOfDate: '2026-08-15',
    });
    expect(unsupported.status).toBe('unsupported_frequency');
  });

  it('excludes zero-balance and inactive debts', () => {
    const result = calculateScheduledPayments({
      debtId: 'debt-1',
      originationDate: '2026-01-01',
      currentBalanceCents: 0,
      status: 'active',
      archivedAtUtc: null,
      paymentDueDay: 15,
      terms: [term()],
      payments: [],
      asOfDate: '2026-08-15',
    });
    expect(result.status).toBe('not_required');
  });

  it('honors required-payment changes by due date', () => {
    const result = schedule(
      [payment('july-payment', '2026-07-15'), payment('august-payment', '2026-08-15')],
      '2026-08-15',
      [
        { ...term('2026-01-01', 100_00), effectiveEndDate: '2026-07-31' },
        term('2026-08-01', 125_00),
      ],
    );

    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-08-15',
      requiredPaymentCents: 125_00,
      status: 'satisfied',
    });
  });

  it('satisfies July 12 with a July 1 payment and advances to August 12', () => {
    const result = calculateScheduledPayments({
      debtId: 'debt-1',
      originationDate: '2026-06-01',
      currentBalanceCents: 1_000_00,
      status: 'active',
      archivedAtUtc: null,
      paymentDueDay: 12,
      terms: [term('2026-06-01')],
      payments: [
        payment('june-payment', '2026-06-12'),
        payment('july-payment', '2026-07-01'),
      ],
      asOfDate: '2026-07-13',
      lookAheadDays: 31,
    });

    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-07-12',
      satisfied: true,
      status: 'satisfied',
    });
    expect(result.nextDueDate).toBe('2026-08-12');
    expect(result.earliestPastDueDate).toBeNull();
  });

  it('satisfies August 1 with an August 1 payment and advances to September 1', () => {
    const result = calculateScheduledPayments({
      debtId: 'debt-1',
      originationDate: '2026-07-01',
      currentBalanceCents: 1_000_00,
      status: 'active',
      archivedAtUtc: null,
      paymentDueDay: 1,
      terms: [term('2026-07-01')],
      payments: [
        payment('july-payment', '2026-07-01'),
        payment('august-payment', '2026-08-01'),
      ],
      asOfDate: '2026-08-02',
      lookAheadDays: 31,
    });

    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-08-01',
      satisfied: true,
      status: 'satisfied',
    });
    expect(result.nextDueDate).toBe('2026-09-01');
    expect(result.earliestPastDueDate).toBeNull();
  });
});
