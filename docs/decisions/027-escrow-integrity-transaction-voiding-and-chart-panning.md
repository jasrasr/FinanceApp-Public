# ADR 027: Escrow Integrity, Transaction Voiding, and Chart Panning

- Date: 2026-07-30
- Status: Accepted

## Context

User acceptance testing found that an edited escrow disbursement could display an
incorrect escrow balance because not every user-facing screen applied the same
transaction-chain filtering. The application also needed a user-facing way to
void erroneous posted transactions without deleting ledger history, and the debt
history chart needed panning after zoom.

## Decision

- Escrow balance calculations use one current transaction-chain rule:
  superseded originals are excluded, edit-generated reversals of superseded
  originals are excluded, voided chains net to zero through linked offsetting
  rows, and only current effective activity controls displayed balances.
- Posted transaction voiding is implemented as an atomic linked offset. The
  original transaction is marked `voided`; a generated reversal offsets the
  original total and all allocations; the original and reversal remain in audit
  history.
- The renderer exposes voiding only through the narrow typed
  `voidDebtTransaction` bridge operation. No raw SQL, filesystem, generic IPC, or
  Drizzle access is exposed.
- Normal transaction history is split into current activity and audit history so
  users do not need to interpret generated reversal rows to understand current
  balances.
- Debt history chart panning is renderer-only session state. Shift + mouse wheel,
  click-and-drag, and keyboard buttons pan the visible date window within the
  selected report range while preserving the zoom width.

## Consequences

- Existing posted rows remain compatible. A migration expands the transaction
  status check constraint to allow `voided`.
- Voiding or reversing activity on or before a current reconciliation statement
  date marks that reconciliation as an exception requiring review.
- Exports continue to preserve posted audit rows. Current financial effect is
  determined from the transaction chain rather than by deleting or hiding source
  records at the database level.
- Chart preferences remain nonpersistent; persistent report-display preferences
  remain out of scope.
