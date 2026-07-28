# ADR 019: Backup, Restore, and Export

## Status

Accepted.

## Context

Phase eleven adds local data-management workflows. The application is local-only,
single-user, and uses SQLite in Electron's user-data directory. Backups and
exports must stay outside the Git repository. Restore must avoid leaving the
application with an unusable database if validation or replacement fails.

## Decision

Backups are created in the Electron main process using SQLite's backup API on the
live connection. The application validates the resulting database file with
SQLite `integrity_check` and `foreign_key_check` before reporting success.

Backups are stored under the Electron user-data directory in a `backups` folder.
Manual backups use a `manual-` prefix, automatic rotating backups use an `auto-`
prefix, and pre-restore safety backups use a `pre-restore-` prefix. Automatic
startup backups retain the ten most recent automatic backup files.

Restore is restricted to listed backup files in the backup directory. The
selected backup is validated before restore. Restore then creates a validated
pre-restore safety backup, closes the live database connection, replaces the
database file, reopens and migrates the database, and records a non-sensitive
audit event. Failed restores attempt to leave or return the prior database file
to a usable state and record a non-sensitive failure event when possible.

CSV export writes a timestamped export folder to a user-selected directory
outside the application repository. Exported files are labeled by value basis:
actual, confirmed, calculated, scenario, or exception. Audit-event detail,
internal logs, secrets, and hidden application metadata are not exported.

## Consequences

- Backup and restore remain local and do not require cloud, remote storage,
  encryption-key management, or multi-user coordination.
- Restore does not import arbitrary exported CSV files.
- Exported CSV files are review and analysis outputs, not round-trip application
  import sources.
- Packaging remains out of scope for this phase.
