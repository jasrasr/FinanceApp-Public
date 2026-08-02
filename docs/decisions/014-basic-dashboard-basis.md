# ADR 014: Basic Dashboard Basis

## Status

Accepted

## Context

Phase six adds a basic dashboard using existing debts, posted transactions,
allocations, effective-dated terms, snapshots, and reconciliations. The
dashboard must support decision review without presenting original principal,
confirmed snapshots, calculated balances, projected balances, or scenario
balances as interchangeable.

## Decision

Expose one narrow read-only IPC operation for dashboard data. The Electron main
process calculates the dashboard DTO from active debts only and returns
formatted values plus debt identifiers for drill-through.

Use application-calculated ledger balance as the default dashboard debt balance.
The calculation uses original principal plus non-superseded posted ledger
transactions through the dashboard effective date. Confirmed snapshots and
statement balances remain separate evidence and are not substituted into the
dashboard total.

Use posted allocations and transaction classifications for year-to-date metrics.
New borrowings YTD includes opening principal for active debts originated during
the displayed year, unless a same-date borrowing/draw transaction already
represents the original borrowing. Subsequent borrowing/draw transactions
continue to be counted by transaction effective date. Use current effective debt
terms for required monthly payments and weighted average interest rate.

Credit-card availability and utilization are dashboard-only calculated metrics
for active credit-card debts. Cards without valid credit limits are flagged and
excluded from utilization percentages. Available credit is displayed no lower
than zero, with over-limit amounts identified separately.

## Consequences

- Dashboard totals remain tied to an explicit effective date and basis.
- Archived debts are excluded from dashboard metrics.
- Credit-card portfolio metrics remain application-calculated current values and
  do not become confirmed statement balances.
- The renderer does not receive raw SQL, Drizzle objects, database connections,
  filesystem access, or generic IPC.
- Later projection, payoff, refinance, and reporting features can add separate
  dashboard sections without changing the actual-ledger basis of phase-six
  metrics.
