# ADR 017: Payoff Scenario Engine and Persistence

## Status

Accepted.

## Context

Phase nine adds payoff projections for baseline, avalanche, snowball, and custom
priority strategies. Projection results must support decision-making without
mixing forecasted activity into posted actual ledger tables.

## Decision

Persist scenarios in a dedicated `payoff_scenarios` table. Store scenario input
assumptions, custom priority, calculation result JSON, calculation-engine
version, status, and timestamps. Do not store projected transactions in
`debt_transactions`.

The engine starts from application-calculated ledger balances as of an explicit
scenario start date and uses effective-dated debt terms for each monthly
projection period.

The current calculation engine version is `payoff-engine-v2`.

Phase-nine supported behavior is:

- Monthly interest for monthly day-count terms using amortized monthly, simple,
  or interest-only calculation conventions.
- Actual/360 and actual/365 simple daily interest when term data is sufficient.
- Explicit zero-interest obligations.
- Cents rounded each month.
- Required payments normalized to monthly equivalents.
- Extra payments applied after scheduled payments by selected strategy.
- Freed scheduled payments roll into the remaining prioritized debts.
- Saved results include a monthly allocation schedule showing the debt receiving
  the extra payment, required and extra payment amounts, ending projected
  balance, payoff events, and the next priority debt.
- Saved results include payoff-order summaries and total projected balance rows
  suitable for scenario comparison charts.
- Variable rates use explicit scenario overrides when supplied; without an
  override, the debt is marked unsupported.
- Revolving debts assume no future draws.
- Balloon maturities are enforced; if balance remains at maturity, the debt is
  marked unsupported unless a future explicit balloon-payment assumption exists.
- Irregular or unsupported payment schedules and unsupported day-count or
  calculation-convention combinations are marked unsupported.
- Unsupported debts are excluded from scenario totals and receive debt-level and
  scenario-level warnings.
- Version 1.2.0 adds an ephemeral extra-cash allocation analysis boundary. It
  reuses this engine after applying an in-memory lump-sum allocation and never
  writes projected payments to the ledger. Explicit scenario saving remains the
  only persistence path.
- Version 1.2.1 adds explicit allocation trace records, horizon disclosures,
  debt-level interest reconciliation, and direct-versus-rollover savings fields.
  An incomplete custom split is a not-configured result and is never presented
  as a precise projection.

## Consequences

- Scenario calculations are reproducible from saved assumptions, engine version,
  and the posted ledger as of the scenario start date.
- Actual activity remains auditable and unaffected by planning workflows.
- Rerunning a scenario updates the saved scenario result and audit trail but does
  not create ledger entries.
- The renderer shows strategy explanations, included/excluded debt previews, and
  debt-name custom ordering; raw debt IDs remain an internal contract detail.
- More precise future features, such as lender-specific amortization, tax
  effects, irregular payment schedules, refinance analysis, and explicit
  balloon-payment modeling, require new documented engine versions.
