# ADR 021: User-Acceptance Simplification and Escrow Tracking

## Status

Accepted.

## Context

The first user-acceptance pass identified workflow friction from fields and
actions that were useful for a broader accounting system but unnecessary for a
single-user personal debt tracker. Mortgage escrow also needed complete tracking
without treating escrow as debt principal or interest.

## Decision

- Keep the database compatible by retaining existing debt owner/entity,
  debt-level payment/frequency, and legacy allocation columns.
- Remove Owner/Entity from normal user-facing forms, debt cards, detail screens,
  report filters, and exports. New manual debts default the compatibility value
  to `Personal`.
- Remove student, medical, and tax from new manual debt-type options while
  leaving existing records readable and requiring deliberate conversion.
- Make effective-dated debt terms authoritative for required payment and payment
  frequency. New manual debts populate retained debt-level compatibility columns
  from the initial term.
- Use one manual Transaction Date and map it to both effective and posting dates.
- Treat user-facing principal allocation as all principal paid, including any
  additional principal. Preserve legacy extra-principal rows for compatibility.
- Track mortgage escrow in the posted ledger with explicit escrow transaction
  types and escrow allocations, but exclude escrow activity from calculated debt
  principal balances.
- Replace separate user-facing snapshot entry with Reconcile Balance, which
  transactionally creates a supporting confirmed snapshot and reconciliation.
- Collapse advanced report sections by default.

## Consequences

- Existing databases remain readable without a destructive migration.
- Some compatibility fields remain in the schema even though they are no longer
  visible in ordinary workflows.
- Escrow balances are calculated separately from debt balances and require
  reports/exports to label escrow activity explicitly.
- Future cleanup must not remove legacy schema fields without a migration plan
  that preserves user data.
