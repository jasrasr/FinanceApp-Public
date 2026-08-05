# Accounting Rules

## Balance Model

Debt balances are positive obligations. Original principal, ledger activity,
confirmed snapshots, application-calculated balances, projections, and scenarios
are distinct concepts.

- Original principal is an opening fact and is never treated as a mutable current
  balance.
- Normal user-facing debt cards and debt detail emphasize the
  application-calculated current principal balance and current effective terms.
  Original principal remains preserved as historical data but is not displayed as
  a current-balance substitute.
- Posted transactions contain actual activity only.
- Confirmed balance snapshots are evidence as of an effective date.
- Confirmed balance snapshots remain available to reconciliation and audit
  workflows even when standalone snapshot history is hidden from the normal
  debt-detail view.
- A calculated balance is not confirmed until reconciled.
- A calculated current balance may be displayed as of an explicit effective date,
  but it is not a confirmed lender balance.
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

For payment entry, the renderer auto-calculates principal as the positive
payment amount less positive interest, escrow, fee, and penalty allocations. The
principal field is read-only in the payment form. If nonprincipal allocations
exceed the payment amount, the renderer prevents submission and the main-process
service validation remains the authoritative control before persistence.

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

For statement reconciliation, dashboard balances, reports, payoff scenario
starting balances, and debt-card current balances, the application-calculated
debt balance equals original principal plus non-superseded balance-affecting
allocation activity with effective dates on or before the calculation date.

Balance-affecting allocation rules are:

- Principal and legacy extra-principal allocations reduce or increase debt
  principal according to their persisted sign.
- Payment interest allocations do not reduce debt principal.
- Payment escrow allocations do not reduce debt principal.
- Escrow disbursements, escrow refunds, and escrow adjustments affect only the
  calculated escrow balance.
- Fees and penalties affect debt balance when posted under their documented
  charge treatment.
- Interest allocations affect debt balance only when posted as an interest-charge
  transaction, not when included in a payment.
- Reversals offset the same principal, interest-charge, fee, penalty, or escrow
  component as the original transaction and require an explicit financial
  reversal date.

The full payment transaction total must not be used as principal reduction.

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
displayed separately from the debt ledger balance. User-facing escrow activity
lists show current effective escrow rows only and convert posted allocation signs
to escrow balance impact: payment deposits and increasing adjustments are
positive, while disbursements, refunds, and decreasing adjustments are negative.
The running escrow balance is a presentation control total and must reconcile
visible signed activity to the displayed current escrow balance.

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
new manual debts. Debt-level `payment_due_day` is authoritative only for the
scheduled calendar day; it does not change historical payment transaction dates
or historical term periods.

## Scheduled Payment Obligations

Debt Tracker tracks unpaid scheduled payment obligations for active debts with a
positive application-calculated principal balance, a modeled payment frequency,
and a configured due day. Existing debts without a due day remain valid and are
flagged for scheduling review; the application does not invent a due date.

Scheduling begins at the nullable `payment_schedule_start_date`, not
automatically at legal origination. Existing debts without a start boundary are
flagged for scheduling review and receive no invented historical obligations.
The boundary preserves origination and transaction history unchanged.

Monthly due dates use the configured day from 1 through 31. When a month does not
have that day, the due date is the final calendar day of that month; later months
return to the configured day when available. Required payment and payment
frequency remain part of the effective-dated term that applies on the due date,
but the required-payment amount does not control due-date satisfaction.

Payments satisfy obligations in chronological order:

- Only current posted `payment` transactions qualify.
- Reversed, voided, superseded, generated reversal, draw, fee, interest-charge,
  escrow, adjustment, refinance, and other nonpayment transactions do not satisfy
  scheduled obligations.
- Corrected replacement payment transactions qualify when they are current and
  posted.
- The transaction effective date is used; created, updated, audit, import, and
  system timestamps are ignored.
- A payment applies first to the earliest unpaid due date.
- A payment after the prior due date and on or before the current due date
  applies to the current due date when earlier obligations are already satisfied.
- A late payment applies to the oldest overdue obligation before any later due
  date.
- Any qualifying posted payment satisfies one scheduled obligation regardless of
  payment amount.
- Multiple payments in the same payment window still satisfy only that one
  scheduled obligation.
- A single payment cannot satisfy more than one scheduled obligation in this
  phase.
- Partial-payment, payments-applied, and remaining-due statuses are not
  calculated by scheduling.
- Overpayments satisfy the current eligible due date but do not automatically
  satisfy a future due date.
