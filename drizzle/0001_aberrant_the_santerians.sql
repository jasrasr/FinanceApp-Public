CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source_workbook_name` text NOT NULL,
	`source_workbook_fingerprint` text NOT NULL,
	`source_workbook_modified_at_utc` text,
	`status` text NOT NULL,
	`imported_at_utc` text NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	CONSTRAINT "import_batches_status_valid" CHECK("import_batches"."status" IN ('open', 'reviewed', 'closed')),
	CONSTRAINT "import_batches_timestamp_format" CHECK("import_batches"."imported_at_utc" LIKE '%Z' AND "import_batches"."created_at_utc" LIKE '%Z' AND "import_batches"."updated_at_utc" LIKE '%Z' AND ("import_batches"."source_workbook_modified_at_utc" IS NULL OR "import_batches"."source_workbook_modified_at_utc" LIKE '%Z'))
);
--> statement-breakpoint
CREATE INDEX `import_batches_imported_at_idx` ON `import_batches` (`imported_at_utc`);--> statement-breakpoint
CREATE TABLE `import_sheet_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`source_sheet_name` text NOT NULL,
	`proposed_record_type` text NOT NULL,
	`review_status` text NOT NULL,
	`field_mapping_json` text NOT NULL,
	`notes` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "import_sheet_mappings_record_type_valid" CHECK("import_sheet_mappings"."proposed_record_type" IN ('debt', 'transaction', 'term', 'balance_snapshot', 'unknown')),
	CONSTRAINT "import_sheet_mappings_review_status_valid" CHECK("import_sheet_mappings"."review_status" IN ('needs_review', 'approved', 'rejected', 'deferred')),
	CONSTRAINT "import_sheet_mappings_timestamp_format" CHECK("import_sheet_mappings"."created_at_utc" LIKE '%Z' AND "import_sheet_mappings"."updated_at_utc" LIKE '%Z')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_sheet_mappings_batch_sheet_uq` ON `import_sheet_mappings` (`batch_id`,`source_sheet_name`);--> statement-breakpoint
CREATE INDEX `import_sheet_mappings_batch_idx` ON `import_sheet_mappings` (`batch_id`);--> statement-breakpoint
CREATE TABLE `staged_import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`sheet_mapping_id` text NOT NULL,
	`source_sheet_name` text NOT NULL,
	`source_row_number` integer NOT NULL,
	`source_cell_references_json` text NOT NULL,
	`source_displayed_values_json` text NOT NULL,
	`source_formulas_json` text NOT NULL,
	`proposed_record_type` text NOT NULL,
	`activity_classification` text NOT NULL,
	`normalized_values_json` text NOT NULL,
	`validation_messages_json` text NOT NULL,
	`duplicate_candidate_json` text,
	`reconciliation_exception_json` text,
	`review_status` text NOT NULL,
	`review_notes` text,
	`reviewed_at_utc` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`sheet_mapping_id`) REFERENCES `import_sheet_mappings`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "staged_import_rows_record_type_valid" CHECK("staged_import_rows"."proposed_record_type" IN ('debt', 'transaction', 'term', 'balance_snapshot', 'unknown')),
	CONSTRAINT "staged_import_rows_activity_classification_valid" CHECK("staged_import_rows"."activity_classification" IN ('actual', 'projected', 'ambiguous')),
	CONSTRAINT "staged_import_rows_review_status_valid" CHECK("staged_import_rows"."review_status" IN ('needs_review', 'approved', 'rejected', 'deferred')),
	CONSTRAINT "staged_import_rows_row_number_valid" CHECK("staged_import_rows"."source_row_number" > 0),
	CONSTRAINT "staged_import_rows_timestamp_format" CHECK("staged_import_rows"."created_at_utc" LIKE '%Z' AND "staged_import_rows"."updated_at_utc" LIKE '%Z' AND ("staged_import_rows"."reviewed_at_utc" IS NULL OR "staged_import_rows"."reviewed_at_utc" LIKE '%Z'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staged_import_rows_source_uq` ON `staged_import_rows` (`batch_id`,`source_sheet_name`,`source_row_number`);--> statement-breakpoint
CREATE INDEX `staged_import_rows_batch_idx` ON `staged_import_rows` (`batch_id`);--> statement-breakpoint
CREATE INDEX `staged_import_rows_mapping_idx` ON `staged_import_rows` (`sheet_mapping_id`);--> statement-breakpoint
CREATE INDEX `staged_import_rows_review_status_idx` ON `staged_import_rows` (`review_status`);