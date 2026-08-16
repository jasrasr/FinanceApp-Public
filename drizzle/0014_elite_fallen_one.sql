CREATE TABLE `income_records` (
	`id` text PRIMARY KEY NOT NULL,
	`effective_date` text NOT NULL,
	`gross_monthly_income_cents` integer NOT NULL,
	`net_monthly_income_cents` integer NOT NULL,
	`other_recurring_monthly_income_cents` integer DEFAULT 0 NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	`archived_at_utc` text,
	CONSTRAINT "income_records_effective_date_format" CHECK("income_records"."effective_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "income_records_gross_nonnegative" CHECK("income_records"."gross_monthly_income_cents" >= 0),
	CONSTRAINT "income_records_net_nonnegative" CHECK("income_records"."net_monthly_income_cents" >= 0),
	CONSTRAINT "income_records_other_nonnegative" CHECK("income_records"."other_recurring_monthly_income_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `income_records_effective_date_idx` ON `income_records` (`effective_date`);--> statement-breakpoint
CREATE INDEX `income_records_archived_idx` ON `income_records` (`archived_at_utc`);
