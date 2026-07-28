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
- Statement-based balance reconciliation against the ledger balance calculated
  through the statement date, including explicit approved adjustment postings.
- Basic dashboard with active-debt totals, year-to-date posted activity metrics,
  current-term payment and rate summaries, upcoming maturities, and open
  reconciliation attention items.
- Workbook import staging and mapping for Excel files, including source
  provenance, sheet and row review, formulas as source metadata, ambiguous-row
  flags, control totals, and review-only approve/reject/defer states.
- Reviewed workbook import posting for approved actual rows into debts, debt
  terms, posted transactions, allocations, and balance snapshots, with batch
  previews, all-or-nothing posting, safe retry behavior, and source provenance.
- Saved payoff scenarios using baseline, debt avalanche, debt snowball, and
  custom-priority strategies, with rerun and archive support.
- Restrained in-app display of the current package version and automatically
  generated last-changed timestamp.
- Narrow typed IPC methods with request, response, and trusted-sender validation.
- Automatic development-database initialization and migration under Electron's
  user-data directory.
- Playwright-controlled Electron testing against disposable user-data directories.

Advanced reporting, backup, export, and packaging workflows have not been
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
Electron runtime and runs Electron with generated application metadata. Node-based
database and Vitest commands restore the Node-compatible prebuild automatically.

The application version comes from `package.json`. The last-changed timestamp is
generated automatically for `npm run dev` and `npm run build`, displayed in local
time in the application UI, and is not edited manually. Validation commands such
as type checking and tests use deterministic metadata and do not refresh the
visible last-changed timestamp merely because they ran.

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
- Reconciliations calculate a ledger balance only as of the statement date. The
  app still does not display a rolling authoritative current balance.
- Posted transactions and confirmed snapshots are recorded separately from future
  projected or scenario activity.
- Reversal transactions preserve the original posted row and its allocations.
- Statement balances, confirmed snapshots, ledger-calculated balances, and
  posted transactions are separate records.
- Approved reconciliation adjustments are explicit posted transactions linked to
  the reconciliation that approved them.

## Dashboard Rules

- Dashboard metrics exclude archived debts.
- Total active debt uses application-calculated ledger balances as of the
  displayed dashboard effective date.
- Year-to-date metrics use posted non-superseded activity from January 1 through
  the dashboard effective date.
- Principal reduction counts negative principal and extra-principal allocations.
- New borrowings count posted borrowing and draw transaction totals.
- Interest activity is the net signed interest allocation total.
- Required monthly payments use current effective debt terms, normalized to a
  monthly equivalent. Irregular and other frequencies are excluded from that
  amount.
- Weighted-average interest rate uses current effective rates weighted by
  application-calculated ledger balances.

## Projection and Payoff Scenario Rules

- Scenario starting balances use application-calculated ledger balances as of an
  explicit scenario start date.
- Scenario results are saved separately from posted actual activity and never
  write projected transactions to the ledger.
- The engine uses effective-dated debt terms for each monthly projection period.
- Interest is projected only for supported term conventions: monthly interest,
  explicit zero-interest, and actual/360 or actual/365 simple daily interest
  when term data is sufficient.
- Variable-rate debts require explicit scenario rate assumptions; otherwise the
  debt is marked unsupported for projection.
- Revolving debts assume no future draws.
- Balloon maturities are enforced: a debt with balance remaining at maturity is
  marked unsupported unless a future explicit balloon-payment assumption exists.
- Irregular or unsupported payment schedules and unsupported day-count or
  calculation conventions are marked unsupported rather than treated as standard
  monthly amortizing debts.
- Saved scenarios preserve assumptions, results, and calculation-engine version
  for review and rerun.

## Workbook Import Rules

- Workbook selection and parsing occur only in the Electron main process.
- Excel workbooks are treated as untrusted input and are never modified by Debt
  Tracker.
- Import first creates batches, sheet mappings, and staged rows. Posting is a
  separate reviewed action.
- Reviewed posting may create debts, terms, posted transactions, allocations,
  and balance snapshots from approved actual staged rows.
- Import posting does not create reconciliations or payoff projections.
- Posting is all-or-nothing for a batch. Failed posting leaves no partial live
  records, and retrying a completed batch does not create duplicates.
- Source workbook name, fingerprint, sheet, row, cell references, displayed
  values, formulas, and import timestamps are preserved as import provenance.
- Original source values remain separate from normalized proposed values.
- Actual-versus-projected ambiguity is flagged for review and cannot be approved
  silently.
- Workbook formulas are preserved as source metadata only and are not translated
  into application calculation logic.

## Privacy

Use only generated or irreversibly sanitized data in source code, tests,
documentation, screenshots, and commits. Do not copy personal workbooks,
financial data, databases, exports, or backups into this repository.

## Documentation

- [`docs/data-dictionary.md`](docs/data-dictionary.md)
- [`docs/accounting-rules.md`](docs/accounting-rules.md)
- [`docs/workbook-mapping.md`](docs/workbook-mapping.md)
- [`docs/decisions/`](docs/decisions/)
