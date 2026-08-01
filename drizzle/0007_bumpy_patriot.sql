PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_debts` (
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
	`financing_chain_name` text,
	`refinanced_from_debt_id` text,
	`refinanced_into_debt_id` text,
	`refinance_date` text,
	`notes` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`refinanced_from_debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`refinanced_into_debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "debts_type_valid" CHECK("__new_debts"."debt_type" IN ('mortgage', 'heloc', 'auto', 'student', 'personal', 'business', 'credit_card', 'medical', 'tax', 'other')),
	CONSTRAINT "debts_status_valid" CHECK("__new_debts"."status" IN ('active', 'paid_off', 'refinanced', 'closed')),
	CONSTRAINT "debts_payment_frequency_valid" CHECK("__new_debts"."payment_frequency" IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'irregular', 'other')),
	CONSTRAINT "debts_tax_category_valid" CHECK("__new_debts"."tax_category" IN ('personal_nondeductible', 'mortgage_interest', 'investment_interest', 'business', 'student_loan', 'other', 'unknown')),
	CONSTRAINT "debts_original_principal_range" CHECK("__new_debts"."original_principal_cents" >= 0 AND "__new_debts"."original_principal_cents" <= 9007199254740991),
	CONSTRAINT "debts_minimum_payment_range" CHECK("__new_debts"."minimum_payment_cents" >= 0 AND "__new_debts"."minimum_payment_cents" <= 9007199254740991),
	CONSTRAINT "debts_credit_limit_range" CHECK("__new_debts"."credit_limit_cents" IS NULL OR ("__new_debts"."credit_limit_cents" >= 0 AND "__new_debts"."credit_limit_cents" <= 9007199254740991)),
	CONSTRAINT "debts_deductible_percentage_range" CHECK("__new_debts"."deductible_percentage_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "debts_refinance_not_self" CHECK(("__new_debts"."refinanced_from_debt_id" IS NULL OR "__new_debts"."refinanced_from_debt_id" <> "__new_debts"."id") AND ("__new_debts"."refinanced_into_debt_id" IS NULL OR "__new_debts"."refinanced_into_debt_id" <> "__new_debts"."id")),
	CONSTRAINT "debts_refinance_date_format" CHECK("__new_debts"."refinance_date" IS NULL OR "__new_debts"."refinance_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debts_origination_date_format" CHECK("__new_debts"."origination_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debts_maturity_date_format" CHECK("__new_debts"."maturity_date" IS NULL OR "__new_debts"."maturity_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "debts_maturity_after_origination" CHECK("__new_debts"."maturity_date" IS NULL OR "__new_debts"."maturity_date" >= "__new_debts"."origination_date"),
	CONSTRAINT "debts_timestamp_format" CHECK("__new_debts"."created_at_utc" LIKE '%Z' AND "__new_debts"."updated_at_utc" LIKE '%Z' AND ("__new_debts"."archived_at_utc" IS NULL OR "__new_debts"."archived_at_utc" LIKE '%Z'))
);
--> statement-breakpoint
INSERT INTO `__new_debts`("id", "name", "creditor", "owner_entity", "debt_type", "purpose", "status", "original_principal_cents", "origination_date", "maturity_date", "minimum_payment_cents", "payment_frequency", "credit_limit_cents", "collateral_description", "tax_category", "deductible_percentage_bps", "financing_chain_name", "refinanced_from_debt_id", "refinanced_into_debt_id", "refinance_date", "notes", "created_at_utc", "updated_at_utc", "archived_at_utc") SELECT "id", "name", "creditor", "owner_entity", "debt_type", "purpose", "status", "original_principal_cents", "origination_date", "maturity_date", "minimum_payment_cents", "payment_frequency", "credit_limit_cents", "collateral_description", "tax_category", "deductible_percentage_bps", NULL, NULL, NULL, NULL, "notes", "created_at_utc", "updated_at_utc", "archived_at_utc" FROM `debts`;--> statement-breakpoint
DROP TABLE `debts`;--> statement-breakpoint
ALTER TABLE `__new_debts` RENAME TO `debts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `debts_creditor_idx` ON `debts` (`creditor`);--> statement-breakpoint
CREATE INDEX `debts_owner_entity_idx` ON `debts` (`owner_entity`);--> statement-breakpoint
CREATE INDEX `debts_status_idx` ON `debts` (`status`);--> statement-breakpoint
CREATE INDEX `debts_refinanced_from_idx` ON `debts` (`refinanced_from_debt_id`);--> statement-breakpoint
CREATE INDEX `debts_refinanced_into_idx` ON `debts` (`refinanced_into_debt_id`);--> statement-breakpoint
CREATE INDEX `debts_financing_chain_idx` ON `debts` (`financing_chain_name`);
