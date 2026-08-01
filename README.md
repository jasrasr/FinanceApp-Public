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
- Manual debt maintenance for a single personal user: list, create, detail,
  descriptive update, archive, and restore.
- Initial and subsequent effective-dated debt-term periods with preserved history.
- Manual posted activity entry for payments, draws, fees, penalties, interest,
  principal adjustments, mortgage escrow activity, reversals, and user-facing
  transaction edits implemented as linked superseding corrections.
- Statement-based balance reconciliation against the ledger balance calculated
  through the reconciliation date, including a supporting confirmed balance
  snapshot, automatic reconciliation status assignment, explicit approved
  adjustment postings, and void/supersede correction of incorrect
  reconciliations.
- Basic dashboard with active-debt totals, year-to-date posted activity metrics,
  current escrow balance, current-term payment and rate summaries, upcoming
  maturities, open reconciliation attention items, and drill-through navigation
  to debt and escrow detail.
- Saved payoff scenarios using baseline, debt avalanche, debt snowball, and
  custom-priority strategies, with rerun and archive support.
- Advanced read-only debt reports for rollforwards, balance history, activity
  trends, maturity and required-payment schedules, sensitivity analysis,
  actual-versus-plan variance, and reconciliation/data-quality exceptions.
- Debt-history and interest charts provide bounded wheel zoom and drag pan,
  readable date and dynamic currency ticks, accessible series controls,
  immediate compact hover details, and reconciled annual debt-source interest
  totals.
- Data management screen for validated SQLite backups, manual backup deletion
  with confirmation, restore from validated local backups with pre-restore
  safety backup, automatic daily startup backups, five-calendar-day automatic
  retention cleanup, and CSV data exports.
- Windows x64 NSIS installer packaging with Electron-compatible better-sqlite3
  native module handling and packaged-app smoke tests.
- Restrained in-app display of the current package version and automatically
  generated last-changed timestamp.
- Narrow typed IPC methods with request, response, and trusted-sender validation.
- Automatic development-database initialization and migration under Electron's
  user-data directory.
- Playwright-controlled Electron testing against disposable user-data directories.

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

Generate the application icon and create Windows packages:

```powershell
npm run assets:icons
npm run package:dir
npm run package
```

Run the installed-app packaging smoke test:

```powershell
npm run package:smoke
```

`package` creates an unsigned Windows x64 NSIS installer under `dist/`.
`package:smoke` installs that generated installer into a temporary directory,
launches the installed application without Node, npm, VS Code, or the source
repository as runtime dependencies, verifies database creation, historical
mortgage payment/reversal behavior, reconciliation correction, manual debt entry,
backup, restore, export, same-path reinstall/upgrade preservation, and user-data
survival after uninstall, then removes the generated temporary test data.
If Windows temporarily holds a lock on the generated installation directory after
uninstall, the smoke harness reports a cleanup warning; generated user-data and
export directories remain required cleanup targets.

Because code signing is not configured, Windows may show SmartScreen or unsigned
publisher warnings. For local testing, review the installer filename and source,
choose the Windows option to run anyway if appropriate, and install per user. Do
not distribute the unsigned installer as a trusted production release.

## Development Database

The running application creates `debt-tracker.sqlite3` beneath Electron's Windows
user-data directory and applies committed migrations before opening the renderer.
The database remains outside this repository and OneDrive project directory.

To locate the containing directory without opening or editing the database:

1. Open the application.
2. In Windows, navigate to `%APPDATA%`.
3. Locate the Debt Tracker application-data directory.

To reset development data, close Debt Tracker completely and first create a
manual backup from the Data management screen when the application can still be
opened. If the application cannot be opened, preserve the entire Debt Tracker
application-data directory by copying or moving it to a separate timestamped
temporary location before resetting. Start the application to create a new
migrated database. Retain the preserved directory until the reset has been
verified. Do not edit the SQLite file manually.

Automated tests never use this location. Vitest creates databases under the
operating-system temporary directory, and Playwright supplies a unique temporary
Electron user-data directory that it removes after the workflow.

## Debt Maintenance Rules

- Original principal and origination date are opening facts.
- The user-facing workflow is single-user and does not ask for Owner/Entity.
  Existing owner/entity data is preserved internally for database compatibility.
- Effective-dated debt terms are authoritative for required payment and payment
  frequency. Debt-level opening payment fields remain only for compatibility with
  existing migrations and records.
- Student, medical, and tax debt types are no longer offered for new manual
  debts. Existing records using those legacy types remain readable and require
  deliberate conversion.
- Later rate, required-payment, frequency, day-count, or calculation changes
  require a new effective-dated term.
- A new term is appended after the latest term; an open prior term is closed on
  the day before the new effective date.
