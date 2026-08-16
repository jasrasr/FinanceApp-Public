# ADR 047: Cash Flow / Debt Burden Analysis

## Status

Accepted

## Decision

Add a read-only debt cash-flow analysis backed by the existing report
rollforward. Payment transactions are displayed as positive cash outflow while
the ledger's signed values remain unchanged. Purchases, borrowing/draws, and
transfers are excluded from debt-service payments. Principal, interest, fees,
payment counts, and explicit extra-principal allocations are reported
separately.

## Rationale

The existing rollforward already resolves current transaction chains, reversal
handling, allocation types, and debt balances. Reusing it prevents a second
interpretation of payment activity and keeps portfolio and individual-debt
views reconciled. Historical payment rows do not reliably identify required
versus extra cash, so only explicit `extra_principal` allocations are shown and
the required-payment limitation is stated in the UI.

## Consequences

The typed report response gains a cash-flow analysis section; no IPC operation,
database table, migration, ledger record, payment schedule, or production data
is changed. Scheduled monthly terms are shown separately when current terms
support them, and prior-period comparisons use the same rollforward over the
shifted date range.
