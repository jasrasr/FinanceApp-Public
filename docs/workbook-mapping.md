# Workbook Mapping

Workbook import is implemented as a staging and review workflow only. It does
not post imported rows to debts, debt terms, transactions, balance snapshots, or
reconciliations.

## Source Handling

- Workbook selection occurs through a narrow Electron main-process file dialog.
- The renderer receives no filesystem access and no workbook path.
- Source workbooks are treated as untrusted input.
- Debt Tracker reads but never modifies the source workbook.
- The actual workbook must not be copied into the repository, fixtures,
  screenshots, logs, or commits.
- Automated tests use generated fictional workbooks created in temporary
  directories.

## Preserved Provenance

Each import batch preserves:

- Source workbook base filename.
- Source workbook fingerprint.
- Source file modified timestamp when available.
- Import timestamp.

Each staged row preserves:

- Source sheet name.
- One-based source row number.
- Source cell references.
- Source displayed values.
- Source formulas where present.
- Normalized proposed values in a separate field.
- Validation messages.
- Duplicate-candidate metadata when detected.
- Reconciliation-exception metadata when detected.
- Review status and review notes.

Formula text is evidence about the workbook source. It is not translated into
application calculation logic.

## Sheet Detection

The importer proposes sheet types using conservative header heuristics:

| Proposed type      | Typical source indicators                                 |
| ------------------ | --------------------------------------------------------- |
| `transaction`      | Payment, transaction, draw, interest, fee, or date/amount |
| `term`             | Rate, term, maturity, required payment, payment frequency |
| `balance_snapshot` | Statement, ending balance, confirmed balance, or snapshot |
| `debt`             | Creditor, principal, origination, debt, loan, or account  |
| `unknown`          | No reliable header pattern                                |

Detected sheet mappings start with `needs_review` status. Approval confirms only
that the proposed staging mapping was reviewed; it does not post rows.

## Row Detection and Review

Staged rows may be proposed as:

- Debt records.
- Posted transaction candidates.
- Effective-dated term candidates.
- Balance-snapshot candidates.
- Unknown records requiring mapping review.

Transaction rows are classified as `actual`, `projected`, or `ambiguous`.
Ambiguous rows cannot be approved. The user must classify them before any future
posting phase may use them.

Available review states are:

- `needs_review`
- `approved`
- `rejected`
- `deferred`

These states are review-only. They do not create or change posted ledger,
snapshot, reconciliation, debt, or term records.

## Control Totals and Exceptions

The import review screen shows:

- Total staged rows.
- Rows needing review.
- Approved, rejected, and deferred rows.
- Ambiguous actual-versus-projected rows.
- Duplicate-candidate rows.
- Invalid rows.
- Reconciliation-exception rows.
- Candidate row counts by proposed record type.

Control totals are import-review aids. They are not ledger balances and do not
replace reconciliation.

## Future Posting Mapping

Posting imported rows is intentionally out of scope for phase seven. A future
posting phase must:

- Require explicit user approval before posting.
- Convert approved staged rows through the same validation and accounting helpers
  used by manual workflows.
- Preserve source import provenance on posted records.
- Reject or defer ambiguous actual-versus-projected rows.
- Never overwrite posted ledger activity or confirmed snapshots silently.
