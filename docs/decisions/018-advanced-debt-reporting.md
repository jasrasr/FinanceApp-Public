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

Rollforward and balance-history reports use application-calculated balances.
Principal rollforward borrowings use the same basis as the dashboard: opening
principal for debts originated during the period plus posted borrowing/draw
principal allocations, with duplicate prevention for explicit same-date opening
draws. The principal rollforward equation is Beginning principal + Borrowings -
Principal reduction + Principal adjustments = Ending principal. Cash payments
and interest activity are retained only as supplemental columns; they do not
drive the principal equation. Escrow deposits, escrow disbursements, escrow
refunds, and escrow adjustments do not enter principal adjustments. Confirmed
snapshots are displayed separately.

Debt balance history by obligation supersedes the separate total-only balance
trend section. It visualizes application-calculated ending principal balances by
period with one line per debt and one total-debt line. Renderer-only chart state
supports session-scoped line visibility toggles and X-axis zoom; it does not
write report preferences or financial data. The chart remains paired with a
period-end balance and change table. Interest analysis is a separate report
section with monthly interest expense by month and year plus annual interest
comparison charts. The monthly chart uses the same selected report date range as
annual interest comparisons, groups January through December on the X-axis, and
includes each year represented by interest activity in the selected range rather
than limiting the chart to recent years. Interest charts use readable month-year
or year labels and display interest as a positive user-facing expense that must
reconcile to the tabular report detail.

Report filters, section expansion, and practical chart-series visibility are
preserved only for the current renderer session. Reset Filters intentionally
returns the report screen to its documented defaults.

Interest-rate sensitivity and actual-versus-plan variance are removed from the
normal Reports screen until their analytical basis is clear. Actual-versus-plan
analysis is deferred until saved scenarios intentionally persist period-level
baseline balances. Extra-payment comparison is handled through payoff scenarios
so warnings, allocation, and payoff order come from the payoff engine.

## Consequences

- The reporting feature remains read-only and does not create financial-record
  mutation paths.
- Report output is reproducible from committed schema and current application
  services, but it is not a persisted report snapshot.
- The narrow IPC model is preserved.
- Payoff comparison stays aligned with the tested projection engine.
- Balance and interest charting is renderer presentation of service-computed
  report rows; chart values must reconcile to accessible tables.
- Actual-versus-plan reporting will require a future scenario result shape that
  stores period-by-period plan balances or a separate planned activity model.
