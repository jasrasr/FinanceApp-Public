# Debt Tracker

Debt Tracker is a Windows-first, local, single-user Electron desktop application
for maintaining debts and supporting future debt-paydown analysis.

Version 1.6.0 adds a read-only Debt outlook screen for the next 12 calendar
months. It shows recorded required payments, optional saved-scenario extra
payments, monthly debt-service totals, payoff and effective-term events, and
drill-through monthly detail. Revolving-debt outlooks use recorded required
payments only; future purchases, draws, and changing statement minimums are
not forecast.

Version 1.8.0 adds a read-only Refinance analysis comparison for current versus
proposed replacement debt, including payoff, interest, cash-cost, break-even,
and chart results. It does not post or alter ledger activity.

The ledger also distinguishes credit-card purchases from borrowing draws and
supports atomic linked debt-to-debt balance transfers. Transfers affect source
and destination balances but are excluded from payment cash flow, principal-
paid, and new-borrowing totals.

Version 1.7.1 refines Interest analysis presentation with standard percentage
and dollar formatting and clearer freed-up-payment savings terminology. It does
not change calculations or ledger data.

Version 1.7.0 adds Interest analysis, which ranks active debts by current rate,
YTD interest, projected required-payment interest, portfolio share, and tested
$1,000 lump-sum or $100/month interest savings. Direct savings and interest saved
from freed-up payments are shown separately; the analysis is read-only and does not alter the
ledger or saved payoff scenarios.

## Release Status

Version 1.2.5 adds an engine-generated Required payments only comparison baseline
and corrects visible payoff chart scale selection. Version 1.2.4 refines saved payoff chart scaling, baseline visibility, and
horizon endpoints. Version 1.2.3 corrects saved payoff chart date domains and
principal-balance axes.
Version 1.2.2 refines saved payoff presentation and scenario naming while preserving
the extra-cash allocation corrections. Version 1.2.1 refines the extra-cash allocation analysis with explicit baseline,
rollover, custom-split, debt-level reconciliation, and payoff-horizon disclosures.
Version 1.2.0 builds on the first stable production release with scheduled
payment due-day tracking and occurrence-based unpaid upcoming-payment review. It is intended for
local, single-user debt tracking with entered debts, historical activity,
reconciliations, reports, backups, and payoff scenarios already validated through
generated-data test workflows.

Known non-blocking limitations:

- The Windows installer is unsigned, so Windows may show unknown-publisher or
  SmartScreen warnings.
- Workbook import remains retired from the normal product workflow; dormant
  legacy import tables are preserved only for compatibility.
- Actual-versus-plan variance remains deferred until saved payoff scenarios
  intentionally persist period-level baselines.
- Advanced tax analysis, cloud synchronization, multi-user access, and remote
  services are out of scope.

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
- Optional debt payment due-day configuration, next due-date display, and
  main-process scheduled-payment tracking that applies posted payments to the
  oldest eligible unpaid obligation. Any qualifying posted payment satisfies one
  scheduled obligation regardless of amount; required payments remain part of
  effective-dated terms and payoff calculations.
  Scheduling begins only at an explicitly reviewed scheduling start date; existing
  debts without that boundary are flagged for review.
- Manual posted activity entry for payments, draws, fees, penalties, interest,
  principal adjustments, mortgage escrow activity, reversals, and user-facing
  transaction edits implemented as linked superseding corrections.
- In-place mortgage refinance entry that preserves one continuous debt ID,
  effective-dated history, fee classification, and escrow separation.
- Statement-based balance reconciliation against the ledger balance calculated
  through the reconciliation date, including a supporting confirmed balance
  snapshot, automatic reconciliation status assignment, explicit approved
  adjustment postings, and void/supersede correction of incorrect
  reconciliations.
- Basic dashboard with active-debt totals, year-to-date posted activity metrics,
  unpaid past-due, due-today, and next-30-day scheduled payment dates, credit-card
  availability and utilization, current escrow balance,
  current-term payment and rate summaries, upcoming maturities, open
  reconciliation attention items, and drill-through navigation to debt,
  credit-card, and escrow detail.
