# Data Dictionary

## Conventions

- Identifiers are application-generated UUID strings stored as SQLite `TEXT`.
- Money is stored as signed or nonnegative integer cents, depending on context.
- Annual rates are stored as integer millionths of the decimal rate.
- Deductible percentages are stored in basis points, where `100% = 10,000`.
- Financial dates are timezone-free `TEXT` in `YYYY-MM-DD` format.
- System and audit timestamps are UTC ISO strings ending in `Z`.
- Posted ledger statuses do not include projected or scenario activity.
- Foreign keys use `ON DELETE RESTRICT` to preserve financial history unless a
  documented relationship, such as refinance links, is explicitly nullable.

## `debts`

Identifies and classifies an obligation. It does not contain an authoritative
mutable current-balance field.

| Column                      |    Type | Required | Rule                                                                                                      |
| --------------------------- | ------: | :------: | --------------------------------------------------------------------------------------------------------- |
| `id`                        |    text |   Yes    | Primary key; UUID                                                                                         |
| `name`                      |    text |   Yes    | User-facing obligation name                                                                               |
| `creditor`                  |    text |   Yes    | Creditor or lender                                                                                        |
| `owner_entity`              |    text |   Yes    | Compatibility field; new personal-use records default to `Personal`                                       |
| `debt_type`                 |    text |   Yes    | Mortgage, HELOC, auto, personal, business, credit card, other; legacy student/medical/tax remain readable |
| `purpose`                   |    text |   Yes    | Purpose of the obligation                                                                                 |
| `status`                    |    text |   Yes    | Active, paid off, refinanced, or closed                                                                   |
| `original_principal_cents`  | integer |   Yes    | Nonnegative safe-integer cents                                                                            |
| `origination_date`          |    text |   Yes    | Financial date                                                                                            |
| `maturity_date`             |    text |    No    | Financial date not before origination                                                                     |
| `minimum_payment_cents`     | integer |   Yes    | Compatibility field populated from the initial term for new manual debts                                  |
| `payment_frequency`         |    text |   Yes    | Compatibility field populated from the initial term for new manual debts                                  |
| `payment_due_day`           | integer |    No    | Optional scheduled payment day from 1 through 31; shorter months use the final calendar day               |
| `credit_limit_cents`        | integer |    No    | Nonnegative safe-integer cents                                                                            |
| `collateral_description`    |    text |    No    | Non-sensitive collateral description                                                                      |
| `tax_category`              |    text |   Yes    | Controlled tax classification                                                                             |
| `deductible_percentage_bps` | integer |   Yes    | From 0 through 10,000                                                                                     |
| `financing_chain_name`      |    text |    No    | Legacy compatibility name for previously linked separate refinance-chain obligations                      |
| `refinanced_from_debt_id`   |    text |    No    | Legacy nullable self-reference to the prior obligation in a separate-debt refinance chain                 |
| `refinanced_into_debt_id`   |    text |    No    | Legacy nullable self-reference to the replacement obligation in a separate-debt refinance chain           |
| `refinance_date`            |    text |    No    | Legacy financial date identifying a separate-debt refinance link when applicable                          |
| `notes`                     |    text |    No    | Supporting notes                                                                                          |
| `created_at_utc`            |    text |   Yes    | UTC timestamp                                                                                             |
| `updated_at_utc`            |    text |   Yes    | UTC timestamp                                                                                             |
| `archived_at_utc`           |    text |    No    | UTC timestamp                                                                                             |

Indexes cover creditor, owner/entity compatibility data, status, refinance
references, and financing-chain name.
`archived_at_utc` is independent of obligation status: a null value includes the
debt in the default list, while a timestamp preserves the record but hides it
unless archived records are requested.

Credit-card dashboard availability and utilization use active credit-card debts
only. Active cards without a valid `credit_limit_cents` value remain readable and
are flagged for review; they are excluded from utilization percentages.

Legacy refinance references use `ON DELETE SET NULL` because they are
presentation links between separate legal obligations created by prior versions.
Normal refinance entry is now in-place through `refinance_events` and keeps one
continuous debt ID. Permanent deletion of a legacy replacement debt nulls
remaining debt pointers rather than leaving broken links.

The application is single-user. Owner/entity is retained for existing database
compatibility but is not shown in normal user-facing forms, debt cards, reports,
or exports. Removed debt types remain valid for existing rows so records remain
readable; the UI does not silently convert them.

