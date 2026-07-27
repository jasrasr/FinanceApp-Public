# ADR 010: Debt Archive and Restore

## Status

Accepted

## Context

Users need to remove inactive records from the working list without deleting
financial history.

## Decision

Archival sets `archived_at_utc`; restoration clears it. Both actions require an
explicit renderer confirmation, use optimistic concurrency, preserve all related
records, and insert non-sensitive audit events.

Obligation status remains independent. The default list filters on a null archive
timestamp, and an explicit option includes archived debts.

## Consequences

- Permanent deletion is not exposed.
- Terms and future related records remain intact.
- Archived records can be reviewed and restored.
