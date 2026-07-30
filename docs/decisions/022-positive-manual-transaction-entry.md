# ADR 022: Positive Manual Transaction Entry

## Status

Accepted.

## Context

The signed ledger convention is useful for accounting integrity, but requiring a
user to enter payment amounts with a minus sign is error-prone and not acceptable
for the normal manual-entry workflow.

## Decision

Manual transaction-entry forms accept positive currency amounts for the
transaction amount and all allocations. The Electron main-process service
converts those positive values to signed ledger cents based on transaction type
before repository validation and persistence.

- For user-entered payments, the renderer auto-calculates principal as the
  payment amount less positive interest, escrow, fee, and penalty allocations.
  Principal is displayed as read-only in the payment form and cannot become
  negative.
- The service still validates the submitted allocation total and applies the
  signed ledger convention. Renderer auto-calculation is a usability layer, not
  the authoritative accounting control.
- Payments persist as negative ledger activity.
- Borrowing/draws, fees, penalties, interest charges, escrow disbursements,
  escrow refunds, escrow adjustments, principal adjustments, and other manual
  transactions persist as positive ledger activity.
- Escrow deposits are entered as payment escrow allocations and persist with the
  payment's negative sign; escrow-balance calculation treats that as an escrow
  deposit.
- Reversals are generated from an existing posted transaction and keep exact
  offsetting signed amounts internally.
- Reconciliation approved adjustments remain signed because they must equal a
  calculated signed reconciliation difference.

## Consequences

The database schema and historical transactions remain compatible. User-facing
transaction history displays positive amounts and relies on transaction type to
communicate direction. Validation still occurs against signed ledger values after
the service normalization step.