The manual-maintenance service treats original principal and origination date as
opening facts. Descriptive and administrative fields use optimistic concurrency
based on `updated_at_utc`.

`payment_due_day` is debt-level scheduling configuration. It is nullable so
existing debts remain valid without invented due dates. Effective-dated
`debt_terms` remain authoritative for the required amount and payment frequency
applicable to each scheduled due date.

## `debt_terms`

Stores non-overlapping effective-dated material terms.

| Column                   |    Type | Required | Rule                                                             |
| ------------------------ | ------: | :------: | ---------------------------------------------------------------- |
| `id`                     |    text |   Yes    | Primary key; UUID                                                |
| `debt_id`                |    text |   Yes    | Foreign key to `debts`                                           |
| `effective_start_date`   |    text |   Yes    | Financial date                                                   |
| `effective_end_date`     |    text |    No    | Financial date not before start                                  |
| `interest_rate_type`     |    text |   Yes    | Fixed, variable, promotional, or zero                            |
| `interest_rate_micros`   | integer |   Yes    | Nonnegative scaled annual rate                                   |
| `day_count_convention`   |    text |   Yes    | Actual/365, actual/360, 30/360, or monthly                       |
| `calculation_convention` |    text |   Yes    | Simple daily, amortized monthly, interest only, simple, or other |
| `required_payment_cents` | integer |   Yes    | Nonnegative safe-integer cents                                   |
| `payment_frequency`      |    text |   Yes    | Controlled frequency                                             |
| `notes`                  |    text |    No    | Term-specific notes                                              |
| `created_at_utc`         |    text |   Yes    | UTC timestamp                                                    |
| `updated_at_utc`         |    text |   Yes    | UTC timestamp                                                    |

The pair `debt_id, effective_start_date` is unique. A repository validation
prevents overlapping periods; an index supports effective-period searches.

Debt creation inserts the debt and initial term in one transaction. Subsequent
manual terms are chronological appends. If the latest period is open, it receives
an inclusive end date one day before the new start date. Historical rows are not
overwritten.

## `debt_transactions`

Unified posted transaction ledger for payments, draws, charges, adjustments,
reversals, mortgage escrow activity, and other explicitly classified actual
activity.

| Column                       |    Type | Required | Rule                                                            |
| ---------------------------- | ------: | :------: | --------------------------------------------------------------- |
| `id`                         |    text |   Yes    | Primary key; UUID                                               |
| `debt_id`                    |    text |   Yes    | Foreign key to `debts`                                          |
| `transaction_type`           |    text |   Yes    | Controlled posted transaction type                              |
| `effective_date`             |    text |   Yes    | Economic financial date; manual entry uses the Transaction Date |
| `posting_date`               |    text |   Yes    | Posting financial date; manual entry uses the Transaction Date  |
| `total_amount_cents`         | integer |   Yes    | Nonzero signed safe-integer cents                               |
| `status`                     |    text |   Yes    | Posted, reversed, superseded, or voided                         |
| `description`                |    text |   Yes    | Human-readable explanation                                      |
| `source_type`                |    text |   Yes    | Manual, import, statement, system, or reconciliation            |
| `source_reference`           |    text |    No    | External or internal provenance reference                       |
| `reversal_of_transaction_id` |    text |    No    | Unique self-reference for a reversal                            |
| `supersedes_transaction_id`  |    text |    No    | Unique self-reference for a correction                          |
| `created_at_utc`             |    text |   Yes    | UTC timestamp                                                   |
| `updated_at_utc`             |    text |   Yes    | UTC timestamp                                                   |

Indexes cover debt/effective date, debt/posting date, and status. A reversal must
reference exactly one prior transaction and originals cannot be deleted. Approved
reconciliation adjustments are explicit posted transactions with source type
`reconciliation` and source reference pointing to the reconciliation record that
approved them. Source fields remain internal provenance fields and are not shown
on simplified manual-entry forms. Manual user entry accepts positive amount
strings; the application service converts them to these signed stored values
according to transaction type.

Reversal rows use their own financial `effective_date` and `posting_date`,
provided by the reversal workflow. They do not derive financial date treatment
from `created_at_utc` or `updated_at_utc`.

