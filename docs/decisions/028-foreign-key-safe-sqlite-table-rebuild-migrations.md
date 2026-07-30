# ADR 028: Foreign-Key-Safe SQLite Table-Rebuild Migrations

- Date: 2026-07-30
- Status: Accepted

## Context

Version 0.22.0 added migration `0006_famous_archangel.sql` to rebuild
`debt_transactions` so the transaction status check constraint allowed
`voided`. Existing user databases through migration 0005 could contain
foreign-key references from allocations, reconciliations, and provenance tables
to `debt_transactions`.

Drizzle executes migrations in a transaction. SQLite does not apply
`PRAGMA foreign_keys = OFF` after a transaction has already started, so the
foreign-key-disabling statement embedded in the generated migration did not
take effect. The migration failed when it reached:

```sql
DROP TABLE `debt_transactions`;
```

SQLite reported `SQLITE_CONSTRAINT_TRIGGER` with a foreign-key constraint
failure. The failed migration rolled back and did not alter the copied database
used for diagnosis.

## Decision

- Do not edit the already released `0006_famous_archangel.sql` migration.
- Before invoking Drizzle migrations, disable SQLite foreign-key enforcement on
  the migration connection so generated table-rebuild migrations can run with
  SQLite's required settings in effect before Drizzle starts its transaction.
- Re-enable foreign-key enforcement immediately after migration execution.
- Run `PRAGMA foreign_key_check` and `PRAGMA integrity_check` after migrations.
  Startup fails if either validation reports a problem.
- Wrap migration failures in a sanitized `DatabaseMigrationError` that records:
  migration identifier, SQLite error code, sanitized message, and failing stage.

## Consequences

- Existing 0005 databases can upgrade through migration 0006 without deleting or
  rewriting financial records.
- Fresh databases still apply all migrations successfully.
- Partially attempted 0006 states that rolled back can retry safely.
- Startup diagnostics now identify migration failure stage and SQLite code
  without exposing paths, financial values, or raw database contents.
