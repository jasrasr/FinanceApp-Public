# ADR 032: Permanent Debt Deletion and Refinance Chains

## Status

Accepted.

## Context

Most debt corrections should use reversals, superseding transactions, voids,
explicit reconciliations, archive, or restore. The application also needs a
controlled administrative escape hatch for cases where an entire debt and its
history must be reconstructed. Separately, refinances need to connect the old
and new loans without combining their legal obligations or overwriting
historical terms.

## Decision

Permanent debt deletion is exposed only from a debt-detail Danger zone. The
renderer collects exact debt-name confirmation and a second irreversible-action
confirmation. The main process creates a validated manual backup immediately
before deletion, blocks overlapping guarded database operations, and then deletes
the debt and dependent records in one database transaction. The delete removes
terms, transactions, allocations, snapshots, reconciliations, relevant import
provenance, related debt-chain audit events, and payoff scenarios that reference
the debt. On success, a non-sensitive application-level audit event records that
the administrative deletion occurred and references only the validated backup id.

Refinance relationships are nullable self-references on `debts` plus a shared
`financing_chain_name` and optional `refinance_date`. The prior and replacement
debts remain separate obligations with separate ledgers and terms. Reports keep
loan-level balances and activity separate, and add combined financing-chain
balance rows only for shared chain labels. Rollforwards treat the prior payoff as
principal reduction and the replacement principal as a new borrowing once.

## Consequences

- Permanent deletion is recoverable only by restoring the validated backup.
- A failed deletion rolls back all dependent-row changes.
- Deleting one debt nulls refinance pointers from remaining debts rather than
  deleting those separate obligations.
- Refinance reports can show continuous combined chain balances without merging
  histories or double-counting payoff proceeds and replacement principal.