- Later draws, interest charges, fees, escrow activity, adjustments, refinance
  events, and other balance activity do not reopen an already satisfied due date.
- A scheduling-only confirmation may satisfy one calculated due date for
  exceptional lender treatment or incomplete historical data. It records a
  reason and audit event, changes no ledger transaction or accounting report,
  and can be removed to restore calculated status.

The dashboard shows unpaid past-due obligations regardless of age, obligations
due today, and upcoming unpaid obligations due within 30 days. Unsupported
frequencies are excluded from Upcoming payments and flagged for review.

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
- Permanent debt deletion is a separate administrative workflow for rebuilding
  an entire obligation and its history. It requires an immediately validated
  backup, exact debt-name confirmation, and a second irreversible-action
  confirmation before deleting the debt, terms, transactions, allocations,
  snapshots, reconciliations, import provenance, related debt-level audit events,
  and payoff-scenario references in one transaction.
- If permanent deletion fails, the transaction rolls back and no partial delete
  is retained. The application records only a non-sensitive application-level
  audit event after a successful deletion so the deleted debt chain is not needed
  to preserve evidence that the administrative action occurred.

## In-Place Refinances

The normal refinance workflow keeps one continuous debt record. A mortgage from
purchase through later refinances remains the same debt ID in debt lists,
dashboard metrics, reports, rollforwards, payoff scenarios, and maturity
schedules.

On save, the application performs one atomic refinance operation:

- Calculate principal immediately before the refinance date.
- Close the prior effective-dated term on the day before the refinance date.
- Insert a new term beginning on the refinance date with the new rate, required
  payment, payment frequency, maturity, rate type, day-count convention, and
  calculation convention.
- Calculate principal change as new refinanced principal less pre-refinance
  calculated principal.
- Post a `principal_adjustment` only for that net change.
- Record a `refinance_events` row linking the prior term, new term, and any
  system-generated refinance transactions.

The new refinanced principal may be higher or lower than the prior calculated
principal. Increases are principal increases; decreases are principal
reductions. The full refinanced balance is not reported as a new borrowing, and
the prior balance payoff is not double-counted.

Refinance fees are classified separately:

- Financed fees are included in the new refinanced principal but are also stored
  on the refinance event for future reporting.
- Cash-paid fees are stored separately and may create a system `other`
  transaction; they do not change principal and are not interest or principal
  payments.

Escrow handling remains separate from principal. The refinance may carry forward
the calculated escrow balance, reset escrow to an opening amount, record a
refund, or record a new deposit. Any resulting escrow transaction uses escrow
classification and does not change debt principal.

If a lender payoff balance differs from the calculated pre-refinance principal,
the user must acknowledge and document the difference. The application does not
silently force a reconciliation difference into the ledger.

Legacy separate-debt refinance columns remain readable for databases created by
prior versions, but normal user-facing forms no longer create financing chains or
replacement debts.

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
The user-facing balance workflow is Reconcile Balance: it accepts only the
reconciliation date and verified lender balance, calculates the ledger balance
through that date, and saves a `reconciled` record only when the values match. A
mismatch is rejected with both balances and the calculated difference; the user
must correct or void the underlying transactions before trying again. It does
not silently overwrite ledger activity or offer an adjustment transaction.

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
- `reconciled_with_adjustment`: retained only for historical compatibility with
  existing approved adjustment records.
- `exception`: a nonzero difference or other issue requires follow-up.

An approved adjustment must be a posted
`approved_reconciliation_adjustment` transaction for the same debt. The
reconciliation links to it rather than silently changing the balance.

The approved adjustment total must equal the calculated difference. Its effective
and posting dates are the statement date, its source type is `reconciliation`,
and its source reference is the reconciliation identifier.

The normal user-facing reconciliation workflow assigns status automatically:

- A zero difference is `reconciled`.
- A nonzero difference is rejected and is not saved.

Users do not manually select reconciliation status in the normal workflow.

Incorrect reconciliations are corrected through lifecycle changes, not silent
overwrites:

- `current` reconciliations control current dashboard/report attention status.
- `superseded` reconciliations remain visible for history and identify the
  replacement reconciliation.
- `voided` reconciliations remain visible for history but no longer control
  current exception reporting.
- A corrected reconciliation for the same debt and statement date supersedes the
  old current reconciliation and creates a new current reconciliation.

## Basic Dashboard Metrics

Dashboard metrics exclude archived debts unless a metric explicitly states
otherwise. Phase six does not create payoff projections, debt-free-date
forecasts, refinance analysis, or advanced reporting.