- Archive and restore preserve every term and create audit events.
- Permanent debt deletion is available only from a separated debt-detail Danger
  zone. It requires an immediately validated backup, exact debt-name entry, and a
  second irreversible-action confirmation before deleting the debt and dependent
  records atomically.
- Debt names and creditors are retained as separate internal fields but are
  presented together in primary navigation displays, for example
  `Generated Mortgage — Fictional Credit Union`.
- Debt cards show the application-calculated current principal balance as of the
  displayed effective date, plus the current effective interest rate and
  required payment. They do not label original principal or initial terms as
  current values.
- Normal debt detail emphasizes current principal balance, current effective
  rate and payment, debt type, origination date, maturity date, escrow balance
  when applicable, and status. Original principal, notes, collateral, purpose,
  audit timestamps, technical term history, and standalone confirmed snapshots
  remain preserved in the data model but are not part of the normal detail
  summary.
- Calculated debt balances use principal-related allocations and explicitly
  balance-affecting charges. Payment interest and escrow allocations do not
  reduce debt principal.
- Posted transactions and confirmed snapshots are recorded separately from future
  projected or scenario activity.
- Manual transaction entry uses one user-facing Transaction Date for both posting
  and accounting effect.
- Manual transaction amounts and allocations are entered as positive currency
  values. The application applies the stored accounting sign from the selected
  transaction type.
- For payments, principal is auto-calculated in the form as the payment amount
  remaining after interest, escrow, fees, and penalties. Nonprincipal
  allocations cannot exceed the payment amount.
- Editing an eligible posted transaction is presented as one Edit and Save
  workflow, but internally preserves the original transaction, posts an exact
  linked reversal, creates a corrected replacement, and marks affected current
  reconciliations for review when the corrected activity predates the statement
  date.
- Voiding an eligible posted transaction is presented as one Void action, but
  internally preserves the original transaction, posts an exact linked offset,
  marks the original voided, and removes the chain's current financial effect.
- Reversals require an explicit financial reversal date. The reversal affects
  balances and year-to-date activity only in the year containing that financial
  date, not the year when the reversal is entered.
- Principal allocation includes all principal paid, including additional
  principal. Escrow deposits and disbursements are tracked separately and do not
  change mortgage principal.
- Reversal transactions preserve the original posted row and its allocations.
- Refinance links preserve separate debts as separate legal obligations. A prior
  debt can be marked paid off or refinanced, linked to a replacement debt, and
  paid off through its own posted payment while the replacement debt keeps its
  own origination, principal, terms, rate, payment, and maturity.
- Malformed historical reversals whose allocations do not fully offset the
  original transaction are shown as data-integrity exceptions. The application
  warns that affected debt, escrow, and YTD amounts require review; it does not
  silently rewrite posted records.
- Statement balances, confirmed snapshots, ledger-calculated balances, and
  posted transactions are separate records.
- Approved reconciliation adjustments are explicit posted transactions linked to
  the reconciliation that approved them.

## Dashboard Rules

- Dashboard metrics exclude archived debts.
- Total active debt uses application-calculated ledger balances as of the
  displayed dashboard effective date and links to the Debts screen.
- Current escrow balance is displayed separately from debt principal balance.
  Its dashboard card links to an escrow detail view showing balances and posted
  escrow activity by applicable debt. That view can also record mortgage escrow
  activity without duplicating accounting logic from debt-detail transaction
  entry.
- Debt detail, dashboard, escrow detail, reports, and exports use the same
  current transaction-chain rule for escrow balances, including edited,
  superseded, reversed, voided, imported, and current posted activity.
- Normal Current activity lists show only current posted transactions that still
  control balances. Reversed originals, generated reversal rows, voided rows,
  superseded originals, and zero-effect chain members remain available through
  audit history instead of appearing as active activity.
- Escrow activity lists display signed balance impact: deposits and increasing
  adjustments are positive, while disbursements, refunds, and decreasing
  adjustments are negative. Running balances reconcile visible activity to the
  displayed current escrow balance.
- Year-to-date metrics use posted non-superseded activity from January 1 through
  the dashboard effective date based on transaction effective dates, not created,
  updated, import, audit, or system timestamps.
- Principal reduction counts negative principal allocations, including additional
  principal paid through the principal category. Legacy extra-principal
  allocations remain readable for existing records.
- New borrowings count posted borrowing and draw transaction totals.
- New borrowings YTD also includes opening principal for active debts originated
  during the displayed year. Opening principal is not double-counted when a
  same-date borrowing/draw transaction already represents the original borrowing.
- Interest activity is displayed as a positive expense amount. Internally,
  payment interest allocations are stored with the payment's negative sign and
  are netted with linked reversals before conversion for user-facing activity
  metrics.
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

## Advanced Reporting Rules

- Reports are read-only and do not edit debts, posted activity, snapshots,
  reconciliations, or scenarios.
