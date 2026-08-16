# ADR 050: Reusable Income Sources and Net-First Events

## Status

Accepted

## Decision

Add an `income_sources` table and a nullable `source_id` link on
`income_transactions`. Migration 0016 creates and backfills reusable sources
from existing source text; migration 0017 adds the source index. Existing
source snapshots and income values remain unchanged. New transactions select an
active source and require explicit net/take-home income; gross income remains
optional and is never inferred.

Sources are archived instead of deleted so historical income remains auditable.
Income source CRUD is exposed through narrow validated IPC methods and remains
separate from debt-ledger operations.

## Consequences

Bi-weekly paychecks can be entered quickly using a reusable dropdown and current-
session defaults. Cash Flow ratios use actual net income, while gross-income
metrics are unavailable when gross was not explicitly entered. Legacy rows
without a source link remain readable through their source snapshot.
