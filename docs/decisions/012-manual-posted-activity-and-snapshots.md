# ADR 012: Manual Posted Activity and Balance Snapshots

## Status

Accepted

## Context

Phase four adds the first end-to-end workflow for recording actual debt activity
after the debt master and term history exist. The application needs to preserve
posted activity, separate confirmed balance evidence, and support reversals
without exposing raw database access to the renderer.

## Decision

Expose three narrow operations through the typed debt bridge:

- Record a posted transaction with explicit allocations.
- Record a confirmed balance snapshot.
- Reverse a posted transaction by creating a linked reversal row.

The renderer submits user-friendly entry values, the main process validates and
normalizes them, and the repository writes the ledger and audit rows in a single
transaction. Balance snapshots are stored as separate evidence records and do not
rewrite posted ledger activity.

## Consequences

- Posted activity remains separate from confirmed evidence and future
  projections.
- Reversals preserve the original row for auditability.
- The renderer still cannot access SQL, the filesystem, or the database
  connection directly.
- Later reconciliation and projection features can build on the same posted
  ledger without redesigning the bridge surface.