- Saved payoff scenarios using baseline, debt avalanche, debt snowball, and
  custom-priority strategies, with plain-language strategy explanations,
  debt-name custom ordering, monthly extra-payment allocation schedules,
  comparison charts, rerun, and archive support.
- Extra-cash allocation analysis for lump sums and additional monthly payments
  across rate, balance, selected-debt, custom-priority, custom-split, and
  required-payment baseline approaches. Analysis is scenario-only until
  explicitly saved.
- Advanced read-only debt reports for rollforwards, balance history, activity
  trends, maturity and required-payment schedules, interest analysis, and
  reconciliation/data-quality exceptions.
- Data Health screen with per-debt reconciliation age, activity, scheduling,
  refinance, edited/voided transaction, expected-payment, and integrity review
  reasons. Rows are grouped as Current, Review, or Attention and open the debt
  detail screen when selected. Eligible reconciliation/balance rows can accept
  the current application-calculated balance as a control balance; this records
  an explicit non-lender-verified snapshot and does not change ledger activity.
- Debt Payoff Milestones section with tracking-to-date and year-to-date debt
  reduction, mortgage/nonmortgage progress, payoff and $10,000 milestone
  projections, interest metrics, credit utilization change, and visual actual
  balance, annual activity, and selected-scenario comparison charts. The next
  balance milestone is shown as a target balance and dollars remaining; credit
  utilization shows the current value alongside the prior-year comparison.
- Debt outlook screen with a 12-month required-payment and optional
  payoff-scenario extra-payment chart, monthly payment detail, scheduling
  warnings, projected payoff events, maturities, rate/payment changes, and
  refinance events. The outlook is read-only and does not alter saved
  scenarios or the actual ledger.
- Interest-cost concentration analysis with baseline interest rankings,
  portfolio-share charts, individually tested lump-sum and monthly savings,
  direct-versus-freed-up-payment savings disclosures, and debt-type/portfolio
  segment filters.
- Debt-history charts provide bounded wheel zoom and drag pan. Interest charts
  provide readable month/year labels, dynamic currency ticks, immediate compact
  hover details, and reconciled annual debt-source interest totals.
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
mortgage payment/reversal behavior, in-place refinance entry, reconciliation
correction, manual debt entry, backup, restore, export, same-path
reinstall/upgrade preservation, and user-data survival after uninstall, then
removes the generated temporary test data.
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
- Record refinance keeps one continuous debt record. It closes the prior
  effective-dated term, creates a new term on the refinance date, posts only the
  net principal adjustment between the calculated pre-refinance balance and the
  new refinanced principal, and stores financed fees, cash-paid fees, and escrow
  handling separately.
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
- Rollforward, trend, balance-history, maturity, interest, and exception reports
  state their date range, effective date, balance basis, and assumptions.
- Filters support date range, debt, debt type, and status where relevant.
- Active report filters and practical display state are preserved for the
  current application session. Reset Filters returns the screen to defaults.
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
- In-place refinance events remain on the same debt line and can be marked in
  balance-trend reporting. Rollforwards show only the net refinance principal
  adjustment, not the full refinanced principal as a new borrowing.
- Interest analysis shows monthly interest expense by month and year, plus
  annual interest comparisons. The monthly chart uses the full selected report
  range, groups yearly bars under all twelve month labels, and keeps year colors
  stable and distinct. Annual interest uses debt-source stacked bars with
  toggles. Interest expense is displayed as a positive amount and reconciles to
  the underlying report table.
- Interest-rate sensitivity and actual-versus-plan variance are not shown on the
  normal Reports screen. Actual-versus-plan analysis is deferred until saved
  scenario period-level baselines are intentionally supported.
- Extra-payment comparison is handled through the payoff scenario workflow so
  allocation, warnings, and payoff order remain tied to the payoff engine.
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
- Version 1.3.0 adds Data Management data locations. The live database remains
  in local application data; backup and export folders may be OneDrive folders.
  Existing backups can be copied and validated before the old location is
  removed, and validated backups can be imported from OneDrive, USB, or another
  folder without modifying the source file.
- Backups move work between computers, but separate copies do not merge. Create
  a backup, allow OneDrive to sync, restore it on the other computer, and then
  continue working there.
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