The default dashboard balance is the application-calculated ledger balance as of
the dashboard effective date. It is not a confirmed snapshot, statement balance,
projected balance, scenario balance, or original principal amount.

Dashboard year-to-date metrics use transaction effective dates for posted
non-superseded actual activity dated January 1 through the dashboard effective
date. They do not use created, updated, posting/system, import, or audit
timestamps.

- Principal reduction is the net positive display of principal and legacy
  extra-principal allocations from payment activity. Reversals dated inside the
  same displayed period offset the original payment activity.
- New borrowings are borrowing and draw transaction totals plus opening
  principal for active debts originated in the displayed year. Opening principal
  is not double-counted when a same-date borrowing/draw transaction already
  represents the original borrowing.
- Interest activity is displayed as a positive expense amount from net signed
  interest allocations dated in the current calendar year. Internally, interest
  paid as part of a payment is stored with the payment's negative sign and linked
  reversals offset that signed activity before display conversion.
- Current escrow balance is calculated from escrow deposits, disbursements,
  refunds, adjustments, and reversals for active debts, and is displayed
  separately from debt principal.

Required monthly payments come from current effective debt terms as of the
dashboard effective date. Weekly, biweekly, quarterly, and annual frequencies are
normalized to monthly equivalents using annualized payment frequency divided by 12. Semimonthly payments are doubled. Irregular and other frequencies are
excluded from the amount because no reliable monthly cadence is defined.

Weighted-average interest rate uses current effective annual rates weighted by
application-calculated ledger balances for active debts with positive balances.

Upcoming maturities include active debts maturing within 12 months of the
dashboard effective date. Attention items include unreconciled, in-progress, and
exception reconciliations for active debts.

## Legacy Import Provenance

Workbook import is no longer a normal user workflow. Existing import staging and
provenance tables remain in the database only to preserve startup, backup,
restore, export, and permanent-deletion compatibility for databases that already
contain historical import records.

- Current activity entry is manual-only through debt, transaction, snapshot, and
  reconciliation workflows.
- Dormant legacy import tables do not authorize new ledger posting.
- Permanent debt deletion removes related legacy import provenance rows when
  they reference records being deleted.

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
- Extra-cash allocation analysis applies a lump sum only to the in-memory
  scenario balance on its selected analysis date. Unused funds are reported,
  custom split inputs must reconcile to the entered lump sum, and no analysis
  result posts a transaction or changes a reconciliation.
- The required-payment baseline deliberately does not apply the lump sum and is
  labeled as a comparison baseline, not as unused cash. Savings on a zero-rate
  initial target are split into direct target savings and downstream rollover
  savings; portfolio savings must reconcile to the sum of debt-level savings.
- Custom split comparisons are not projected until their allocations equal the
  full entered lump sum. Projection horizons disclose the end date and each debt
  preventing a complete payoff result.
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

Report periods currently start no earlier than January 1, 2019. Older
underlying records are preserved, but All activity and custom report ranges are
clamped to the reporting-history start date until a future configuration
explicitly changes it.

Monthly and annual principal rollforwards use:

- Beginning principal: application-calculated principal balance as of the day
  before the period start.
- Ending principal: application-calculated principal balance as of the period
  end.
- Borrowings: opening principal for debts originated in the period plus posted
  borrowing/draw principal allocations. Opening principal is not double-counted
  when an equivalent same-date borrowing/draw already represents the original
  principal.
- Cash payments: positive display of posted payment transaction totals. Cash
  payments are retained as supplemental activity information and are not used in
  the principal rollforward equation.
- Principal reduction: positive display of negative principal and
  extra-principal allocations.
- Interest activity: positive display of net signed interest allocations for the
  report date range. Interest is supplemental activity information and is not
  used in the principal rollforward equation.
- Principal adjustments: principal allocations from activity that is neither a
  borrowing/draw nor a normal principal payment, such as an approved principal
  adjustment.
- Rollforward check: Beginning principal + Borrowings - Principal reduction +
  Principal adjustments - Ending principal. A properly classified rollforward
  should equal zero.

Escrow deposits, real estate tax disbursements, homeowners insurance,
mortgage insurance, escrow refunds, escrow adjustments, interest allocations,
fees, and penalties do not enter principal adjustments merely because they are
nonprincipal activity. They appear only in their appropriate supplemental
activity or escrow reporting.

Debt balance history by obligation uses the active report date range and filters
and shows application-calculated ending principal balance at each report period
end. The normal visualization is an interactive line chart with one line per debt
and one total-debt line. Legend visibility is a report-session display choice
only; it does not change stored financial data. Mouse-wheel input over the chart
zooms only the visible date domain and must not scroll the page. Chart ticks are
calculated from the visible date range rather than rendering every monthly
period. Period-end balances and period-over-period changes are available through
an accessible chart-data disclosure that is closed by default.

