# ADR 045: Debt Payoff Scenario Planner

## Status

Accepted

## Decision

Add a read-only Debt Payoff Scenario Planner that compares the required-payment
baseline with highest-interest-first and lowest-balance-first strategy views.
Optional recurring extra payments and a dated lump sum are passed through the
existing extra-cash allocation service and payoff engine. The planner does not
persist scenarios or create ledger activity.

## Rationale

Reusing the existing scenario calculation path keeps payoff dates, interest,
allocation ordering, and ledger semantics consistent with the other planning
tools. A session-only comparison avoids a schema change and prevents planning
assumptions from being mistaken for posted financial activity.

## Consequences

The renderer receives calculated strategy results through the existing typed
IPC operation and presents side-by-side summaries, charts, and debt-level
payoff order. Unsupported or incomplete projection inputs retain the payoff
engine's existing warnings and limitations.
