# ADR 002: Database File Location

## Status

Accepted

## Context

The source repository is inside a OneDrive-synchronized directory. An actively
synced SQLite file can encounter locking, partial synchronization, or accidental
source-control inclusion.

## Decision

The persistent database path is derived from Electron's user-data directory and
uses the filename `debt-tracker.sqlite3`. The live database must remain outside
the repository, source tree, OneDrive project files, and build output.

Automated tests and database checks create unique file-backed databases under the
operating-system temporary directory and remove them after use.

## Consequences

- This phase implements the resolver but does not create a persistent database.
- Tests never call the production path resolver.
- Database maintenance scripts default to isolated temporary databases and
  require an explicit absolute path for any non-temporary target.
