PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_balance_reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`statement_date` text NOT NULL,
	`statement_ending_balance_cents` integer NOT NULL,
	`application_calculated_balance_cents` integer NOT NULL,
	`calculated_difference_cents` integer NOT NULL,
	`reconciliation_status` text NOT NULL,
	`explanation` text,
	`approved_adjustment_transaction_id` text,
	`source_reference` text,
	`supporting_notes` text,
	`lifecycle_status` text DEFAULT 'current' NOT NULL,
	`supersedes_reconciliation_id` text,
	`superseded_by_reconciliation_id` text,
	`voided_at_utc` text,
	`superseded_at_utc` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`approved_adjustment_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`supersedes_reconciliation_id`) REFERENCES `balance_reconciliations`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`superseded_by_reconciliation_id`) REFERENCES `balance_reconciliations`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "balance_reconciliations_status_valid" CHECK("__new_balance_reconciliations"."reconciliation_status" IN ('unreconciled', 'in_progress', 'reconciled', 'reconciled_with_adjustment', 'exception')),
	CONSTRAINT "balance_reconciliations_lifecycle_valid" CHECK("__new_balance_reconciliations"."lifecycle_status" IN ('current', 'superseded', 'voided')),
	CONSTRAINT "balance_reconciliations_statement_date_format" CHECK("__new_balance_reconciliations"."statement_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "balance_reconciliations_statement_balance_range" CHECK("__new_balance_reconciliations"."statement_ending_balance_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "balance_reconciliations_application_balance_range" CHECK("__new_balance_reconciliations"."application_calculated_balance_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "balance_reconciliations_difference_calculation" CHECK("__new_balance_reconciliations"."calculated_difference_cents" = "__new_balance_reconciliations"."statement_ending_balance_cents" - "__new_balance_reconciliations"."application_calculated_balance_cents"),
	CONSTRAINT "balance_reconciliations_adjustment_consistency" CHECK((("__new_balance_reconciliations"."reconciliation_status" = 'reconciled_with_adjustment' AND "__new_balance_reconciliations"."approved_adjustment_transaction_id" IS NOT NULL) OR ("__new_balance_reconciliations"."reconciliation_status" <> 'reconciled_with_adjustment' AND "__new_balance_reconciliations"."approved_adjustment_transaction_id" IS NULL))),
	CONSTRAINT "balance_reconciliations_timestamp_format" CHECK("__new_balance_reconciliations"."created_at_utc" LIKE '%Z' AND "__new_balance_reconciliations"."updated_at_utc" LIKE '%Z' AND ("__new_balance_reconciliations"."voided_at_utc" IS NULL OR "__new_balance_reconciliations"."voided_at_utc" LIKE '%Z') AND ("__new_balance_reconciliations"."superseded_at_utc" IS NULL OR "__new_balance_reconciliations"."superseded_at_utc" LIKE '%Z'))
);
--> statement-breakpoint
INSERT INTO `__new_balance_reconciliations`("id", "debt_id", "statement_date", "statement_ending_balance_cents", "application_calculated_balance_cents", "calculated_difference_cents", "reconciliation_status", "explanation", "approved_adjustment_transaction_id", "source_reference", "supporting_notes", "lifecycle_status", "supersedes_reconciliation_id", "superseded_by_reconciliation_id", "voided_at_utc", "superseded_at_utc", "created_at_utc", "updated_at_utc") SELECT "id", "debt_id", "statement_date", "statement_ending_balance_cents", "application_calculated_balance_cents", "calculated_difference_cents", "reconciliation_status", "explanation", "approved_adjustment_transaction_id", "source_reference", "supporting_notes", 'current', NULL, NULL, NULL, NULL, "created_at_utc", "updated_at_utc" FROM `balance_reconciliations`;--> statement-breakpoint
DROP TABLE `balance_reconciliations`;--> statement-breakpoint
ALTER TABLE `__new_balance_reconciliations` RENAME TO `balance_reconciliations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `balance_reconciliations_debt_statement_uq` ON `balance_reconciliations` (`debt_id`,`statement_date`) WHERE "balance_reconciliations"."lifecycle_status" = 'current';--> statement-breakpoint
CREATE INDEX `balance_reconciliations_status_idx` ON `balance_reconciliations` (`reconciliation_status`);--> statement-breakpoint
CREATE INDEX `balance_reconciliations_lifecycle_idx` ON `balance_reconciliations` (`lifecycle_status`);--> statement-breakpoint
DROP INDEX `balance_snapshots_debt_date_source_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `balance_snapshots_debt_date_source_uq` ON `balance_snapshots` (`debt_id`,`effective_date`,`source_type`,`source_reference`);
