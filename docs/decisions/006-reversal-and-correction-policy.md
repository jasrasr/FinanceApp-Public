# ADR 006: Reversal and Correction Policy

## Status

Accepted

## Context

Silent edits or deletions of posted financial activity weaken traceability and
can invalidate reconciliations.

## Decision

Correct a posted transaction with a linked reversal or superseding transaction.
A reversal carries the exact opposite total and allocations. The original
remains stored and changes to the explicit `reversed` status. Each original can
be reversed or superseded at most once.

## Consequences

- Posted history is retained.
- Reversals are independently dated and auditable.
- Audit events refer to transaction identifiers without unnecessarily repeating
  financial values.
