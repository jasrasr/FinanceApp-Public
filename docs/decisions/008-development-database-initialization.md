# ADR 008: Development Database Initialization

## Status

Accepted

## Context

The manual workflow requires persistent local data while the repository resides
inside a OneDrive-synchronized directory.

## Decision

At startup, Electron resolves `debt-tracker.sqlite3` beneath
`app.getPath('userData')`, rejects any location inside the application repository,
opens SQLite with foreign keys enabled, and applies committed migrations before
creating the renderer window.

Initialization failure shows a generic visible error and quits without exposing
the database path to the renderer. The database closes during application quit.

Automated tests use operating-system temporary directories. The Electron
end-to-end workflow may override user data only when explicit test mode is also
enabled.

## Consequences

- Development data persists outside source control and OneDrive project files.
- No debt records are seeded automatically.
- A migration failure prevents the application from operating against a partially
  initialized database.
