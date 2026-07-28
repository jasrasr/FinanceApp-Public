# ADR 023: Allocation-Based Balances and Automatic Reconciliation Status

## Status

Accepted.

## Context

User acceptance testing found that debt balances were reduced by the full payment
transaction total. That incorrectly treated payment interest and escrow
allocations as principal reduction. The same issue affected dashboard, report,
reconciliation, payoff, and debt-detail calculations that depend on the ledger
balance.

Testing also found that normal reconciliation entry required a user-selected
status even though the application already calculates the statement difference.

## Decision

Application-calculated debt balances will be derived from allocation-level
activity rather than full transaction totals.

- Principal and legacy extra-principal allocations affect debt principal.
- Payment interest allocations do not reduce debt principal.
- Payment escrow allocations do not reduce debt principal.
- Fees and penalties affect debt balance under their documented charge treatment.
- Interest allocations affect debt balance only when posted as an interest-charge
  transaction.
- Escrow deposits, disbursements, refunds, adjustments, and reversals affect a
  separate escrow balance.
- Reversals offset the same component treatment as the original transaction.

Normal reconciliation status is assigned by the main-process service:

- Zero difference: reconciled.
- Nonzero difference: exception requiring follow-up.
- Nonzero difference resolved by an approved linked adjustment: reconciled with
  approved adjustment.

The renderer no longer asks the user to select a normal reconciliation status or
enter explanation/supporting notes during the ordinary reconcile-balance
workflow.

## Consequences

Dashboard balances, report balances, reconciliation balances, payoff scenario
starting balances, and debt cards now use the same allocation-based debt-balance
calculation. Interest paid and escrow deposits no longer reduce principal.

Escrow balance is reported separately. User-facing interest activity is displayed
as a positive expense amount, with internal signed ledger storage preserved.

## Alternatives Considered

- Continue using transaction totals and subtract escrow allocations. Rejected
  because it still treated payment interest as principal reduction.
- Add a separate principal-balance table. Rejected for now because the existing
  posted ledger and allocations provide sufficient auditable source data.
- Keep manual reconciliation status selection. Rejected because the application
  can determine the normal status directly from the calculated difference and
  approved adjustment linkage.
