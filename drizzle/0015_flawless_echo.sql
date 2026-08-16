CREATE TABLE `income_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`received_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`income_type` text NOT NULL,
	`source` text NOT NULL,
	`notes` text,
	`gross_amount_cents` integer,
	`net_amount_cents` integer,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	`archived_at_utc` text,
	CONSTRAINT "income_transactions_received_date_format" CHECK("income_transactions"."received_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "income_transactions_amount_nonnegative" CHECK("income_transactions"."amount_cents" > 0),
	CONSTRAINT "income_transactions_gross_nonnegative" CHECK("income_transactions"."gross_amount_cents" IS NULL OR "income_transactions"."gross_amount_cents" >= 0),
	CONSTRAINT "income_transactions_net_nonnegative" CHECK("income_transactions"."net_amount_cents" IS NULL OR "income_transactions"."net_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `income_transactions_received_date_idx` ON `income_transactions` (`received_date`);--> statement-breakpoint
CREATE INDEX `income_transactions_archived_idx` ON `income_transactions` (`archived_at_utc`);
