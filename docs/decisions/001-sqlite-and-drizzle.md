# ADR 001: SQLite and Drizzle

## Status

Accepted

## Context

Debt Tracker is a local, single-user desktop application that requires durable
relational data, migrations, constraints, and testable accounting records without
a database server.

## Decision

Use SQLite through `better-sqlite3` in the Electron main process. Use Drizzle ORM
for typed schema and query access and Drizzle Kit for generated SQL migrations.
Use Zod at persistence and service boundaries.

`better-sqlite3` 12.6.2 is pinned because it supports Node 24 and supplies an
official prebuilt binary. Version 13 requires a local native compiler toolchain
that is not part of this project.

## Consequences

- The renderer cannot open the database or execute SQL.
- Native dependency compatibility must be verified when packaging is introduced.
- SQLite foreign keys and integrity checks are explicitly enabled and tested.
- Drizzle migration artifacts are committed with schema changes.
