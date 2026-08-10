# ADR 037: Reconciliation and Data Health Dashboard

## Status

Accepted for version 1.4.0.

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
