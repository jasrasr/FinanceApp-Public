CREATE TABLE `debt_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`goal_type` text NOT NULL,
	`debt_id` text,
	`target_amount_cents` integer NOT NULL,
	`starting_balance_cents` integer NOT NULL,
	`target_date` text,
	`status` text NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT `debt_goals_type_valid` CHECK (`goal_type` IN ('portfolio_target', 'debt_payoff', 'debt_target')),
	CONSTRAINT `debt_goals_status_valid` CHECK (`status` IN ('active', 'completed', 'archived')),
	CONSTRAINT `debt_goals_target_nonnegative` CHECK (`target_amount_cents` >= 0),
	CONSTRAINT `debt_goals_starting_nonnegative` CHECK (`starting_balance_cents` >= 0),
	CONSTRAINT `debt_goals_target_date_format` CHECK (`target_date` IS NULL OR `target_date` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `debt_goals_status_idx` ON `debt_goals` (`status`);
--> statement-breakpoint
CREATE INDEX `debt_goals_debt_idx` ON `debt_goals` (`debt_id`);
