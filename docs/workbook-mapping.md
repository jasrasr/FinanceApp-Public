# Workbook Mapping

Workbook import is implemented as staged review followed by explicit reviewed
posting. It never posts automatically.

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

Detected sheet mappings start with `needs_review` status. Approval confirms that
the proposed mapping can participate in reviewed posting; it does not post rows
by itself.

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

These states do not create or change posted ledger, snapshot, reconciliation,
debt, or term records by themselves. Reviewed posting is a separate confirmed
batch operation.

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

## Reviewed Posting Mapping

Reviewed posting requires:

- Approved sheet mappings.
- Approved staged rows.
- Actual activity classification.
- No unresolved validation messages.
- No unresolved duplicate-candidate flag.
- No unresolved reconciliation exception.

Supported live targets are:

- `debts`
- `debt_terms`
- `debt_transactions`
- `transaction_allocations`
- `balance_snapshots`

Posting does not create balance reconciliations. It does not modify or delete the
source workbook.

Each posted transaction or snapshot receives a source reference using:

```text
import:<batch-id>:<staged-row-id>
```

Each live record created from a staged row is also linked through
`import_postings`, which preserves the exact batch and staged-row provenance.
Original source values and formulas remain in staging; normalized posted values
are stored only in the live record fields appropriate for the target table.

Posting is all-or-nothing for the batch. A failed posting rolls back live records
and provenance rows. A completed batch is closed, and retrying it reports the
existing created records without inserting duplicates.
