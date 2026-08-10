# ADR 039: Read-only twelve-month debt-service outlook

## Status

Accepted for version 1.6.0.

## Context

Debt Tracker needs a forward-looking cash-planning view without turning
planning values into ledger activity or inventing revolving-debt statement
minimums.

## Decision

Add a main-process Debt outlook service and typed IPC operation. It produces
exactly twelve calendar-month rows beginning with the current month. Required
payments come from active, positive-balance debts with known due-day and
scheduling-start data and the effective-dated monthly term at each due date.
Missing or unsupported scheduling is reported separately rather than rendered
as a fabricated obligation.

Optional saved scenarios are recalculated from the current application balance
through the existing payoff engine. Their debt allocations provide planned
extra payments, projected ending balances, and payoff events; the scenario and
ledger remain unchanged. Required-payments-only uses zero scenario extras.
Maturities, effective term changes, and refinance events are added to the same
date-ordered event timeline.

## Consequences

- The renderer receives validated monthly totals, detail rows, warnings, and
  events through a narrow bridge and does not duplicate accounting logic.
- The chart and monthly details reconcile to the same service-produced rows.
- Revolving debts use recorded required payments and do not forecast purchases,
  draws, or changing statement minimums.
- Debts without scheduling data remain visible as review warnings but do not
  create false cash obligations.