- Current activity and escrow activity show newest current-effective rows first;
  reversed, voided, and superseded rows remain available through audit history.
- Balance reconciliation shows only the current reconciliation for each debt and
  statement date. A mismatched verified balance is rejected until the underlying
  transactions are corrected or voided.
- Report balances default to application-calculated ledger balances as of the
  stated effective date.
- Confirmed snapshots and saved scenario results are shown separately from
  calculated ledger balances.
- Rollforward, trend, balance-history, maturity, sensitivity, variance, and
  exception reports state their date range, effective date, balance basis, and
  assumptions.
- Filters support date range, debt, debt type, and status where relevant.
- Date-range presets support current year, prior year, current month, prior
  month, year to date, last 12 months, all activity, and custom date ranges.
- Report sections are collapsed by default and can be expanded independently.
- All activity and custom report ranges currently start no earlier than
  January 1, 2019. Older underlying records are preserved but excluded from
  report periods until a future configurable history-start date is approved.
- Monthly and annual rollforwards use the same borrowing basis as the dashboard:
  opening principal for debts originated in the period plus posted borrowing and
  draw transactions, with duplicate prevention for explicit same-date opening
  draws.
- Principal rollforwards use the equation Beginning principal + Borrowings -
  Principal reduction + Principal adjustments = Ending principal. Cash payments
  and interest are supplemental activity columns and do not drive principal
  balance movement.
- Debt balance history by obligation is shown as an interactive line chart with
  one line per debt and one total-debt line. It uses application-calculated
  ending principal balances by period, supports session-only legend toggles,
  chart-only mouse-wheel zoom, thresholded drag-to-pan without text selection,
  dynamic date ticks, and an accessible disclosure for chart data that is not
  displayed by default.
- Linked refinance debts can also appear under a shared financing-chain name in
  balance-trend reporting, while loan-level activity and balances remain
  separate. The refinance date is identified and rollforwards avoid
  double-counting payoff proceeds and replacement principal.
- Interest analysis separates monthly interest expense trends from annual
  interest comparisons. Monthly charts default to a recent readable period and
  support month-by-month comparison across years, bounded zoom, wheel zoom, and
  horizontal pan. Annual interest uses debt-source stacked bars with toggles.
  Interest expense is displayed as a positive amount and reconciles to the
  underlying report table.
- Interest-rate and extra-payment sensitivity reports reuse the payoff scenario
  engine and inherit its unsupported-term warnings.
- Actual-versus-plan variance uses saved payoff scenarios. Because saved
  scenarios currently do not persist period-by-period planned balances, variance
  detail is labeled as limited when planned reduction cannot be determined.
- Charts are restrained and paired with tabular detail.

## Backup, Restore, and Export Rules

- Manual and automatic backups are stored under the Electron user-data directory,
  outside this repository.
- Backups use SQLite's backup API rather than blindly copying an open database.
- A backup is reported successful only after SQLite integrity and foreign-key
  checks pass.
- Startup creates at most one successful automatic backup per local calendar day
  and retains automatic backups for five calendar days; manual and pre-restore
  backups are not automatically deleted.
- Restore is available only for listed local backup files, requires confirmation,
  validates the selected backup before restore, and reopens the database after
  replacement.
- Listed backups can be deleted with confirmation unless deletion would remove
  the only valid backup.
- Failed restore attempts are designed to leave the existing database usable.
- CSV exports are written to a user-selected directory outside the repository.
- Export files label actual, confirmed, calculated, and scenario values
  separately and omit audit-event detail.

## Windows Packaging Rules

- Packaging is Windows x64 only.
- The installer is generated with electron-builder and NSIS.
- better-sqlite3 is prepared for the configured Electron runtime before
  packaging and its native `.node` binary is unpacked from ASAR.
- Packaged artifacts exclude development databases, workbooks, test results,
  backups, exports, logs, and generated installers from application contents.
- Installed live data is stored beneath the Windows Electron user-data location,
  not under the source repository, OneDrive project directory, or installation
  directory.
- Backups are stored under the application user-data backup directory; exports
  are written only to a user-selected directory outside the repository.
- Uninstall does not delete user financial data or backups silently.
- Upgrades use the same app identifier and user-data location, so the existing
  database is preserved and migrated at startup.
- Startup diagnostics are written under user data with sanitized status fields.
  Migration failures include migration identifier, SQLite error code, sanitized
  message, and failing stage; raw database paths, financial values, and stack
  traces are not exposed to the renderer.

## Privacy

Use only generated or irreversibly sanitized data in source code, tests,
documentation, screenshots, and commits. Do not copy personal workbooks,
financial data, databases, exports, or backups into this repository.

## Documentation

- [`docs/data-dictionary.md`](docs/data-dictionary.md)
- [`docs/accounting-rules.md`](docs/accounting-rules.md)
- [`docs/decisions/`](docs/decisions/)
