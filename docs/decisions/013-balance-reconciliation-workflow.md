# ADR 013: Balance Reconciliation Workflow

## Status

Accepted

## Context

Phase five adds statement-based balance reconciliation. The application already
has separate records for original principal, posted ledger activity, confirmed
balance snapshots, and balance reconciliations. The workflow needs to compare a
statement balance to a calculated ledger balance without silently changing
posted activity or confirmed evidence.

## Decision

Record balance reconciliations through a narrow typed IPC operation that runs in
the Electron main process. The renderer submits the debt, statement date,
statement ending balance, status, explanation, source reference, notes, and an
optional approved adjustment.

The main-process service calculates the application balance as original
principal plus non-superseded ledger transaction totals with effective dates on
or before the statement date. It calculates the reconciliation difference as
statement ending balance less application-calculated balance.

Approved adjustments are posted as explicit
`approved_reconciliation_adjustment` transactions with source type
`reconciliation`. The reconciliation links to the adjustment transaction. The
adjustment total must equal the calculated difference.

## Consequences

- Reconciliation history is retained as its own record.
- Statement balances, confirmed snapshots, calculated balances, and posted
  transactions remain distinct.
- Reversed originals remain part of date-sensitive historical ledger
  calculation, with reversal rows offsetting them when the reversal effective
  date is also in range.
- The renderer receives only DTOs and does not receive SQL, Drizzle, filesystem,
  or database access.
- Later dashboard and reporting features can use reconciliation records without
  changing the posted-ledger correction model.