User-facing posted-transaction edits reuse the existing self-reference columns.
The original transaction is retained and marked `superseded`; a linked reversal
uses `reversal_of_transaction_id` to offset the original; the corrected
replacement uses `supersedes_transaction_id` to identify the original it
replaces. Imported replacements preserve import provenance in `source_type` and
`source_reference`.

User-facing voids are not physical deletes. The original transaction is retained
and marked `voided`; a linked reversal offsets the original total and every
allocation. Voided originals and generated reversal rows remain available for
audit history. Current activity views and current-balance/reporting calculations
use only the effective transaction chain.

Application-calculated debt balances are derived from balance-affecting
allocations rather than full transaction totals. Payment interest and escrow
allocations do not reduce debt principal. Interest allocations increase debt
balance only when posted as interest-charge transactions. Reversals offset the
same affected components as the original transaction.

Data-quality checks compare each reversal total and allocation set to the
original transaction. If they do not completely offset, the application reports a
malformed-reversal exception and marks affected calculated balances and YTD
metrics as requiring review; it does not mutate the stored rows.

## `transaction_allocations`

Breaks a posted transaction into accounting classifications.

| Column            |    Type | Required | Rule                                                                                        |
| ----------------- | ------: | :------: | ------------------------------------------------------------------------------------------- |
| `id`              |    text |   Yes    | Primary key; UUID                                                                           |
| `transaction_id`  |    text |   Yes    | Foreign key to `debt_transactions`                                                          |
| `allocation_type` |    text |   Yes    | Principal, interest, escrow, fee, penalty; legacy extra principal and other remain readable |
| `amount_cents`    | integer |   Yes    | Nonzero signed safe-integer cents                                                           |
| `notes`           |    text |    No    | Allocation explanation                                                                      |
| `created_at_utc`  |    text |   Yes    | UTC timestamp                                                                               |
| `updated_at_utc`  |    text |   Yes    | UTC timestamp                                                                               |

Each allocation type occurs at most once per transaction. Repository validation
requires allocation signs to follow the transaction and their sum to equal the
transaction total. User-facing entry treats all principal paid, including
additional principal, as principal. Escrow allocations are included in the posted
transaction total but are excluded from debt-principal balance calculations and
tracked in a separate calculated escrow balance. Manual user entry accepts
positive allocation strings and converts them to signed stored allocation rows
before repository validation.

Dashboard, debt-list, report, reconciliation, and payoff-starting-balance
services use allocation-level balance logic when calculating debt principal
balances.

Escrow balances use the same current transaction-chain logic as debt-principal
balances: superseded originals and edit-generated reversals are excluded, voided
chains net to zero through linked offsetting rows, and only current effective
escrow activity controls debt detail, dashboard, escrow detail, reports, and
exports.

## `refinance_events`

Records in-place refinance events for an existing debt. The debt ID remains the
same, prior history is preserved, and the event links the new term and any
system-generated refinance transactions.

| Column                           |    Type | Required | Rule                                                                   |
| -------------------------------- | ------: | :------: | ---------------------------------------------------------------------- |
| `id`                             |    text |   Yes    | Primary key; UUID                                                      |
| `debt_id`                        |    text |   Yes    | Foreign key to `debts`                                                 |
| `refinance_date`                 |    text |   Yes    | Financial date; unique per debt                                        |
| `pre_refinance_principal_cents`  | integer |   Yes    | Calculated principal immediately before the refinance date             |
| `lender_payoff_balance_cents`    | integer |    No    | Optional lender payoff balance reviewed by the user                    |
| `new_refinanced_principal_cents` | integer |   Yes    | New principal balance after the refinance                              |
| `principal_change_cents`         | integer |   Yes    | New principal less pre-refinance principal; database checked           |
| `financed_fees_cents`            | integer |   Yes    | Fees included in the new principal, separately identified              |
| `cash_fees_cents`                | integer |   Yes    | Cash-paid refinance fees; does not affect principal                    |
| `escrow_handling`                |    text |   Yes    | Carry forward, reset opening balance, refund, or new deposit           |
| `escrow_amount_cents`            | integer |    No    | User-entered escrow amount for reset, refund, or new deposit options   |
| `prior_term_id`                  |    text |   Yes    | Term closed the day before the refinance date                          |
| `new_term_id`                    |    text |   Yes    | New term beginning on the refinance date                               |
| `principal_transaction_id`       |    text |    No    | System principal-adjustment transaction when the net change is nonzero |
| `cash_fee_transaction_id`        |    text |    No    | System other-activity transaction for cash-paid fees when nonzero      |
| `escrow_transaction_id`          |    text |    No    | System escrow transaction when the escrow option changes balance       |
| `notes`                          |    text |    No    | Reconciliation or closing-statement notes                              |
| `created_at_utc`                 |    text |   Yes    | UTC timestamp                                                          |
| `updated_at_utc`                 |    text |   Yes    | UTC timestamp                                                          |

