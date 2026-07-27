CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`occurred_at_utc` text NOT NULL,
	`source` text NOT NULL,
	`summary` text NOT NULL,
	`before_metadata_json` text,
	`after_metadata_json` text,
	CONSTRAINT "audit_events_source_valid" CHECK("audit_events"."source" IN ('user', 'import', 'system', 'migration')),
	CONSTRAINT "audit_events_timestamp_format" CHECK("audit_events"."occurred_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_events_occurred_at_idx` ON `audit_events` (`occurred_at_utc`);--> statement-breakpoint
CREATE TABLE `balance_reconciliations` (
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
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`approved_adjustment_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "balance_reconciliations_status_valid" CHECK("balance_reconciliations"."reconciliation_status" IN ('unreconciled', 'in_progress', 'reconciled', 'reconciled_with_adjustment', 'exception')),
	CONSTRAINT "balance_reconciliations_statement_date_format" CHECK("balance_reconciliations"."statement_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "balance_reconciliations_statement_balance_range" CHECK("balance_reconciliations"."statement_ending_balance_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "balance_reconciliations_application_balance_range" CHECK("balance_reconciliations"."application_calculated_balance_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "balance_reconciliations_difference_calculation" CHECK("balance_reconciliations"."calculated_difference_cents" = "balance_reconciliations"."statement_ending_balance_cents" - "balance_reconciliations"."application_calculated_balance_cents"),
	CONSTRAINT "balance_reconciliations_adjustment_consistency" CHECK((("balance_reconciliations"."reconciliation_status" = 'reconciled_with_adjustment' AND "balance_reconciliations"."approved_adjustment_transaction_id" IS NOT NULL) OR ("balance_reconciliations"."reconciliation_status" <> 'reconciled_with_adjustment' AND "balance_reconciliations"."approved_adjustment_transaction_id" IS NULL))),
	CONSTRAINT "balance_reconciliations_timestamp_format" CHECK("balance_reconciliations"."created_at_utc" LIKE '%Z' AND "balance_reconciliations"."updated_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_reconciliations_debt_statement_uq` ON `balance_reconciliations` (`debt_id`,`statement_date`);--> statement-breakpoint
CREATE INDEX `balance_reconciliations_status_idx` ON `balance_reconciliations` (`reconciliation_status`);--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`effective_date` text NOT NULL,
	`confirmed_balance_cents` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_reference` text,
	`notes` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "balance_snapshots_source_type_valid" CHECK("balance_snapshots"."source_type" IN ('manual', 'statement', 'import')),
	CONSTRAINT "balance_snapshots_effective_date_format" CHECK("balance_snapshots"."effective_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "balance_snapshots_balance_range" CHECK("balance_snapshots"."confirmed_balance_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "balance_snapshots_timestamp_format" CHECK("balance_snapshots"."created_at_utc" LIKE '%Z' AND "balance_snapshots"."updated_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_snapshots_debt_date_source_uq` ON `balance_snapshots` (`debt_id`,`effective_date`,`source_type`);--> statement-breakpoint
CREATE INDEX `balance_snapshots_debt_effective_idx` ON `balance_snapshots` (`debt_id`,`effective_date`);--> statement-breakpoint
CREATE TABLE `debt_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`effective_start_date` text NOT NULL,
	`effective_end_date` text,
	`interest_rate_type` text NOT NULL,
	`interest_rate_micros` integer NOT NULL,
	`day_count_convention` text NOT NULL,
	`calculation_convention` text NOT NULL,
	`required_payment_cents` integer NOT NULL,
	`payment_frequency` text NOT NULL,
	`notes` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "debt_terms_rate_type_valid" CHECK("debt_terms"."interest_rate_type" IN ('fixed', 'variable', 'promotional', 'zero')),
	CONSTRAINT "debt_terms_day_count_valid" CHECK("debt_terms"."day_count_convention" IN ('actual_365', 'actual_360', 'thirty_360', 'monthly')),
	CONSTRAINT "debt_terms_calculation_valid" CHECK("debt_terms"."calculation_convention" IN ('simple_daily', 'amortized_monthly', 'interest_only', 'simple', 'other')),
	CONSTRAINT "debt_terms_payment_frequency_valid" CHECK("debt_terms"."payment_frequency" IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'irregular', 'other')),
	CONSTRAINT "debt_terms_effective_start_format" CHECK("debt_terms"."effective_start_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debt_terms_effective_end_format" CHECK("debt_terms"."effective_end_date" IS NULL OR "debt_terms"."effective_end_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debt_terms_effective_period_order" CHECK("debt_terms"."effective_end_date" IS NULL OR "debt_terms"."effective_end_date" >= "debt_terms"."effective_start_date"),
	CONSTRAINT "debt_terms_interest_rate_range" CHECK("debt_terms"."interest_rate_micros" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "debt_terms_zero_rate_consistency" CHECK("debt_terms"."interest_rate_type" <> 'zero' OR "debt_terms"."interest_rate_micros" = 0),
	CONSTRAINT "debt_terms_required_payment_range" CHECK("debt_terms"."required_payment_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "debt_terms_timestamp_format" CHECK("debt_terms"."created_at_utc" LIKE '%Z' AND "debt_terms"."updated_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debt_terms_debt_start_uq` ON `debt_terms` (`debt_id`,`effective_start_date`);--> statement-breakpoint
CREATE INDEX `debt_terms_debt_period_idx` ON `debt_terms` (`debt_id`,`effective_start_date`,`effective_end_date`);--> statement-breakpoint
CREATE TABLE `debt_transactions` (
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
	`reversal_of_transaction_id` text,
	`supersedes_transaction_id` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`reversal_of_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`supersedes_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "debt_transactions_type_valid" CHECK("debt_transactions"."transaction_type" IN ('payment', 'borrowing_draw', 'fee', 'penalty', 'interest_charge', 'principal_adjustment', 'approved_reconciliation_adjustment', 'reversal', 'other')),
	CONSTRAINT "debt_transactions_status_valid" CHECK("debt_transactions"."status" IN ('posted', 'reversed', 'superseded')),
	CONSTRAINT "debt_transactions_source_type_valid" CHECK("debt_transactions"."source_type" IN ('manual', 'import', 'statement', 'system', 'reconciliation')),
	CONSTRAINT "debt_transactions_effective_date_format" CHECK("debt_transactions"."effective_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debt_transactions_posting_date_format" CHECK("debt_transactions"."posting_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debt_transactions_amount_range" CHECK("debt_transactions"."total_amount_cents" <> 0 AND "debt_transactions"."total_amount_cents" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "debt_transactions_reversal_relationship" CHECK((("debt_transactions"."transaction_type" = 'reversal' AND "debt_transactions"."reversal_of_transaction_id" IS NOT NULL) OR ("debt_transactions"."transaction_type" <> 'reversal' AND "debt_transactions"."reversal_of_transaction_id" IS NULL))),
	CONSTRAINT "debt_transactions_no_self_relationship" CHECK(("debt_transactions"."reversal_of_transaction_id" IS NULL OR "debt_transactions"."reversal_of_transaction_id" <> "debt_transactions"."id") AND ("debt_transactions"."supersedes_transaction_id" IS NULL OR "debt_transactions"."supersedes_transaction_id" <> "debt_transactions"."id")),
	CONSTRAINT "debt_transactions_timestamp_format" CHECK("debt_transactions"."created_at_utc" LIKE '%Z' AND "debt_transactions"."updated_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debt_transactions_reversal_of_uq` ON `debt_transactions` (`reversal_of_transaction_id`) WHERE "debt_transactions"."reversal_of_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `debt_transactions_supersedes_uq` ON `debt_transactions` (`supersedes_transaction_id`) WHERE "debt_transactions"."supersedes_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `debt_transactions_debt_effective_idx` ON `debt_transactions` (`debt_id`,`effective_date`);--> statement-breakpoint
CREATE INDEX `debt_transactions_debt_posting_idx` ON `debt_transactions` (`debt_id`,`posting_date`);--> statement-breakpoint
CREATE INDEX `debt_transactions_status_idx` ON `debt_transactions` (`status`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`creditor` text NOT NULL,
	`owner_entity` text NOT NULL,
	`debt_type` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`original_principal_cents` integer NOT NULL,
	`origination_date` text NOT NULL,
	`maturity_date` text,
	`minimum_payment_cents` integer NOT NULL,
	`payment_frequency` text NOT NULL,
	`credit_limit_cents` integer,
	`collateral_description` text,
	`tax_category` text NOT NULL,
	`deductible_percentage_bps` integer NOT NULL,
	`notes` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	`archived_at_utc` text,
	CONSTRAINT "debts_type_valid" CHECK("debts"."debt_type" IN ('mortgage', 'heloc', 'auto', 'student', 'personal', 'business', 'credit_card', 'medical', 'tax', 'other')),
	CONSTRAINT "debts_status_valid" CHECK("debts"."status" IN ('active', 'paid_off', 'closed')),
	CONSTRAINT "debts_payment_frequency_valid" CHECK("debts"."payment_frequency" IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'irregular', 'other')),
	CONSTRAINT "debts_tax_category_valid" CHECK("debts"."tax_category" IN ('personal_nondeductible', 'mortgage_interest', 'investment_interest', 'business', 'student_loan', 'other', 'unknown')),
	CONSTRAINT "debts_original_principal_range" CHECK("debts"."original_principal_cents" >= 0 AND "debts"."original_principal_cents" <= 9007199254740991),
	CONSTRAINT "debts_minimum_payment_range" CHECK("debts"."minimum_payment_cents" >= 0 AND "debts"."minimum_payment_cents" <= 9007199254740991),
	CONSTRAINT "debts_credit_limit_range" CHECK("debts"."credit_limit_cents" IS NULL OR ("debts"."credit_limit_cents" >= 0 AND "debts"."credit_limit_cents" <= 9007199254740991)),
	CONSTRAINT "debts_deductible_percentage_range" CHECK("debts"."deductible_percentage_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "debts_origination_date_format" CHECK("debts"."origination_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debts_maturity_date_format" CHECK("debts"."maturity_date" IS NULL OR "debts"."maturity_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debts_maturity_after_origination" CHECK("debts"."maturity_date" IS NULL OR "debts"."maturity_date" >= "debts"."origination_date"),
	CONSTRAINT "debts_timestamp_format" CHECK("debts"."created_at_utc" LIKE '%Z' AND "debts"."updated_at_utc" LIKE '%Z' AND ("debts"."archived_at_utc" IS NULL OR "debts"."archived_at_utc" LIKE '%Z'))
);
--> statement-breakpoint
CREATE INDEX `debts_creditor_idx` ON `debts` (`creditor`);--> statement-breakpoint
CREATE INDEX `debts_owner_entity_idx` ON `debts` (`owner_entity`);--> statement-breakpoint
CREATE INDEX `debts_status_idx` ON `debts` (`status`);--> statement-breakpoint
CREATE TABLE `transaction_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`allocation_type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`notes` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "transaction_allocations_type_valid" CHECK("transaction_allocations"."allocation_type" IN ('principal', 'interest', 'escrow', 'fee', 'penalty', 'extra_principal', 'other')),
	CONSTRAINT "transaction_allocations_amount_range" CHECK("transaction_allocations"."amount_cents" <> 0 AND "transaction_allocations"."amount_cents" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "transaction_allocations_timestamp_format" CHECK("transaction_allocations"."created_at_utc" LIKE '%Z' AND "transaction_allocations"."updated_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_allocations_type_uq` ON `transaction_allocations` (`transaction_id`,`allocation_type`);--> statement-breakpoint
CREATE INDEX `transaction_allocations_transaction_idx` ON `transaction_allocations` (`transaction_id`);