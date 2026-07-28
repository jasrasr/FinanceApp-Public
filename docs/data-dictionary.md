# Data Dictionary

## Conventions

- Identifiers are application-generated UUID strings stored as SQLite `TEXT`.
- Money is stored as signed or nonnegative integer cents, depending on context.
- Annual rates are stored as integer millionths of the decimal rate.
- Deductible percentages are stored in basis points, where `100% = 10,000`.
- Financial dates are timezone-free `TEXT` in `YYYY-MM-DD` format.
- System and audit timestamps are UTC ISO strings ending in `Z`.
- Posted ledger statuses do not include projected or scenario activity.
- Foreign keys use `ON DELETE RESTRICT` to preserve financial history.

## `debts`

Identifies and classifies an obligation. It does not contain an authoritative
mutable current-balance field.

| Column                      |    Type | Required | Rule                                                                                    |
| --------------------------- | ------: | :------: | --------------------------------------------------------------------------------------- |
| `id`                        |    text |   Yes    | Primary key; UUID                                                                       |
| `name`                      |    text |   Yes    | User-facing obligation name                                                             |
| `creditor`                  |    text |   Yes    | Creditor or lender                                                                      |
| `owner_entity`              |    text |   Yes    | Person, household, or entity responsible                                                |
| `debt_type`                 |    text |   Yes    | Mortgage, HELOC, auto, student, personal, business, credit card, medical, tax, or other |
| `purpose`                   |    text |   Yes    | Purpose of the obligation                                                               |
| `status`                    |    text |   Yes    | Active, paid off, or closed                                                             |
| `original_principal_cents`  | integer |   Yes    | Nonnegative safe-integer cents                                                          |
| `origination_date`          |    text |   Yes    | Financial date                                                                          |
| `maturity_date`             |    text |    No    | Financial date not before origination                                                   |
| `minimum_payment_cents`     | integer |   Yes    | Opening debt-level minimum; later contractual changes use `debt_terms`                  |
| `payment_frequency`         |    text |   Yes    | Opening debt-level frequency; later contractual changes use `debt_terms`                |
| `credit_limit_cents`        | integer |    No    | Nonnegative safe-integer cents                                                          |
| `collateral_description`    |    text |    No    | Non-sensitive collateral description                                                    |
| `tax_category`              |    text |   Yes    | Controlled tax classification                                                           |
| `deductible_percentage_bps` | integer |   Yes    | From 0 through 10,000                                                                   |
| `notes`                     |    text |    No    | Supporting notes                                                                        |
| `created_at_utc`            |    text |   Yes    | UTC timestamp                                                                           |
| `updated_at_utc`            |    text |   Yes    | UTC timestamp                                                                           |
| `archived_at_utc`           |    text |    No    | UTC timestamp                                                                           |

Indexes cover creditor, owner/entity, and status. `archived_at_utc` is independent
of obligation status: a null value includes the debt in the default list, while a
timestamp preserves the record but hides it unless archived records are requested.

The manual-maintenance service treats original principal and origination date as
opening facts. Descriptive and administrative fields use optimistic concurrency
based on `updated_at_utc`.

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
reversals, and other explicitly classified actual activity.

| Column                       |    Type | Required | Rule                                                 |
| ---------------------------- | ------: | :------: | ---------------------------------------------------- |
| `id`                         |    text |   Yes    | Primary key; UUID                                    |
| `debt_id`                    |    text |   Yes    | Foreign key to `debts`                               |
| `transaction_type`           |    text |   Yes    | Controlled posted transaction type                   |
| `effective_date`             |    text |   Yes    | Economic financial date                              |
| `posting_date`               |    text |   Yes    | Posting financial date                               |
| `total_amount_cents`         | integer |   Yes    | Nonzero signed safe-integer cents                    |
| `status`                     |    text |   Yes    | Posted, reversed, or superseded                      |
| `description`                |    text |   Yes    | Human-readable explanation                           |
| `source_type`                |    text |   Yes    | Manual, import, statement, system, or reconciliation |
| `source_reference`           |    text |    No    | External or internal provenance reference            |
| `reversal_of_transaction_id` |    text |    No    | Unique self-reference for a reversal                 |
| `supersedes_transaction_id`  |    text |    No    | Unique self-reference for a correction               |
| `created_at_utc`             |    text |   Yes    | UTC timestamp                                        |
| `updated_at_utc`             |    text |   Yes    | UTC timestamp                                        |

Indexes cover debt/effective date, debt/posting date, and status. A reversal must
reference exactly one prior transaction and originals cannot be deleted. Approved
reconciliation adjustments are explicit posted transactions with source type
`reconciliation` and source reference pointing to the reconciliation record that
approved them.

## `transaction_allocations`

Breaks a posted transaction into accounting classifications.

| Column            |    Type | Required | Rule                                                                 |
| ----------------- | ------: | :------: | -------------------------------------------------------------------- |
| `id`              |    text |   Yes    | Primary key; UUID                                                    |
| `transaction_id`  |    text |   Yes    | Foreign key to `debt_transactions`                                   |
| `allocation_type` |    text |   Yes    | Principal, interest, escrow, fee, penalty, extra principal, or other |
| `amount_cents`    | integer |   Yes    | Nonzero signed safe-integer cents                                    |
| `notes`           |    text |    No    | Allocation explanation                                               |
| `created_at_utc`  |    text |   Yes    | UTC timestamp                                                        |
| `updated_at_utc`  |    text |   Yes    | UTC timestamp                                                        |

Each allocation type occurs at most once per transaction. Repository validation
requires allocation signs to follow the transaction and their sum to equal the
transaction total.

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

Debt, date, and source type are unique.
These records preserve external evidence without overwriting the posted ledger.

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
| `created_at_utc`                       |    text |   Yes    | UTC timestamp                                                                   |
| `updated_at_utc`                       |    text |   Yes    | UTC timestamp                                                                   |

Debt and statement date are unique. Adjustment-reference presence must agree with
the reconciliation status. The application-calculated balance is computed from
original principal plus non-superseded posted-ledger activity through the
statement date. The stored difference is calculated by the application and also
checked by the database constraint.

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
audit events. Summaries avoid financial amounts; update metadata identifies
classifications and related record identifiers rather than financial values.

## Settings

No `app_settings` table is created. Drizzle maintains migration state, and no
foundational application setting currently justifies a persistent row.
