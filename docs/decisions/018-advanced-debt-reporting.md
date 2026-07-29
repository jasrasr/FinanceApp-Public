# ADR 018: Advanced Debt Reporting

## Status

Accepted.

## Context

Phase ten adds advanced debt reports without adding posting, backup, export, or
packaging workflows. Reports must not edit financial records, must label balance
basis clearly, and must not mix calculated ledger balances, confirmed snapshots,
projected balances, or scenario results without explicit labels.

The application already has tested services for ledger balances, current
effective terms, dashboard metrics, reconciliations, and payoff scenarios.

## Decision

Advanced reports are generated in the Electron main process through the existing
debt-maintenance service. The renderer receives only a typed `DebtReportsDto`
through a fixed `getDebtReports` bridge method and cannot query SQL, Drizzle, the
filesystem, or generic IPC.

No new database tables or migrations are added for phase ten. Reports are
computed from existing debts, debt terms, posted transactions, allocations,
confirmed snapshots, reconciliations, and saved payoff scenarios.

Every report section carries a basis object containing:

- Section title.
- Date range.
- Effective date.
- Balance basis.
- Assumptions.
- Warnings.

Report period generation is bounded by the current reporting-history start date,
January 1, 2019. Requests for All activity or custom ranges before that date are
clamped for reporting only; older underlying financial records are preserved.

Rollforward and balance-history reports use application-calculated ledger
balances. Confirmed snapshots are displayed separately. Interest-rate and
extra-payment sensitivity reports reuse the payoff scenario engine rather than
duplicating projection logic. Unsupported payoff terms inherit the engine's
warnings.

Principal and interest trend visuals are renderer presentation of the existing
activity-trend rows. They provide bar and line options for the same report date
range and filters, display principal reduction and interest expense as positive
user-facing activity series, and remain paired with tabular detail.

Actual-versus-plan variance uses saved payoff scenarios as the plan source. Since
saved scenario records currently do not persist monthly planned balances, the
report labels planned reduction and variance as limited when those amounts cannot
be determined from saved results.

## Consequences

- The reporting feature remains read-only and does not create financial-record
  mutation paths.
- Report output is reproducible from committed schema and current application
  services, but it is not a persisted report snapshot.
- The narrow IPC model is preserved.
- Sensitivity reporting stays aligned with the tested projection engine.
- More precise actual-versus-plan reporting will require a future scenario
  result shape that stores period-by-period plan balances or a separate planned
  activity model.
