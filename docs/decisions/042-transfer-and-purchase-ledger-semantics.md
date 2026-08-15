# ADR 042: Transfer and purchase ledger semantics

Accepted for the ledger improvement phase.

Transfers use two linked `transfer` rows sharing a nullable `transfer_id`.
The source row decreases principal and the destination row increases principal.
The rows are created and reversed in one database transaction, and the generic
single-debt transaction workflow does not create transfer rows.

The nullable common identifier remains the narrowest compatible design; no
transfer table migration is required. Repository validation requires the two
application-created rows to use different debts, equal amounts, matching
principal amounts with opposite signs, and one negative source plus one
positive destination. Generic repository insertion rejects transfer rows.
Permanent debt deletion is blocked while a linked transfer side remains on
another debt, and generated reversal rows cannot themselves be reversed.

Credit-card purchases use `purchase`, which increases principal without being
included in new-borrowing metrics. Existing historical transactions are not
reclassified automatically because source intent cannot be inferred safely.