In-place refinance saving is atomic: the prior term is closed, the new term is
inserted, the net principal adjustment is posted, fees and escrow are separately
classified, and the event row is inserted in one database transaction.

## `balance_snapshots`

Stores confirmed external evidence as of a date. Snapshots do not rewrite ledger
activity.

| Column                    |    Type | Required | Rule                           |
| ------------------------- | ------: | :------: | ------------------------------ |
| `id`                      |    text |   Yes    | Primary key; UUID              |
| `debt_id`                 |    text |   Yes    | Foreign key to `debts`         |
| `effective_date`          |    text |   Yes    | Financial date                 |
| `confirmed_balance_cents` | integer |   Yes    | Nonnegative safe-integer cents |
| `source_type`             |    text |   Yes    | Manual, statement, or import   |
| `source_reference`        |    text |    No    | Statement or source reference  |
| `notes`                   |    text |    No    | Supporting notes               |
| `created_at_utc`          |    text |   Yes    | UTC timestamp                  |
| `updated_at_utc`          |    text |   Yes    | UTC timestamp                  |

Debt, date, source type, and source reference are unique. These records preserve
external evidence without overwriting the posted ledger. The normal user-facing
path creates statement snapshots through the combined Reconcile Balance workflow
rather than a separate Record Snapshot action.

## `balance_reconciliations`

Compares statement evidence with the application-calculated balance at the same
date.

| Column                                 |    Type | Required | Rule                                                                            |
| -------------------------------------- | ------: | :------: | ------------------------------------------------------------------------------- |
| `id`                                   |    text |   Yes    | Primary key; UUID                                                               |
| `debt_id`                              |    text |   Yes    | Foreign key to `debts`                                                          |
| `statement_date`                       |    text |   Yes    | Financial date                                                                  |
| `statement_ending_balance_cents`       | integer |   Yes    | Nonnegative cents                                                               |
| `application_calculated_balance_cents` | integer |   Yes    | Nonnegative cents                                                               |
| `calculated_difference_cents`          | integer |   Yes    | Statement less application; database checked                                    |
| `reconciliation_status`                |    text |   Yes    | Unreconciled, in progress, reconciled, reconciled with adjustment, or exception |
| `explanation`                          |    text |    No    | Difference explanation                                                          |
| `approved_adjustment_transaction_id`   |    text |    No    | Posted adjustment transaction for the same debt                                 |
| `source_reference`                     |    text |    No    | Statement reference                                                             |
| `supporting_notes`                     |    text |    No    | Review notes                                                                    |
| `lifecycle_status`                     |    text |   Yes    | Current, superseded, or voided                                                  |
| `supersedes_reconciliation_id`         |    text |    No    | Prior reconciliation corrected by this row                                      |
| `superseded_by_reconciliation_id`      |    text |    No    | Replacement reconciliation when this row is superseded                          |
| `voided_at_utc`                        |    text |    No    | UTC timestamp when voided                                                       |
| `superseded_at_utc`                    |    text |    No    | UTC timestamp when superseded                                                   |
| `created_at_utc`                       |    text |   Yes    | UTC timestamp                                                                   |
| `updated_at_utc`                       |    text |   Yes    | UTC timestamp                                                                   |

Current debt and statement date rows are unique. Superseded and voided rows are
retained for history. Adjustment-reference presence must agree with the
reconciliation status. The application-calculated balance is computed from
original principal plus non-superseded balance-affecting allocation activity
through the statement date. The stored difference is calculated by the
application and also checked by the database constraint. The normal user-facing
workflow assigns `reconciled`, `exception`, or `reconciled_with_adjustment`
automatically from the calculated difference and any approved linked adjustment.

## `audit_events`

