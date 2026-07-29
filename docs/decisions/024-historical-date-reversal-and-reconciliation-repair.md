# ADR 024: Historical-Date Reversals and Reconciliation Correction

## Status

Accepted.

## Context

Installed-app UAT showed that a mortgage payment financially dated in 2021 did
not affect 2026 YTD metrics before reversal, but reversing it used the current
system date. That made 2026 interest activity appear even though both the
original activity and intended correction belonged to 2021. The dashboard escrow
balance also interpreted reversal escrow allocations without the original
transaction type, so a payment reversal doubled escrow instead of offsetting it.

UAT also showed that an incorrect reconciliation for a debt and statement date
could not be corrected because the schema allowed only one reconciliation for
that debt/date and had no lifecycle state.

Malformed reversal rows can exist in prior test databases if an earlier reversal
implementation failed to create a complete opposite allocation set. The minimum
acceptable repair control for this phase is detection and warning, not silent
mutation of posted history.

## Decision

- Reversal requests require an explicit financial reversal date.
- Dashboard and report YTD metrics use transaction effective dates only.
- Principal reduction metrics include payment principal activity and linked
  payment reversals, not borrowing principal allocations.
- Interest activity metrics net signed interest allocations and display the
  absolute value as a positive expense.
- Escrow balance calculations interpret reversal rows by looking up the original
  transaction type.
- Reconciliations have lifecycle status: current, superseded, or voided.
- Only current reconciliations are unique per debt and statement date.
- Corrected reconciliations supersede the old current row and insert a new
  current row instead of overwriting history.
- Corrected reconciliation snapshots use distinct source references so statement
  evidence is preserved.
- Malformed reversal detection compares the linked original and reversal signed
  totals and allocation amounts by type. Nonzero unmatched amounts are surfaced
  as data-integrity exceptions on dashboard attention items and reports.
- The application warns that calculated debt, escrow, and YTD amounts for an
  affected obligation require review until a future explicit repair workflow can
  post a linked corrective transaction.

## Consequences

Historical activity entered or reversed in a later calendar year no longer
pollutes current-year YTD metrics when the financial transaction date belongs to
an earlier year. Reversals now restore principal and escrow balances when the
reversal allocations offset the original transaction.

Incorrect reconciliations can be voided or superseded without deleting the
original record. Current dashboard/report attention items ignore superseded and
voided reconciliation rows.

Malformed reversals are visible as data-quality exceptions without altering
stored transactions or allocations. This preserves auditability but leaves a
manual repair workflow as future technical debt.

## Alternatives Considered

- Continue defaulting reversal date to the current system date. Rejected because
  it misstates historical corrections in YTD reporting.
- Store only one reconciliation per debt/date and edit it in place. Rejected
  because it would silently overwrite audit-relevant statement evidence.
- Remove corrected snapshots. Rejected because corrected reconciliations should
  preserve their own supporting verified balance evidence.
- Silently rewrite malformed reversal allocations during startup. Rejected
  because it would change posted financial history without explicit user review.
