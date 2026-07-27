# ADR 004: Unified Transaction Ledger

## Status

Accepted

## Context

Payments, draws, interest, fees, penalties, adjustments, and reversals all affect
an obligation and require consistent provenance, dates, status, correction, and
allocation behavior.

## Decision

Use one `debt_transactions` posted ledger with separate
`transaction_allocations`. Signed allocations must equal the signed transaction
total.

Positive totals increase the obligation; negative totals decrease it. Projected
and scenario statuses are prohibited.

## Consequences

- All actual activity follows one audit and correction model.
- Components remain separately reportable.
- Payments require negative totals, while draws and charges require positive
  totals.
- Interest accrual and payoff projections remain outside the posted ledger until
  they become actual activity.