Records material actions without unnecessarily duplicating financial amounts.

| Column                 | Type | Required | Rule                               |
| ---------------------- | ---: | :------: | ---------------------------------- |
| `id`                   | text |   Yes    | Primary key; UUID                  |
| `event_type`           | text |   Yes    | Event classification               |
| `entity_type`          | text |   Yes    | Entity classification              |
| `entity_id`            | text |   Yes    | Related entity identifier          |
| `action`               | text |   Yes    | Action performed                   |
| `occurred_at_utc`      | text |   Yes    | UTC timestamp                      |
| `source`               | text |   Yes    | User, import, system, or migration |
| `summary`              | text |   Yes    | Non-sensitive summary              |
| `before_metadata_json` | text |    No    | Minimal non-sensitive JSON         |
| `after_metadata_json`  | text |    No    | Minimal non-sensitive JSON         |

Indexes cover entity lookup and event time.

Manual debt maintenance records `debt_created`, `debt_updated`,
`debt_term_created`, `debt_archived`, and `debt_restored` events. Posted activity,
snapshots, reconciliations, and approved reconciliation adjustments also create
audit events. Backup, restore, failed-restore, permanent debt deletion, and
data-export workflows record
non-sensitive operational audit events. Summaries avoid financial amounts; update
metadata identifies classifications and related record identifiers rather than
financial values.

## Legacy `import_batches`

Dormant legacy compatibility table retained for existing databases that may
already contain import staging metadata. Current versions do not expose workbook
selection, staging, review, or posting workflows.

| Column                            | Type | Required | Rule                                  |
| --------------------------------- | ---: | :------: | ------------------------------------- |
| `id`                              | text |   Yes    | Primary key; UUID                     |
| `source_workbook_name`            | text |   Yes    | Base workbook filename only           |
| `source_workbook_fingerprint`     | text |   Yes    | Hash used for duplicate-source review |
| `source_workbook_modified_at_utc` | text |    No    | Source file modified timestamp        |
| `status`                          | text |   Yes    | Open, reviewed, or closed             |
| `imported_at_utc`                 | text |   Yes    | UTC timestamp                         |
| `created_at_utc`                  | text |   Yes    | UTC timestamp                         |
| `updated_at_utc`                  | text |   Yes    | UTC timestamp                         |

The fingerprint is provenance for review and duplicate detection. It is not a
posting key and does not authorize overwriting prior imports.

## Legacy `import_sheet_mappings`

Dormant legacy compatibility table for previously staged sheet-level mapping
metadata.

| Column                 | Type | Required | Rule                                                  |
| ---------------------- | ---: | :------: | ----------------------------------------------------- |
| `id`                   | text |   Yes    | Primary key; UUID                                     |
| `batch_id`             | text |   Yes    | Foreign key to `import_batches`                       |
| `source_sheet_name`    | text |   Yes    | Workbook sheet name                                   |
| `proposed_record_type` | text |   Yes    | Debt, transaction, term, balance snapshot, or unknown |
| `review_status`        | text |   Yes    | Needs review, approved, rejected, or deferred         |
| `field_mapping_json`   | text |   Yes    | JSON source-field to proposed-field mapping           |
| `notes`                | text |    No    | Mapping review notes                                  |
| `created_at_utc`       | text |   Yes    | UTC timestamp                                         |
| `updated_at_utc`       | text |   Yes    | UTC timestamp                                         |

Sheet name is unique per batch. Current versions do not expose mapping review or
posting actions.

## Legacy `staged_import_rows`

Dormant legacy compatibility table for previously staged source-row evidence and
normalized proposals. Current versions do not create or post staged rows.

