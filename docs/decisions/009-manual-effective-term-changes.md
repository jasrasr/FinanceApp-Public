# ADR 009: Manual Effective-Term Changes

## Status

Accepted

## Context

Manual users need to record contractual changes without overwriting historical
rates, required payments, or calculation conventions.

## Decision

The Phase 3 workflow permits chronological term appends only. The user must review
and submit an explicit new start date after the latest term start. If the latest
term is open, the service closes it on the preceding financial date and inserts
the new open term in the same transaction.

Overlaps, nonchronological inserts, stale debt versions, and changes to archived
debts are rejected. Original principal and origination date remain opening facts.

## Consequences

- Historical terms remain reproducible.
- Mid-history corrections are deferred until a separately designed correction
  workflow exists.
- Debt-level opening minimum payment and frequency are not treated as the
  effective-dated history.
