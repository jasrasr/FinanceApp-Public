CREATE TABLE `income_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	`archived_at_utc` text,
	CONSTRAINT "income_sources_name_not_blank" CHECK(length(trim("income_sources"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_sources_name_idx` ON `income_sources` (`name`);--> statement-breakpoint
CREATE INDEX `income_sources_archived_idx` ON `income_sources` (`archived_at_utc`);--> statement-breakpoint
ALTER TABLE `income_transactions` ADD `source_id` text REFERENCES income_sources(id);
--> statement-breakpoint
INSERT INTO income_sources (id, name, created_at_utc, updated_at_utc, archived_at_utc)
SELECT
  'legacy-' || lower(hex(randomblob(16))),
  source,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  NULL
FROM income_transactions
GROUP BY source;
--> statement-breakpoint
UPDATE income_transactions
SET source_id = (
  SELECT income_sources.id
  FROM income_sources
  WHERE income_sources.name = income_transactions.source
);
