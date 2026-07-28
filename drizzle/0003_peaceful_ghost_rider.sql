CREATE TABLE `payoff_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`strategy` text NOT NULL,
	`status` text NOT NULL,
	`scenario_start_date` text NOT NULL,
	`extra_monthly_payment_cents` integer NOT NULL,
	`custom_priority_json` text NOT NULL,
	`assumptions_json` text NOT NULL,
	`result_json` text NOT NULL,
	`calculation_engine_version` text NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	`archived_at_utc` text,
	CONSTRAINT "payoff_scenarios_strategy_valid" CHECK("payoff_scenarios"."strategy" IN ('baseline', 'avalanche', 'snowball', 'custom')),
	CONSTRAINT "payoff_scenarios_status_valid" CHECK("payoff_scenarios"."status" IN ('active', 'archived')),
	CONSTRAINT "payoff_scenarios_start_date_format" CHECK("payoff_scenarios"."scenario_start_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "payoff_scenarios_extra_payment_range" CHECK("payoff_scenarios"."extra_monthly_payment_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "payoff_scenarios_timestamp_format" CHECK("payoff_scenarios"."created_at_utc" LIKE '%Z' AND "payoff_scenarios"."updated_at_utc" LIKE '%Z' AND ("payoff_scenarios"."archived_at_utc" IS NULL OR "payoff_scenarios"."archived_at_utc" LIKE '%Z'))
);
--> statement-breakpoint
CREATE INDEX `payoff_scenarios_status_idx` ON `payoff_scenarios` (`status`);--> statement-breakpoint
CREATE INDEX `payoff_scenarios_start_date_idx` ON `payoff_scenarios` (`scenario_start_date`);