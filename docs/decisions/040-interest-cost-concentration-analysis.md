# ADR 040: Interest-cost concentration analysis

## Status

Accepted for version 1.7.0.

## Context

Users need to understand where current and projected interest costs are
concentrated and compare targeted extra-payment opportunities without posting
planning activity or introducing another accounting engine.

## Decision

Add a read-only main-process Interest analysis service and typed IPC operation.
The service filters active positive-balance debts, obtains YTD interest from the
existing report calculations, and calculates projected remaining interest from
one generated required-payments-only payoff baseline.

For each eligible debt, the service runs two isolated tests through the
existing extra-cash allocation and payoff engine path: a $1,000 selected-debt
lump sum and a $100/month selected-debt payment. Both tests use the same
baseline inputs and preserve required payments on all debts. The existing
selected-debt rollover behavior is retained. Direct savings are the tested
debt's interest difference; redirected savings are the remaining portfolio
interest difference. This keeps 0% debt direct savings at $0 while exposing
downstream redirected savings separately.

## Consequences

- Table values and charts are calculated before crossing the secure bridge; the
  renderer only formats, ranks, filters, and displays DTO values.
- No ledger transactions, saved scenarios, database migrations, or accounting
  calculations are changed.
- Unsupported projection inputs remain identified by existing payoff warnings;
  unavailable debt-level interest values are shown as unavailable rather than
  fabricated.
