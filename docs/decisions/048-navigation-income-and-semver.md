# ADR 048: Grouped Analysis Navigation, Income Assumptions, and Release Bumps

## Status

Accepted

## Decision

Keep Dashboard and Debts as the first primary navigation items, and group
analysis pages under expandable Activity, Planning, and Reports parents. Child
routes remain independently addressable and the groups open automatically when
a child route is active.

Store only effective-dated monthly gross, net, and optional recurring income in
a separate `income_records` table. Income is an analysis assumption and never
posts ledger activity. Cash-burden reports use the latest applicable active
record; missing months remain unavailable.

Use conventional-commit intent for normal release bumping: `feat` is minor,
fix/maintenance is patch, and breaking changes are major. `RELEASE_BUMP` can
explicitly override the inferred bump for an approved exceptional release.

## Consequences

The application remains local and auditable, while the navigation is less
crowded. Feature releases no longer appear as patch-only releases by default.
Income analysis does not attempt to replace Quicken or infer household budgets.
