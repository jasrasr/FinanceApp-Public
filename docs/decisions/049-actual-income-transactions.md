# ADR 049: Actual Income Transactions

## Status

Accepted

## Decision

Use a new `income_transactions` table for actual received income events. A row
represents one paycheck, bonus, or other income event and is independent of the
debt ledger. The required received amount is the cash amount; gross and net are
optional explicit values. Reports aggregate events by received month.

Retain `income_records` from migration 0014 for backward compatibility but stop
using it in current analysis. No conversion is performed because the table was
an assumption model and existing production data must not be silently
reinterpreted. New databases and upgrades create the new table through
migration 0015.

## Consequences

Bi-weekly paychecks and sporadic bonuses are represented accurately. Months
without events do not receive synthetic income. If gross or net is missing, the
received amount is used for that specific report measure. Income CRUD remains
auditable through timestamps and archive status and cannot create debt entries.
