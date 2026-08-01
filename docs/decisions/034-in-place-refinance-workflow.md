# ADR 034: In-Place Refinance Workflow

## Status

Accepted.

## Context

The single-user mortgage workflow treats later refinances as continuations of
the same user-managed mortgage history. Creating a second debt for the
replacement loan made reports show the original and refinanced mortgage as
separate obligations, which did not match the user's intended recordkeeping.

Prior schema columns for separate refinance-chain links already exist and may be
present in local test data, so removing those columns or migrations would create
unnecessary compatibility risk.

## Decision

Normal user-facing refinance entry is in-place on the existing debt. The
renderer exposes `Record refinance` on debt detail and sends one narrow typed
IPC request. The main-process service calculates principal immediately before
the refinance date, closes the prior term on the day before the refinance date,
creates a new effective-dated term beginning on the refinance date, posts only a
net `principal_adjustment`, records refinance fees separately, and applies any
escrow handling separately from principal.

A new `refinance_events` table stores the refinance date, pre-refinance
calculated principal, optional lender payoff balance, new principal, net
principal change, financed fees, cash-paid fees, escrow handling, linked term
ids, and linked system transaction ids. The save is atomic.

Legacy separate-debt refinance fields remain in the database and DTOs for
readability, but normal create and edit forms no longer expose them. Permanent
deletion of a legacy test replacement debt clears remaining legacy links safely.

## Consequences

- Debt lists, dashboards, reports, payoff scenarios, and maturity schedules keep
  one continuous debt ID through refinance.
- Rollforwards show only the net refinance principal adjustment and do not show
  the full refinanced principal as a new borrowing.
- Financed and cash-paid refinance fees remain distinguishable for future tax
  and financial analysis.
- Escrow refinance activity remains separate from principal.
- Existing databases with prior separate-debt refinance links remain readable,
  but combined financing-chain trend rows are no longer part of normal reporting.
