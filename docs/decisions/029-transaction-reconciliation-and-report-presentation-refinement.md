# ADR 029: Transaction, Reconciliation, and Report Presentation Refinement

- Date: 2026-07-31
- Status: Accepted

## Decision

- Current activity, escrow activity, and current reconciliations are newest-first,
  using created timestamps as the stable tie-breaker. Superseded, voided, and
  reversed records remain in their audit histories.
- Normal reconciliation entry saves only an exact match between the verified
  lender balance and calculated ledger balance. A mismatch is rejected with the
  three values needed to correct the underlying activity. Historical approved
  adjustment records remain compatible with the database model.
- Normal transaction entry omits descriptions; existing descriptions remain
  readable for historical and edit workflows, and persistence supplies its
  existing generated fallback when needed.
- Reports expose only the selected date range in visible report metadata. The
  calculation basis remains in the DTO and accessible metadata.
- Annual interest source segments are calculated in the main process and rendered
  as toggleable stacked bars. Monthly interest controls are bounded to the
  selected range and use the established chart interaction model.

## Consequences

- Users see current financial effect without interpreting lifecycle rows in normal
  lists, while complete traceability remains available through audit history.
- Mismatched statement evidence cannot create a new reconciliation or adjustment
  from the normal workflow; the ledger must be corrected explicitly first.
- Report presentation is less technical while calculation provenance remains
  available to assistive technology and documentation.
