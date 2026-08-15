# ADR 043: Debt Progress and Trends reporting

Accepted for the Debt Progress / Trends feature.

Debt Progress is a read-only presentation of the existing application-calculated
ledger rollforward. It does not create a second balance engine, write analysis
records, or alter posted transactions. The portfolio formula is:

`Net debt reduction = principal paid - Purchase/Charge activity - New Borrowing/Draw activity`.

Transfer In and Transfer Out remain separately visible for debt-level filters and
are excluded from portfolio net debt reduction because they cancel across the
portfolio. Interest and fees remain separate from principal reconciliation. The
page supports YTD, prior year, last twelve months, all-time, and custom ranges;
the service also returns an equivalent prior-period comparison when available.

The displayed application version uses the synchronized package metadata compiled
into the preload bridge. A package-derived fallback remains for deterministic
tests and development builds, so release patch bumps do not require a second
manual version edit.
