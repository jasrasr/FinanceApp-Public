# ADR 015: Workbook Import Staging and Mapping

## Status

Accepted

## Context

Debt Tracker needs to read an existing Excel debt workbook, preserve source
provenance, identify likely records, and let the user review mappings without
posting unverified imported data into the live debt ledger.

The workbook contains untrusted external input. It may contain formulas,
projected rows, ambiguous classifications, or workbook-specific calculation
logic that should not automatically become application behavior.

## Decision

Workbook import uses dedicated staging tables:

- `import_batches`
- `import_sheet_mappings`
- `staged_import_rows`

The Electron main process owns workbook selection, parsing, database writes, and
audit events. The renderer uses narrow typed IPC operations for selecting a
workbook, listing/importing batches, reviewing sheet mappings, and reviewing
staged rows.

The importer preserves original source displayed values and formulas separately
from normalized proposed values. Formula text is source metadata only.

Rows detected as ambiguous actual-versus-projected activity remain flagged for
review and cannot be approved while ambiguous.

Phase seven does not post staged data to debts, debt terms, transactions,
balance snapshots, reconciliations, or adjustments.

## Consequences

- Source provenance is retained before any future posting workflow.
- The renderer does not receive raw filesystem, SQL, Drizzle, or parser access.
- Posting imported data requires a later explicit workflow and validation step.
- Workbook formulas cannot silently alter Debt Tracker accounting logic.
- Users can approve, reject, or defer mappings and rows without changing the
  posted ledger.
