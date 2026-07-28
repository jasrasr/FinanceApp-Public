# Accounting Rules

## Balance Model

Debt balances are positive obligations. Original principal, ledger activity,
confirmed snapshots, application-calculated balances, projections, and scenarios
are distinct concepts.

- Original principal is an opening fact and is never treated as a mutable current
  balance.
- Posted transactions contain actual activity only.
- Confirmed balance snapshots are evidence as of an effective date.
- A calculated balance is not confirmed until reconciled.
- A reconciliation calculated balance is computed for a statement date only and
  is not displayed as a rolling current balance.
- Projected and scenario activity must use future separate models and cannot be
  inserted into the posted ledger.

## Money

Money is stored as safe-integer cents. Binary floating-point values are not used
for stored money or accounting arithmetic.

Decimal-string input is converted to cents at a boundary using half-away-from-zero
rounding. Formatting may convert cents for display only.

## Interest Rates

Annual rates use integer millionths of the decimal annual rate:

```text
5.49% = 0.0549 = 54,900 rate micros
```

This scale retains four decimal places of percentage precision. Conversion starts
from decimal strings and does not use floating-point storage.

Deductible percentages use basis points:

```text
100% = 10,000 basis points
```

## Financial Dates and System Timestamps

- Financial effective and posting dates are timezone-free ISO `YYYY-MM-DD`.
- Calendar validity is checked in application validation.
- Audit and system timestamps use ISO UTC and end in `Z`.
- Financial dates are never converted through local time zones.

## Transaction Sign Convention

User-facing manual transaction workflows accept positive currency amounts only.
The application service converts those positive entries to signed ledger values
before validation and persistence. Transaction totals and allocations in the
posted ledger remain signed changes to the obligation:

- Borrowings and draws are positive.
- Interest charges are positive.
- Fees and penalties are positive.
- Payments are negative.
- Escrow disbursements and refunds reduce the escrow asset balance and are
  positive posted transaction totals under the debt-ledger sign convention.
- Escrow adjustments may be positive or negative when explicitly classified.
- Principal and reconciliation adjustments may be positive or negative when
  explicitly classified.
- Reversals have the exact opposite sign and amount of the original.
- Other activity may be positive or negative but requires explicit description.

Manual-entry allocations are also entered as positive amounts and must sum to the
positive entered transaction amount before sign conversion. Persisted allocations
use the same sign as the transaction total and must sum exactly to that signed
total. User-facing transaction entry classifies amounts as principal, interest,
escrow, fees, or penalties. Principal includes all principal paid, including
additional principal. Legacy extra-principal and other allocation rows remain
readable for compatibility but are not new user-facing categories.

For example, a user enters a generated payment amount of `500.00` and positive
allocations of `400.00` principal and `100.00` interest. The ledger persists the
payment as `-500.00` with `-400.00` principal and `-100.00` interest. A
separately posted interest charge is persisted as positive.

## Unified Posted Ledger

Payments, draws, fees, penalties, interest charges, adjustments, and reversals
share one ledger. This provides a consistent source, posting date, effective date,
status, allocation, correction, and audit model.

The ledger permits only posted, reversed, and superseded statuses. Draft,
projected, and scenario statuses are prohibited by validation and database
constraints.

For statement reconciliation, the application-calculated balance equals original
principal plus non-superseded ledger transaction totals, excluding escrow
allocations, with effective dates on or before the statement date. Reversed
originals remain in the historical calculation; their linked reversal rows offset
them when the reversal effective date is also on or before the statement date.

## Mortgage Escrow Tracking

Mortgage escrow is tracked separately from debt principal and interest.

- A mortgage payment may include an escrow allocation. Under the signed payment
  convention, a negative escrow allocation is an escrow deposit and increases the
  calculated escrow balance.
- Escrow disbursements for real estate taxes, homeowners insurance, mortgage
  insurance, or other explicitly identified escrow expenses reduce the calculated
  escrow balance.
- Escrow refunds reduce the calculated escrow balance and do not reduce mortgage
  principal.
- Escrow adjustments may increase or decrease the escrow balance when explicitly
  classified.
- Escrow activity never changes mortgage principal unless the same transaction
  also contains a separate principal allocation.

