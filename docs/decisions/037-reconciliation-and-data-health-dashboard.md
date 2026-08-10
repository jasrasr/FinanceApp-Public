# ADR 037: Reconciliation and Data Health Dashboard

## Status

Accepted for version 1.4.1.

## Decision

Add a separate typed data-health operation and screen. The main-process service
composes health rows from existing active-debt records, ledger balance helper,
current reconciliation lifecycle, qualifying scheduled-payment helper,
transaction status, refinance events, and reversal-integrity checks. Existing
dashboard, report, and accounting calculations are unchanged.

Health rows use Current, Review, and Attention levels. Archived, inactive, and
zero-balance debts do not receive scheduling, credit-limit, missing-payment, or
never-reconciled warnings. Attention is sorted before Review and Current, and
each row drills into the existing debt detail workflow.

For eligible reconciliation or balance-control reasons, the screen also offers
Accept current balance. Confirmation records the application-calculated balance
through the existing reconciliation and snapshot architecture, with an explicit
application-acceptance source and a note that it is not lender verified. It does
not create ledger transactions or alter calculations. Prior reconciliation
history is retained; same-date corrections use the existing supersede behavior.
Configuration and integrity reasons do not expose this action.
