# ADR 035: Debt Payment Due-Date Scheduling

## Status

Accepted for version 1.1.0. Corrected in versions 1.1.1 and 1.1.2.

## Context

Debt Tracker needs to identify unpaid scheduled payments without changing
established principal, interest, escrow, reconciliation, refinance, backup,
reporting, or payoff calculations. Existing debts may not have known due dates,
and required payments are already effective-dated through `debt_terms`.

## Decision

Store a nullable `payment_due_day` on `debts`. This is the minimum schema needed
for the single-user workflow and avoids rewriting historical term records.
Existing debts keep `NULL` and are flagged for scheduling review; no default due
day is invented during migration.

The due-day field controls only the scheduled calendar day. Required amount and
payment frequency come from the effective `debt_terms` row for each due date,
but required amount does not control due-date satisfaction. Monthly schedules
clamp day 29, 30, or 31 to the final day of shorter months and return to the
configured day in later months when available.

Scheduled-payment determination is a pure main-process domain calculation shared
by dashboard and debt detail DTO mapping. The renderer displays the resulting
status but does not apply payment transactions to obligations.

Only current posted payment transactions qualify. Reversed, voided, superseded,
generated reversal, draw, fee, interest-charge, escrow, adjustment, refinance,
and other nonpayment rows do not satisfy scheduled obligations. Corrected
replacement payments qualify. Payments are applied by financial transaction date
to the oldest eligible unpaid obligation. Any qualifying posted payment satisfies
one scheduled obligation regardless of amount. Multiple payments in the same
payment window still satisfy only that one obligation, and overpayments do not
automatically satisfy future due dates in this phase.

The 1.1.1 correction removed amount-based satisfaction from the scheduler. The
root cause was that the 1.1.0 scheduler compared payment totals with the
effective required payment, so a user-recorded payment before or on a due date
could fail to advance the due date when it was below the recorded term payment.
The date boundaries were kept inclusive for the current due date; the domain rule
now models the user's actual workflow that every qualifying posted payment
satisfies one lender minimum obligation.

Version 1.1.2 adds a nullable, explicitly reviewed scheduling start boundary.
The prior implementation used origination as the first payment window and
could consume current payments against years of synthetic historical obligations.
The first window now begins inclusively at the boundary; later windows retain
their exclusive prior-due-date lower bound. Exceptional scheduling-only
confirmations are persisted outside the ledger and can be removed with audit
history.

The dashboard shows unpaid past-due obligations regardless of age, due-today
obligations, and upcoming unpaid obligations within 30 days.

## Consequences

- Migration `0009_mysterious_weapon_omega.sql` rebuilds `debts` to add the
  nullable `payment_due_day` column with a `1..31` check.
- No historical payment dates, transaction rows, reconciliations, refinance
  events, payoff scenarios, or reports are rewritten.
- Non-monthly frequencies are not silently modeled as monthly schedules; they
  are excluded from upcoming-payment tracking when reliable scheduling support
  is not implemented.
- Future releases can move due-day configuration into effective-dated term
  records if user requirements prove that due-day history must vary by term.
