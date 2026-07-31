# ADR 031: Report Ordering and Chart Tooltips

- Status: Accepted
- Date: 2026-07-31

## Context

Advanced reports are reviewed in a predictable workflow: balance history,
interest analysis, then monthly and annual rollforwards. Chart legends and
hover details must identify the debt without duplicating creditor information,
and hidden series must not remain discoverable through chart focus targets.

## Decision

Order the report sections with debt balance history first, followed by interest
expense analysis, monthly rollforward, annual rollforward, and the existing
remaining sections. Assign balance-history styles from a stable sorted debt
order, exhausting solid colors before reusing colors with dash patterns. The
total debt series always uses its own solid style.

Use focusable SVG data elements with native title content for consistent hover
and keyboard details across balance, monthly, comparison, and annual charts.
Titles contain only debt names and the exact period/amount information relevant
to that chart. Annual segment titles include the full bar total and segment
percentage; hiding a series removes its data elements and titles.

## Consequences

The change is renderer-only and does not alter report calculations, filters,
stored creditor data, or IPC contracts. Chart state remains presentation-only;
the collapsed report tables remain the complete tabular record.
