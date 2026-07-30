# ADR 026: Posted Transaction Editing and Debt-History Chart Interaction

- Date: 2026-07-30
- Status: Accepted

## Context

User acceptance testing showed two usability issues:

- Ordinary posted-transaction entry mistakes required a manual reverse-and-repost
  process.
- The debt-history chart needed stricter chart-only zoom behavior, readable
  dynamic date ticks, cleaner lines, and less default tabular clutter.

The application must still preserve posted financial history, avoid generic IPC
or renderer database access, and keep report display state separate from stored
financial data.

## Decision

Eligible transaction edits are implemented as one user-facing Edit and Save
workflow backed by an atomic superseding correction:

1. Preserve the original posted transaction.
2. Insert an exact linked reversal of the original and its allocations.
3. Insert a corrected replacement transaction linked to the original.
4. Mark the original as superseded.
5. Mark affected current reconciliations as exceptions requiring review when the
   edited activity is dated on or before the statement date.

The renderer receives only the narrow `editDebtTransaction` bridge operation and
explicit DTO validation. The renderer does not receive raw IPC, SQL, Drizzle,
filesystem, or database access.

The debt-history chart uses a non-passive wheel listener scoped to the chart
element, changes the visible date domain on zoom, recalculates ticks from the
visible range, draws clean continuous lines without normal point markers, and
keeps detailed chart data inside an optional disclosure that is closed by
default.

## Consequences

- Posted financial rows are not silently overwritten or deleted.
- Current balances, dashboards, reports, exports, and payoff starting balances
  must use the current transaction chain and skip superseded originals plus their
  edit reversals.
- Existing malformed reversals remain data-integrity exceptions; the edit
  workflow does not repair them silently.
- Chart visibility and zoom state remain report-session UI state and are not
  persisted.
- No schema migration is required because the existing transaction status and
  self-reference columns support this correction model.
