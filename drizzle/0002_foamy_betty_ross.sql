CREATE TABLE `import_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`staged_row_id` text NOT NULL,
	`live_entity_type` text NOT NULL,
	`live_entity_id` text NOT NULL,
	`posted_at_utc` text NOT NULL,
	`created_at_utc` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`staged_row_id`) REFERENCES `staged_import_rows`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "import_postings_entity_type_valid" CHECK("import_postings"."live_entity_type" IN ('debt', 'debt_term', 'debt_transaction', 'transaction_allocation', 'balance_snapshot')),
	CONSTRAINT "import_postings_timestamp_format" CHECK("import_postings"."posted_at_utc" LIKE '%Z' AND "import_postings"."created_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_postings_live_entity_uq` ON `import_postings` (`live_entity_type`,`live_entity_id`);--> statement-breakpoint
CREATE INDEX `import_postings_batch_idx` ON `import_postings` (`batch_id`);--> statement-breakpoint
CREATE INDEX `import_postings_staged_row_idx` ON `import_postings` (`staged_row_id`);