| Column                          |    Type | Required | Rule                                                  |
| ------------------------------- | ------: | :------: | ----------------------------------------------------- |
| `id`                            |    text |   Yes    | Primary key; UUID                                     |
| `batch_id`                      |    text |   Yes    | Foreign key to `import_batches`                       |
| `sheet_mapping_id`              |    text |   Yes    | Foreign key to `import_sheet_mappings`                |
| `source_sheet_name`             |    text |   Yes    | Workbook sheet name                                   |
| `source_row_number`             | integer |   Yes    | One-based workbook row number                         |
| `source_cell_references_json`   |    text |   Yes    | JSON proposed field to cell reference                 |
| `source_displayed_values_json`  |    text |   Yes    | JSON displayed workbook values                        |
| `source_formulas_json`          |    text |   Yes    | JSON formulas where present                           |
| `proposed_record_type`          |    text |   Yes    | Debt, transaction, term, balance snapshot, or unknown |
| `activity_classification`       |    text |   Yes    | Actual, projected, or ambiguous                       |
| `normalized_values_json`        |    text |   Yes    | JSON normalized proposed values                       |
| `validation_messages_json`      |    text |   Yes    | JSON array of review issues                           |
| `duplicate_candidate_json`      |    text |    No    | Duplicate-candidate review key or metadata            |
| `reconciliation_exception_json` |    text |    No    | Exception metadata for balance-related rows           |
| `review_status`                 |    text |   Yes    | Needs review, approved, rejected, or deferred         |
| `review_notes`                  |    text |    No    | User review notes                                     |
| `reviewed_at_utc`               |    text |    No    | UTC timestamp                                         |
| `created_at_utc`                |    text |   Yes    | UTC timestamp                                         |
| `updated_at_utc`                |    text |   Yes    | UTC timestamp                                         |

Batch, sheet, and row number are unique. Staged rows are not ledger rows, debt
rows, term rows, balance snapshots, or reconciliations.

## Legacy `import_postings`

Dormant legacy provenance table for live records that may have been created by a
previous import workflow. Current versions preserve the rows for readability,
backup, restore, export, and permanent-deletion cleanup.

| Column             | Type | Required | Rule                                                                   |
| ------------------ | ---: | :------: | ---------------------------------------------------------------------- |
| `id`               | text |   Yes    | Primary key; UUID                                                      |
| `batch_id`         | text |   Yes    | Foreign key to `import_batches`                                        |
| `staged_row_id`    | text |   Yes    | Foreign key to `staged_import_rows`                                    |
| `live_entity_type` | text |   Yes    | Debt, debt term, debt transaction, transaction allocation, or snapshot |
| `live_entity_id`   | text |   Yes    | UUID of the live record created from the staged row                    |
| `posted_at_utc`    | text |   Yes    | UTC timestamp for the reviewed posting action                          |
| `created_at_utc`   | text |   Yes    | UTC timestamp                                                          |

`live_entity_type, live_entity_id` is unique so a live record can have only one
legacy import provenance row. Indexes support batch and staged-row lookup.

## `payoff_scenarios`

Stores saved projection inputs and calculation results separately from posted
actual activity.

| Column                        |    Type | Required | Rule                                                         |
| ----------------------------- | ------: | :------: | ------------------------------------------------------------ |
| `id`                          |    text |   Yes    | Primary key; UUID                                            |
| `name`                        |    text |   Yes    | User-facing scenario name                                    |
| `strategy`                    |    text |   Yes    | Baseline, avalanche, snowball, or custom                     |
| `status`                      |    text |   Yes    | Active or archived                                           |
| `scenario_start_date`         |    text |   Yes    | Financial date for application-calculated starting balances  |
| `extra_monthly_payment_cents` | integer |   Yes    | Nonnegative safe-integer cents                               |
| `custom_priority_json`        |    text |   Yes    | JSON array of debt IDs for custom strategy                   |
| `assumptions_json`            |    text |   Yes    | Versioned scenario inputs, including variable-rate overrides |
| `result_json`                 |    text |   Yes    | Calculation-engine output captured at save or rerun time     |
| `calculation_engine_version`  |    text |   Yes    | Engine version used to create `result_json`                  |
| `created_at_utc`              |    text |   Yes    | UTC timestamp                                                |
| `updated_at_utc`              |    text |   Yes    | UTC timestamp                                                |
| `archived_at_utc`             |    text |    No    | UTC timestamp                                                |

Indexes cover status and start date. Scenario results are reproducible from the
stored assumptions, engine version, and actual ledger state as of the scenario
start date. They are not posted transactions and must not update debts,
transactions, snapshots, or reconciliations.

Current `result_json` includes scenario-level totals, per-debt payoff results,
the monthly extra-payment allocation schedule, total projected balance by month,
and payoff-order summaries. Older saved results without the newer schedule
fields remain readable.

## Settings

No `app_settings` table is created. Drizzle maintains migration state, and no
foundational application setting currently justifies a persistent row.
