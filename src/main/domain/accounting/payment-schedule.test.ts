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

const payment = (id: string, effectiveDate: string, amountCents = 100_00) => ({
  id,
  effectiveDate,
  amountCents,
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

  it('leaves partial payments outstanding and combines multiple payments', () => {
    const partial = schedule([
      payment('july-due', '2026-07-15'),
      payment('partial', '2026-08-01', 40_00),
    ]);
    expect(partial.obligations[1]).toMatchObject({
      paymentsAppliedCents: 40_00,
      remainingAmountDueCents: 60_00,
      status: 'due_today',
    });

    const combined = schedule([
      payment('july-due', '2026-07-15'),
      payment('partial-1', '2026-07-16', 40_00),
      payment('partial-2', '2026-08-15', 60_00),
    ]);
    expect(combined.obligations[1]).toMatchObject({
      paymentsAppliedCents: 100_00,
      remainingAmountDueCents: 0,
      status: 'satisfied',
    });
  });

  it('applies late payments to oldest missed obligations before later due dates', () => {
    const result = schedule(
      [payment('late-large', '2026-09-01', 200_00)],
      '2026-09-01',
    );

    expect(result.obligations[0]).toMatchObject({
      dueDate: '2026-07-15',
      status: 'satisfied',
    });
    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-08-15',
      status: 'satisfied',
    });
    expect(result.obligations[2]).toMatchObject({
      dueDate: '2026-09-15',
      status: 'upcoming',
      paymentsAppliedCents: 0,
    });
  });

  it('does not automatically satisfy a future due date with an overpayment', () => {
    const result = schedule(
      [payment('july-due', '2026-07-15'), payment('overpay', '2026-08-15', 250_00)],
      '2026-08-15',
      [term()],
    );

    expect(result.obligations[1]).toMatchObject({
      dueDate: '2026-08-15',
      status: 'satisfied',
      paymentsAppliedCents: 100_00,
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
      [
        payment('july-payment', '2026-07-15', 100_00),
        payment('august-payment', '2026-08-15', 125_00),
      ],
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
});
