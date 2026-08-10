# ADR 038: Debt Payoff Milestones

## Status

Accepted for version 1.5.0.

## Decision

Add a dedicated Milestones screen backed by a typed main-process operation. The
main process composes milestone metrics and chart series from the existing
report rollforwards, ledger balance helper, active/archived debt activity, and
saved payoff scenario results. The renderer only formats and presents those
already-calculated values.

Actual balance history and projected scenario schedules are separate fields.
No scenario comparison data is produced until the user selects a saved scenario.
The screen uses the existing chart scale and payoff date helpers, with concise
hover details and optional series toggles. Debt and next-payoff items retain
drill-through to debt detail. No database migration or accounting rule change
is required.