The calculated escrow balance is derived from posted escrow allocations and is
displayed separately from the debt ledger balance.

## Effective-Dated Terms

Material terms are stored as historical periods:

- Each term has a start date and optional inclusive end date.
- End cannot precede start.
- A debt cannot have overlapping term periods.
- A new rate period is inserted rather than overwriting the old rate.
- The pair of debt and effective start date is unique.
- The manual workflow appends new terms after the latest recorded start date.
- When the latest term is open, adding a new term closes it on the calendar day
  immediately preceding the new effective start date.
- Original principal and origination date are not changed through descriptive
  editing.
- Rate, required payment, payment frequency, day-count, and calculation changes
  require a new term rather than a debt-row edit.

Effective-dated `debt_terms` records are authoritative for required payment and
payment frequency. The debt table's minimum payment and frequency fields are
retained for database compatibility and are populated from the initial term for
new manual debts.

## Manual Debt Maintenance

- A debt and its initial term are created atomically.
- Initial terms cannot begin before origination.
- HELOC and credit-card records require a stated credit limit.
- Maturity cannot precede origination.
- Deductible percentage is entered as a decimal percentage and persisted as basis
  points from 0 through 10,000.
- Currency and percentage strings are converted through accounting boundary
  helpers; persisted values never use binary floating-point representations.
- Archive and restore affect only `archived_at_utc`; they do not delete the debt,
  terms, or related records.
- Debt status and archival state remain separate concepts.

## Manual Posted Activity and Snapshots

- Manual posted activity uses the unified `debt_transactions` ledger and the
  associated `transaction_allocations` rows.
- This phase records only posted actual activity in that ledger.
- Transaction totals and allocation amounts are signed and must reconcile to one
  another under the documented sign convention.
- Manual transaction entry exposes one Transaction Date. The application uses
  that date as both the posting date and the accounting effective date for
  manually recorded activity.
- Manual transaction entry accepts positive totals and positive allocations. The
  application service applies the accounting sign from the selected transaction
  type before posting.
- Posted transactions may be reversed only by a new linked reversal transaction;
  the original row remains stored and is marked reversed.
- Confirmed balance snapshots are separate evidence records and never overwrite
  the posted ledger.
- The application does not calculate or display an authoritative current balance
  until a later calculation phase is explicitly implemented and tested.
- Snapshot records and reversal transactions both retain their own audit trail.

## Confirmed Balances and Reconciliation

A balance snapshot records external evidence and never alters ledger activity.
The user-facing balance workflow is Reconcile Balance: it records the verified
lender balance as a supporting confirmed snapshot, calculates the ledger balance
through the same reconciliation date, and creates a reconciliation record. It
does not silently overwrite ledger activity.

Reconciliation difference is:

```text
statement ending balance - application-calculated balance
```

The application computes this value. A SQLite check constraint independently
requires the stored difference to equal that formula.

Reconciliation statuses mean:

- `unreconciled`: recorded but not yet reviewed to completion.
- `in_progress`: active review is underway.
- `reconciled`: calculated difference is zero.
- `reconciled_with_adjustment`: a nonzero difference is resolved by an explicit
  approved adjustment transaction.
- `exception`: a nonzero difference or other issue requires follow-up.

An approved adjustment must be a posted
`approved_reconciliation_adjustment` transaction for the same debt. The
reconciliation links to it rather than silently changing the balance.

The approved adjustment total must equal the calculated difference. Its effective
and posting dates are the statement date, its source type is `reconciliation`,
and its source reference is the reconciliation identifier.

## Basic Dashboard Metrics

Dashboard metrics exclude archived debts unless a metric explicitly states
otherwise. Phase six does not create payoff projections, debt-free-date
forecasts, refinance analysis, or advanced reporting.

The default dashboard balance is the application-calculated ledger balance as of
the dashboard effective date. It is not a confirmed snapshot, statement balance,
projected balance, scenario balance, or original principal amount.

Dashboard year-to-date metrics use posted non-superseded actual activity dated
January 1 through the dashboard effective date:

- Principal reduction is the positive display of negative principal and
  legacy extra-principal allocations.
- New borrowings are borrowing and draw transaction totals.
- Interest activity is the net signed interest allocation total. Negative values
  generally indicate interest paid through payment allocations; positive values
  generally indicate interest charged.

