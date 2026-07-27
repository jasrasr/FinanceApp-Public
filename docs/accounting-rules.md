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

Transaction totals and allocations are signed changes to the obligation:

- Borrowings and draws are positive.
- Interest charges are positive.
- Fees and penalties are positive.
- Payments are negative.
- Principal and reconciliation adjustments may be positive or negative when
  explicitly classified.
- Reversals have the exact opposite sign and amount of the original.
- Other activity may be positive or negative but requires explicit description.

Allocations use the same sign as the transaction total and must sum exactly to
that total. Principal, interest, escrow, fees, penalties, extra principal, and
other amounts remain separately classified.

For example, a generated payment of `-500.00` may allocate `-400.00` to principal
and `-100.00` to interest. A separately posted interest charge is positive.

## Unified Posted Ledger

Payments, draws, fees, penalties, interest charges, adjustments, and reversals
share one ledger. This provides a consistent source, posting date, effective date,
status, allocation, correction, and audit model.

The ledger permits only posted, reversed, and superseded statuses. Draft,
projected, and scenario statuses are prohibited by validation and database
constraints.

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

The debt table's minimum payment and frequency capture opening debt-level
information. Effective-dated `debt_terms` records are the historical source for
contractual changes and are used for list and detail term displays.

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
- Posted transactions may be reversed only by a new linked reversal transaction;
  the original row remains stored and is marked reversed.
- Confirmed balance snapshots are separate evidence records and never overwrite
  the posted ledger.
- The application does not calculate or display an authoritative current balance
  until a later calculation phase is explicitly implemented and tested.
- Snapshot records and reversal transactions both retain their own audit trail.

## Confirmed Balances and Reconciliation

A balance snapshot records external evidence and never alters ledger activity.

Reconciliation difference is:

```text
statement ending balance - application-calculated balance
```

The application computes this value. A SQLite check constraint independently
requires the stored difference to equal that formula.

An approved adjustment must be a posted
`approved_reconciliation_adjustment` transaction for the same debt. The
reconciliation links to it rather than silently changing the balance.

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
