# ADR 016: Reviewed Workbook Import Posting

## Status

Accepted.

## Context

Workbook staging preserves untrusted source rows and normalized proposals. Phase
eight needs to post approved reviewed rows without allowing automatic posting,
ambiguous actual-versus-projected activity, duplicate posting, or partial live
records.

## Decision

Debt Tracker posts a reviewed import batch in one database transaction. A row is
eligible only when its sheet mapping and staged-row review are approved, its
activity classification is actual, and it has no unresolved validation messages,
duplicate-candidate flag, or reconciliation exception.

Posting can create:

- Debts.
- Debt terms.
- Posted transactions.
- Transaction allocations.
- Balance snapshots.

Posting does not create balance reconciliations.

Each created live record is linked to its source batch and staged row through
`import_postings`. Imported transactions and snapshots also receive a source
reference in the form `import:<batch-id>:<staged-row-id>`.

When posting succeeds, the import batch is closed. Re-running a closed batch
returns existing provenance and does not insert duplicate live records.

## Consequences

- Source displayed values, formulas, and normalized proposals remain preserved in
  staging.
- Financial tables remain focused on normalized application records rather than
  workbook-specific source details.
- Posting failure rolls back all live records and provenance rows for the batch.
- A future partial-posting workflow would require a new documented design.