Required monthly payments come from current effective debt terms as of the
dashboard effective date. Weekly, biweekly, quarterly, and annual frequencies are
normalized to monthly equivalents using annualized payment frequency divided by 12. Semimonthly payments are doubled. Irregular and other frequencies are
excluded from the amount because no reliable monthly cadence is defined.

Weighted-average interest rate uses current effective annual rates weighted by
application-calculated ledger balances for active debts with positive balances.

Upcoming maturities include active debts maturing within 12 months of the
dashboard effective date. Attention items include unreconciled, in-progress, and
exception reconciliations for active debts.

## Workbook Import Staging

Workbook import starts as a source-ingestion and review workflow. Reviewed
posting is a separate explicit action.

- The workbook is treated as untrusted input and is read only by the Electron
  main process.
- Source workbook name, sheet, row, cell references, displayed values, formulas,
  and import timestamps are preserved for provenance.
- Source displayed values are retained separately from normalized proposed
  values.
- Staged rows may be detected as likely debts, transactions, terms, balance
  snapshots, or unknown records.
- Actual-versus-projected classification is never silently inferred when the row
  is ambiguous. Ambiguous rows remain flagged for review and cannot be approved
  until classified.
- Formula text is preserved as source metadata. Workbook formulas do not become
  Debt Tracker accounting rules unless a future phase independently documents
  and tests that rule.
- Approving, rejecting, or deferring staged mappings and rows records review
  state only. Posting requires a separate confirmed batch action.
- Duplicate candidates, invalid values, control totals, and reconciliation
  exceptions are review aids and do not alter the posted ledger.

## Reviewed Workbook Import Posting

Reviewed posting converts only approved, valid, actual staged rows with approved
sheet mappings into live records.

- No staged row posts unless it is explicitly approved.
- Ambiguous or projected rows cannot post to actual ledger tables.
- Rows with unresolved validation messages, duplicate candidates, or
  reconciliation exceptions cannot post.
- Posting a batch is all-or-nothing; a failure leaves no partial debts, terms,
  transactions, allocations, snapshots, or provenance rows.
- A completed batch is closed. Retrying a closed batch returns the existing
  posting provenance and does not create duplicates.
- Posted transaction rows use source type `import` and a source reference of
  `import:<batch-id>:<staged-row-id>`.
- Posted balance snapshots from workbook import use source type `import` and
  the same source-reference pattern.
- `import_postings` records link each created live record back to the import
  batch and staged row. Original source displayed values and formulas remain in
  staging and are not copied into normalized posted values.
- Import posting does not create reconciliations. Statement reconciliations
  remain a separate workflow.

## Projection and Payoff Scenarios

Payoff scenarios are decision-support records. They are saved separately from
actual debts, transactions, allocations, snapshots, and reconciliations.

- Starting balances are application-calculated ledger balances as of the
  explicit scenario start date.
- The projection engine uses the applicable effective-dated debt term for each
  monthly projection period.
- Required payments are normalized to monthly equivalents by payment frequency.
- Extra monthly payments are applied after scheduled payments according to the
  selected strategy: baseline, debt avalanche, debt snowball, or custom priority.
- Freed scheduled payments roll into the next prioritized debt because the
  engine uses a constant monthly cash requirement once the scenario starts.
- Interest is calculated only for supported conventions:
  - Explicit zero-interest obligations accrue no interest.
  - Monthly day-count terms with amortized monthly, simple, or interest-only
    calculation conventions use a monthly interest period.
  - Actual/360 and actual/365 terms with simple daily calculation use actual
    days between monthly projection dates.
- Zero-interest obligations accrue no interest while zero-rate terms apply.
- Variable-rate debts require explicit scenario rate overrides. Without an
  override, the debt is marked unsupported rather than projected with a silently
  held rate.
- Revolving debts assume no future draws and display that assumption.
- Balloon maturities are enforced. If a balance remains at maturity, the debt is
  marked unsupported because phase nine does not yet have an explicit
  balloon-payment assumption.
- Irregular or unsupported payment schedules are marked unsupported for
  projection.
- Unsupported calculation conventions or day-count combinations are marked
  unsupported and excluded from scenario totals.