In-place refinance events remain on the same debt series. Balance-trend
reporting marks periods containing a refinance event where practical, while
debt-balance history continues as one line for the debt. Rollforwards show only
the net refinance principal adjustment in adjustments and other; they do not
show the full refinanced balance as a new borrowing and do not double-count a
payoff/new-principal exchange. Legacy separate-debt refinance links remain
readable but no longer generate normal combined financing-chain trend rows.

Interest analysis is separate from debt balance trends. Monthly interest expense
is shown as a month-by-month comparison across years. The chart groups January
through December on the X-axis and separates each year represented by interest
activity in the selected range so the same month can be compared across years.
Annual interest comparisons omit zero years when they add no analytical value and
state the omission. Monthly and annual interest displays use positive
user-facing amounts and must reconcile to the accessible tabular detail.

Balance-history reporting shows calculated principal balances and latest
confirmed snapshots separately. It does not treat the latest confirmed snapshot
as the current balance unless a future reconciliation or reporting rule
explicitly does so.

Maturity and required-payment schedules use current effective terms as of the
report effective date. Required payments are normalized to monthly equivalents
using the same helper used by the dashboard.

Interest-rate sensitivity and actual-versus-plan variance are deferred from the
normal Reports screen. Actual-versus-plan analysis must not fabricate planned
values; it requires intentionally persisted period-level scenario baselines
before it can return meaningful variance amounts.

Extra-payment comparison belongs to the payoff scenario workflow and reuses the
payoff engine. Required payments continue on all included debts. The user's
extra monthly amount is applied once per month to the current priority debt, not
once per debt. When a debt is paid off, freed required payments and the extra
amount roll to the next priority debt where supported by the selected strategy.
Unsupported payment schedules, unsupported calculation conventions,
variable-rate debts without explicit assumptions, and balloon maturity limits
produce debt-specific warnings rather than deceptively precise payoff dates or
interest totals.

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
- A user-facing void is a complete linked offset that marks the original
  transaction `voided`; it removes the transaction's current financial effect
  without deleting the stored audit trail.
- Superseding corrections use a separate unique relationship.
- User-facing transaction edits are superseding corrections, not silent updates:
  the original posted transaction remains stored and is marked superseded, an
  exact linked reversal offsets the original, and a corrected replacement
  transaction links back to the original.
- Current balances, dashboard metrics, reports, payoff starting balances, and
  exports use the current transaction chain and exclude the original plus its
  edit reversal when a replacement is current.
- Current activity presentation shows only current posted transactions that
  still affect balances. Reversed originals, generated reversal rows, voided
  transactions, superseded originals, and transaction-chain members with zero
  current financial effect are excluded from the active list and remain visible
  in audit history.
- Escrow balance is calculated from one current transaction-chain rule shared by
  debt detail, dashboard, escrow detail, reports, and exports. Escrow payment
  allocations increase escrow, escrow disbursements and refunds reduce escrow,
  escrow adjustments follow their signed posted allocation, superseded edit
  chains are excluded from current effect, and voided chains net to zero.
- If an edit changes activity dated on or before a current reconciliation's
  statement date, that reconciliation is marked as an exception requiring review
  rather than remaining silently reconciled.
- If a void changes activity dated on or before a current reconciliation's
  statement date, that reconciliation is also marked as an exception requiring
  review.
- A reversal creates a non-sensitive audit event.
- If upgraded or legacy data contains a malformed reversal whose signed total or
  allocations do not completely offset the original transaction, the application
  reports a data-integrity exception and warns that affected debt, escrow, and
  YTD metrics require review.
- Malformed reversals are not silently edited, deleted, or repaired. A future
  repair workflow should create an explicit linked corrective transaction after
  user review.

## Report Presentation Controls

Debt-history and interest charts use the selected report date range as a hard
boundary. Visible series and annual stacked segments are calculated from the
same current-effect report values, while chart zoom, pan, legend visibility,
and date-tick density only change presentation. Annual interest labels are the
sum of the visible debt-source segments; hiding a source recalculates the
visible total and scale. Hover and focus details expose the exact underlying
period, debt name, amount, and reconciliation context without changing ledger
values.

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

Extra-cash comparison labels downstream savings as “Interest saved from
redirected payments.” Saved scenario names are descriptive metadata only;
renaming a scenario does not recalculate or alter projected activity.
