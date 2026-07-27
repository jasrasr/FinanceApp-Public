# Debt Tracker

Debt Tracker is a Windows-first, local, single-user Electron desktop application
for maintaining debts and supporting future debt-paydown analysis.

## Current Functionality

- Electron main process written in TypeScript.
- React and TypeScript renderer built by Vite through electron-vite.
- Sandboxed renderer with context isolation enabled and Node integration disabled.
- Main-process-only SQLite access through better-sqlite3 and Drizzle ORM.
- Generated Drizzle migrations and isolated file-backed temporary test databases.
- Zod validation and pure accounting boundary helpers.
- Manual debt maintenance: list, create, detail, descriptive update, archive, and
  restore.
- Initial and subsequent effective-dated debt-term periods with preserved history.
- Manual posted activity entry for payments, draws, fees, penalties, interest,
  principal adjustments, other transactions, reversals, and confirmed balance
  snapshots.
- Narrow typed IPC methods with request, response, and trusted-sender validation.
- Automatic development-database initialization and migration under Electron's
  user-data directory.
- Playwright-controlled Electron testing against disposable user-data directories.

Balance calculation, reconciliation, dashboard, workbook import, payoff
scenario, reporting, backup, export, and packaging workflows have not been
implemented.

## Prerequisites

- Node.js
- npm
- Git

## Commands

Install exact locked dependencies:

```powershell
npm ci
```

Run the local development application:

```powershell
npm run dev
```

`dev` installs the official better-sqlite3 prebuilt binary for the configured
Electron runtime before launch. Node-based database and Vitest commands restore
the Node-compatible prebuild automatically.

Build the application:

```powershell
npm run build
```

Format files or verify formatting:

```powershell
npm run format
npm run format:check
```

Run linting, type checking, and tests:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
```

Generate and verify database migrations:

```powershell
npm run db:generate
npm run db:migrate
npm run db:check
```

`db:migrate` migrates a new isolated temporary database by default.

Run the complete currently configured verification gate:

```powershell
npm run check
```

The verification gate includes formatting, linting, type checking, Vitest,
database integrity checks, a production build, and the isolated Electron
end-to-end workflow.

## Development Database

The running application creates `debt-tracker.sqlite3` beneath Electron's Windows
user-data directory and applies committed migrations before opening the renderer.
The database remains outside this repository and OneDrive project directory.

To locate the containing directory without opening or editing the database:

1. Open the application.
2. In Windows, navigate to `%APPDATA%`.
3. Locate the Debt Tracker application-data directory.

To reset development data, close Debt Tracker completely and move the entire Debt
Tracker application-data directory to a separate temporary location. Start the
application to create a new migrated database. Retain the moved directory until
the reset has been verified. Do not edit the SQLite file manually.

Automated tests never use this location. Vitest creates databases under the
operating-system temporary directory, and Playwright supplies a unique temporary
Electron user-data directory that it removes after the workflow.

## Debt Maintenance Rules

- Original principal and origination date are opening facts.
- Debt-level opening minimum payment and payment frequency are captured at
  creation.
- Later rate, required-payment, frequency, day-count, or calculation changes
  require a new effective-dated term.
- A new term is appended after the latest term; an open prior term is closed on
  the day before the new effective date.
- Archive and restore preserve every term and create audit events.
- No current balance is displayed because posted-activity and balance-calculation
  workflows do not yet exist.
- Posted transactions and confirmed snapshots are recorded separately from future
  projected or scenario activity.
- Reversal transactions preserve the original posted row and its allocations.

## Privacy

Use only generated or irreversibly sanitized data in source code, tests,
documentation, screenshots, and commits. Do not copy personal workbooks,
financial data, databases, exports, or backups into this repository.

## Documentation

- [`docs/data-dictionary.md`](docs/data-dictionary.md)
- [`docs/accounting-rules.md`](docs/accounting-rules.md)
- [`docs/workbook-mapping.md`](docs/workbook-mapping.md)
- [`docs/decisions/`](docs/decisions/)