- Insufficient payments, including periods where required payments do not cover
  projected interest, are shown as negative-amortization warnings.
- Negative projected balances are prevented and interest stops after payoff.
- Scenario assumptions, results, and calculation-engine version are saved so
  results remain reviewable and rerunnable.
- Projected transactions are never written to the posted actual ledger.

## Advanced Debt Reporting

Advanced reports are read-only decision-support views. They reuse posted ledger,
confirmed snapshot, reconciliation, effective-term, dashboard, and payoff
scenario data without creating or editing financial records.

Each report section states:

- Date range.
- Effective date.
- Balance basis.
- Material assumptions.
- Warnings for unsupported or incomplete data.

The default report balance basis is application-calculated ledger balance as of
the report effective date or period end. That balance is not a confirmed
snapshot, statement balance, original principal, projected balance, or scenario
balance.

Monthly and annual rollforwards use:

- Beginning balance: application-calculated ledger balance as of the day before
  the period start.
- Ending balance: application-calculated ledger balance as of the period end.
- Borrowings: posted borrowing/draw transaction totals.
- Payments: positive display of posted payment transaction totals.
- Principal reduction: positive display of negative principal and
  extra-principal allocations.
- Interest activity: net signed interest allocations.
- Adjustments and other: residual posted activity not classified as borrowings
  or payments.

Balance-history reporting shows calculated ledger balances and latest confirmed
snapshots separately. It does not treat the latest confirmed snapshot as the
current balance unless a future reconciliation or reporting rule explicitly does
so.

Maturity and required-payment schedules use current effective terms as of the
report effective date. Required payments are normalized to monthly equivalents
using the same helper used by the dashboard.

Interest-rate and extra-payment sensitivity reports reuse the payoff scenario
engine. Unsupported payment schedules, unsupported calculation conventions,
variable-rate debts without explicit assumptions, and balloon maturity limits
produce warnings from that engine rather than deceptively precise payoff dates or
interest totals.

Actual-versus-plan variance uses saved payoff scenarios as the plan source.
Saved scenarios currently preserve scenario-level results and per-debt final
results, but they do not persist monthly planned-balance schedules. When a
period-by-period planned reduction cannot be determined, the report labels the
variance as limited instead of inventing a plan amount.

Reconciliation and data-quality exception reporting includes unreconciled,
in-progress, exception, and unsupported-data items. It does not change
reconciliation statuses, post adjustments, or edit ledger activity.

## Backup, Restore, and Export

Backups, restores, and exports are data-management workflows. They do not create,
edit, or delete debts, terms, transactions, allocations, snapshots,
reconciliations, or payoff scenarios through financial posting rules.

- Backups use SQLite's online backup behavior against the live connection.
- Backup success requires post-backup SQLite `integrity_check` and
  `foreign_key_check` validation.
- Automatic backups are rotating operational safeguards and are not report
  snapshots.
- Restore validates the selected backup before replacing the live database.
- Restore creates a pre-restore safety backup using the same validation process.
- Restore records non-sensitive audit events for successful and failed attempts.
- Export files distinguish:
  - `actual` obligation, term, transaction, allocation, and reconciliation data.
  - `confirmed` balance snapshot evidence.
  - `calculated` dashboard and report values.
  - `scenario` saved payoff scenario values.
- Export files intentionally omit audit-event detail and internal logs.
- Exported files are not import sources for this phase.

## Corrections and Reversals

Posted activity is not silently deleted or overwritten.

- A reversal is a new transaction linked to the original.
- Reversal total and allocations are exact opposites.
- The original remains stored and is marked reversed.
- A transaction may be reversed only once.
- Superseding corrections use a separate unique relationship.
- A reversal creates a non-sensitive audit event.

## Audit Metadata

Audit summaries identify the event and related records without repeating
financial values. Before/after metadata must be minimal and must not contain
unnecessary personal or financial information.

## Day-Count and Calculation Conventions

The schema recognizes actual/365, actual/360, 30/360, and monthly day-count
conventions, plus simple daily, amortized monthly, interest-only, simple, and
other calculation conventions.

This phase stores and validates those classifications but does not implement
interest accrual or amortization calculations.
