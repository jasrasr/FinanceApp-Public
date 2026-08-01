CREATE TABLE `refinance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`refinance_date` text NOT NULL,
	`pre_refinance_principal_cents` integer NOT NULL,
	`lender_payoff_balance_cents` integer,
	`new_refinanced_principal_cents` integer NOT NULL,
	`principal_change_cents` integer NOT NULL,
	`financed_fees_cents` integer NOT NULL,
	`cash_fees_cents` integer NOT NULL,
	`escrow_handling` text NOT NULL,
	`escrow_amount_cents` integer,
	`prior_term_id` text NOT NULL,
	`new_term_id` text NOT NULL,
	`principal_transaction_id` text,
	`cash_fee_transaction_id` text,
	`escrow_transaction_id` text,
	`notes` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`prior_term_id`) REFERENCES `debt_terms`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`new_term_id`) REFERENCES `debt_terms`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`principal_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`cash_fee_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`escrow_transaction_id`) REFERENCES `debt_transactions`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "refinance_events_date_format" CHECK("refinance_events"."refinance_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "refinance_events_nonnegative_amounts" CHECK("refinance_events"."pre_refinance_principal_cents" >= 0 AND "refinance_events"."new_refinanced_principal_cents" >= 0 AND "refinance_events"."financed_fees_cents" >= 0 AND "refinance_events"."cash_fees_cents" >= 0 AND ("refinance_events"."lender_payoff_balance_cents" IS NULL OR "refinance_events"."lender_payoff_balance_cents" >= 0)),
	CONSTRAINT "refinance_events_principal_change" CHECK("refinance_events"."principal_change_cents" = "refinance_events"."new_refinanced_principal_cents" - "refinance_events"."pre_refinance_principal_cents"),
	CONSTRAINT "refinance_events_escrow_handling_valid" CHECK("refinance_events"."escrow_handling" IN ('carry_forward', 'reset_opening_balance', 'refund', 'new_deposit')),
	CONSTRAINT "refinance_events_timestamp_format" CHECK("refinance_events"."created_at_utc" LIKE '%Z' AND "refinance_events"."updated_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refinance_events_debt_date_uq` ON `refinance_events` (`debt_id`,`refinance_date`);
--> statement-breakpoint
CREATE INDEX `refinance_events_debt_idx` ON `refinance_events` (`debt_id`);
--> statement-breakpoint
CREATE INDEX `refinance_events_date_idx` ON `refinance_events` (`refinance_date`);
