# ADR 030: Debt History and Interest Chart Usability

- Status: Accepted
- Date: 2026-07-31

## Context

Debt-history and interest charts need to support repeated financial review
without allowing browser scrolling or text selection to interfere with zoom and
pan. Dense monthly labels and stacked annual totals also need to remain
readable and reconcile to the visible data.

## Decision

Reuse the debt-history chart interaction model for monthly interest charts:
pointer drag begins after a movement threshold, active drag temporarily disables
text selection, and a non-passive wheel listener prevents page scrolling only
within the chart. Zoom and pan are bounded by the selected report range.

Legend controls expose Select none/Select all while retaining individual
accessible toggles. Monthly tick density is calculated from the visible period
count and chart width. Annual interest totals are rendered above stacked bars,
and year comparison bars use stable color and stroke treatments so three or
more years remain distinguishable without color alone.

## Consequences

Chart state remains presentation-only and session-local. No schema or IPC
changes are required. Hidden debt sources and their annual totals are excluded
from the visible stack and its recalculated scale, while the collapsed tables
remain the traceable data source for exact values.
