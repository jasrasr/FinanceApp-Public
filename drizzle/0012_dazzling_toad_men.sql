PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_debt_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`transaction_type` text NOT NULL,
	`effective_date` text NOT NULL,
	`posting_date` text NOT NULL,
	`total_amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`description` text NOT NULL,
	`source_type` text NOT NULL,
	`source_reference` text,
	`transfer_id` text,
	`reversal_of_transaction_id` text,
	`supersedes_transaction_id` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`reversal_of_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`supersedes_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "debt_transactions_type_valid" CHECK("__new_debt_transactions"."transaction_type" IN ('payment', 'borrowing_draw', 'purchase', 'transfer', 'fee', 'penalty', 'interest_charge', 'principal_adjustment', 'escrow_disbursement', 'escrow_adjustment', 'escrow_refund', 'approved_reconciliation_adjustment', 'reversal', 'other')),
	CONSTRAINT "debt_transactions_status_valid" CHECK("__new_debt_transactions"."status" IN ('posted', 'reversed', 'superseded', 'voided')),
	CONSTRAINT "debt_transactions_source_type_valid" CHECK("__new_debt_transactions"."source_type" IN ('manual', 'import', 'statement', 'system', 'reconciliation')),
	CONSTRAINT "debt_transactions_effective_date_format" CHECK("__new_debt_transactions"."effective_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debt_transactions_posting_date_format" CHECK("__new_debt_transactions"."posting_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debt_transactions_amount_range" CHECK("__new_debt_transactions"."total_amount_cents" <> 0 AND "__new_debt_transactions"."total_amount_cents" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "debt_transactions_reversal_relationship" CHECK((("__new_debt_transactions"."transaction_type" = 'reversal' AND "__new_debt_transactions"."reversal_of_transaction_id" IS NOT NULL) OR ("__new_debt_transactions"."transaction_type" <> 'reversal' AND "__new_debt_transactions"."reversal_of_transaction_id" IS NULL))),
	CONSTRAINT "debt_transactions_no_self_relationship" CHECK(("__new_debt_transactions"."reversal_of_transaction_id" IS NULL OR "__new_debt_transactions"."reversal_of_transaction_id" <> "__new_debt_transactions"."id") AND ("__new_debt_transactions"."supersedes_transaction_id" IS NULL OR "__new_debt_transactions"."supersedes_transaction_id" <> "__new_debt_transactions"."id")),
	CONSTRAINT "debt_transactions_timestamp_format" CHECK("__new_debt_transactions"."created_at_utc" LIKE '%Z' AND "__new_debt_transactions"."updated_at_utc" LIKE '%Z')
);
--> statement-breakpoint
INSERT INTO `__new_debt_transactions`("id", "debt_id", "transaction_type", "effective_date", "posting_date", "total_amount_cents", "status", "description", "source_type", "source_reference", "transfer_id", "reversal_of_transaction_id", "supersedes_transaction_id", "created_at_utc", "updated_at_utc") SELECT "id", "debt_id", "transaction_type", "effective_date", "posting_date", "total_amount_cents", "status", "description", "source_type", "source_reference", NULL, "reversal_of_transaction_id", "supersedes_transaction_id", "created_at_utc", "updated_at_utc" FROM `debt_transactions`;--> statement-breakpoint
DROP TABLE `debt_transactions`;--> statement-breakpoint
ALTER TABLE `__new_debt_transactions` RENAME TO `debt_transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `debt_transactions_reversal_of_uq` ON `debt_transactions` (`reversal_of_transaction_id`) WHERE "debt_transactions"."reversal_of_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `debt_transactions_supersedes_uq` ON `debt_transactions` (`supersedes_transaction_id`) WHERE "debt_transactions"."supersedes_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `debt_transactions_debt_effective_idx` ON `debt_transactions` (`debt_id`,`effective_date`);--> statement-breakpoint
CREATE INDEX `debt_transactions_debt_posting_idx` ON `debt_transactions` (`debt_id`,`posting_date`);--> statement-breakpoint
CREATE INDEX `debt_transactions_status_idx` ON `debt_transactions` (`status`);
