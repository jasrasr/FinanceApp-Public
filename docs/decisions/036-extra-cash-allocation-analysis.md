# ADR 036: Extra-Cash Allocation Analysis Boundary

## Status

Accepted.

## Decision

Extra-cash analysis runs in the Electron main process using application-calculated
balances and the existing payoff engine. Lump sums are applied to copied
scenario inputs only. Eligibility exclusions and unused cash are explicit.
The analysis IPC operation is read-only; it does not create transactions,
reconciliations, or saved scenarios. A future save action must reuse the saved
payoff-scenario architecture and preserve the assumptions and engine version.

## Consequences

The ledger remains unchanged while users compare strategies. Unsupported or
ambiguous debt terms are visible before analysis. Results remain projections,
not confirmed balances or actual activity.
