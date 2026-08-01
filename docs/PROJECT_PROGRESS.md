# Project Progress

This document is a concise chronological handoff log for future developers and
AI assistants. It summarizes completed implementation phases using repository
history, documentation, ADRs, migrations, and implemented code.

Version tracking note: application-version progress tracking was added after
phase seven on 2026-07-28. The current application version is `0.17.0`. Earlier
phase entries did not record an application version at the time they were
completed.

## Phase 1: Application Foundation

- Completion date: 2026-07-27
- Features implemented:
  - Secure local Electron desktop shell titled Debt Tracker.
  - React, TypeScript, Vite, Tailwind CSS, ESLint, Prettier, Vitest, React
    Testing Library, and Playwright foundation.
  - Basic application shell with placeholder home screen and empty navigation.
- Material architecture and accounting decisions:
  - Windows-first, local-only, single-user Electron application.
  - Sandboxed renderer with context isolation, Node integration disabled, and no
    direct renderer access to Node, filesystem, database, or raw Electron APIs.
  - Generated or sanitized test data only.
- Database schema or migration changes:
  - No application financial schema in this phase.
- New or changed IPC operations:
  - Minimal typed preload bridge with no financial or filesystem functionality.
- New UI screens or workflows:
  - Blank application shell and placeholder home screen.
- Validation and smoke-test results:
  - Foundation scripts were configured for development, formatting, linting,
    type checking, unit tests, and production build.
  - Basic render test verifies the shell.
- Known limitations and technical debt:
  - No debt management, database, imports, reports, packaging, or financial
    calculations.
- Recommended next phase:
  - Phase 2: Core database schema and migrations.

## Phase 2: Core Database Schema and Migrations

- Completion date: 2026-07-27
- Features implemented:
  - SQLite database foundation using better-sqlite3 and Drizzle ORM.
  - Drizzle migration workflow and temporary database test utilities.
  - Pure accounting helpers for money, rates, financial dates, transaction
    allocation reconciliation, reconciliation differences, and sign convention.
- Material architecture and accounting decisions:
  - Only the Electron main process may access SQLite.
  - Live database belongs under Electron user-data, outside the repository and
    OneDrive project directory.
  - Tests use isolated temporary databases only.
  - Money is stored as integer cents.
  - Interest rates are stored as integer millionths of the decimal annual rate.
  - Financial dates use `YYYY-MM-DD`; timestamps use UTC strings ending in `Z`.
  - Debt balances are positive obligations; posted ledger activity is actual
    only.
  - Posted financial transactions are corrected through reversals or
    superseding records rather than silent deletion or mutation.
- Database schema or migration changes:
  - Added `drizzle/0000_initial-core-schema.sql`.
  - Created `debts`, `debt_terms`, `debt_transactions`,
    `transaction_allocations`, `balance_snapshots`, `balance_reconciliations`,
    and `audit_events`.
  - Added foreign keys, check constraints, uniqueness constraints, and indexes
    documented in `docs/data-dictionary.md`.
- New or changed IPC operations:
  - No financial IPC operations beyond the secure foundation.
- New UI screens or workflows:
  - No new user-facing debt workflow.
- Validation and smoke-test results:
  - Database integration tests verify migrations, foreign-key enforcement,
    accounting helper behavior, reversals, effective dating, and test isolation.
  - `db:check` verifies migrated temporary databases and schema integrity.
- Known limitations and technical debt:
  - No manual data-entry UI yet.
  - No import, projection, reporting, backup, restore, export, or packaging.
- Recommended next phase:
  - Phase 3: Manual debt-entry workflow.

## Phase 3: Manual Debt-Entry Workflow

- Completion date: 2026-07-27
- Features implemented:
  - Active debt list.
  - Create debt with initial effective-dated term.
  - Debt detail screen.
  - Descriptive/admin debt updates.
  - Add new effective-dated term periods.
  - Archive and restore debts without permanent deletion.
  - Audit events for debt creation, updates, terms, archive, and restore.
- Material architecture and accounting decisions:
  - Renderer uses typed DTOs only.
  - IPC handlers remain narrow and delegate business rules to main-process
    services.
  - Debt and initial term are created atomically.
  - Historical debt terms are preserved; material term changes create new
    effective-dated records.
  - Original principal is not labeled or treated as current balance.
- Database schema or migration changes:
  - Used the phase-two schema; no new migration documented for this phase.
- New or changed IPC operations:
  - Added typed debt-maintenance operations including list, get, create, update,
    add term, archive, and restore.
- New UI screens or workflows:
  - Debt list, create-debt form, debt detail, edit-debt form, add-term form, and
    archive/restore confirmations.
- Validation and smoke-test results:
  - Tests cover empty states, form rendering, validation failures, atomic
    creation, service retrieval, archive/restore behavior, audit events,
    historical term preservation, overlap rejection, IPC validation, trusted
    sender checks, renderer sandbox boundaries, and development database
    location behavior.
  - Electron E2E workflow covers manual debt maintenance.
- Known limitations and technical debt:
  - No payment, borrowing, snapshot, reconciliation, dashboard, workbook import,
    projection, reporting, backup, export, or packaging workflows.
- Recommended next phase:
  - Phase 4: Manual payment, borrowing, and balance-snapshot workflow.

## Phase 4: Manual Payment, Borrowing, and Balance-Snapshot Workflow

- Completion date: 2026-07-27
- Features implemented:
  - Manual posted debt transactions.
  - Transaction allocations for principal, interest, escrow, fees, penalties,
    extra principal, and other.
  - Confirmed balance snapshots.
  - Transaction reversals that preserve original posted activity.
  - Audit events for posted activity, snapshots, and reversals.
- Material architecture and accounting decisions:
  - Preserved the unified posted transaction ledger.
  - Actual posted activity remains separate from projections and scenarios.
  - Transaction totals and allocations follow the documented signed obligation
    convention and must reconcile exactly.
  - Confirmed snapshots are external evidence and do not overwrite ledger
    activity.
- Database schema or migration changes:
  - Used existing ledger, allocation, snapshot, and audit tables from phase two.
  - No separate payment or borrowing tables were introduced.
- New or changed IPC operations:
  - Added typed operations for creating debt transactions, reversing
    transactions, and creating balance snapshots.
- New UI screens or workflows:
  - Record transaction form.
  - Record balance snapshot form.
  - Transaction display and reversal confirmation in debt detail.
- Validation and smoke-test results:
  - Tests cover sign convention, allocation totals, effective dates, posted
    statuses, reversals, audit events, renderer bridge restrictions, and
    temporary database isolation.
  - Electron E2E workflow covers transaction entry, snapshot entry, and reversal.
- Known limitations and technical debt:
  - No balance reconciliation screen yet.
  - No authoritative rolling current-balance display beyond tested ledger logic
    used later for reconciliations and dashboard metrics.
  - No import posting, projections, reports, backups, exports, or packaging.
- Recommended next phase:
  - Phase 5: Balance reconciliation workflow.

## Phase 5: Balance Reconciliation Workflow

- Completion date: 2026-07-28
- Features implemented:
  - Statement-based balance reconciliations.
  - Application-calculated ledger balance through the statement date.
  - Calculated reconciliation difference.
  - Reconciliation statuses for unreconciled, in progress, reconciled,
    reconciled with approved adjustment, and exception.
  - Explicit approved reconciliation adjustments posted as linked ledger
    transactions.
  - Reconciliation history and audit events.
- Material architecture and accounting decisions:
  - Reconciliation difference is calculated, not manually entered.
  - Statement balances, confirmed snapshots, calculated ledger balances, and
    posted transactions remain distinct.
  - Approved adjustments are explicit, linked, traceable posted transactions.
  - Reconciliation does not silently overwrite ledger activity or snapshots.
- Database schema or migration changes:
  - Used existing `balance_reconciliations`, `debt_transactions`,
    `transaction_allocations`, and `audit_events` tables.
  - Database check constraint requires stored difference to equal statement
    balance less application-calculated balance.
- New or changed IPC operations:
  - Added typed operation for creating balance reconciliations.
- New UI screens or workflows:
  - Record balance reconciliation form.
  - Reconciliation display in debt detail.
  - Approved adjustment entry within reconciliation workflow.
- Validation and smoke-test results:
  - Tests cover calculated differences, status rules, approved adjustment
    requirements, ledger balance through statement date, audit events, and IPC
    validation.
  - Electron E2E workflow covers recording a reconciliation.
- Known limitations and technical debt:
  - No dashboard yet.
  - No workbook import, projections, reports, backups, exports, or packaging.
- Recommended next phase:
  - Phase 6: Basic dashboard.

## Phase 6: Basic Dashboard

- Completion date: 2026-07-28
- Features implemented:
  - Dashboard with active-debt summary cards and attention sections.
  - Total active debt as of a stated effective date.
  - Principal reduction year to date.
  - New borrowings year to date.
  - Interest activity year to date.
  - Required monthly payments from current effective terms.
  - Weighted-average interest rate.
  - Upcoming maturities and reconciliation attention items.
  - Drill-through links to debt detail where practical.
- Material architecture and accounting decisions:
  - Dashboard excludes archived debts.
  - Default dashboard balance uses application-calculated ledger balances; it is
    not a confirmed snapshot, original principal, projected balance, or scenario
    balance.
  - Year-to-date metrics use posted non-superseded actual activity.
  - Required payments are normalized to monthly equivalents; irregular and
    other frequencies are excluded.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - Added typed `getDashboard` operation on fixed `debt:dashboard` channel.
  - Preload bridge advanced to version 5.
- New UI screens or workflows:
  - Dashboard became the initial view with concise cards, upcoming maturities,
    and attention items.
- Validation and smoke-test results:
  - Tests cover dashboard empty state, active-debt calculations, YTD metrics,
    maturity and attention item selection, renderer rendering, bridge exposure,
    and IPC registration.
  - Electron E2E workflow covers dashboard display after manual activity.
- Known limitations and technical debt:
  - No charts were added.
  - No payoff projections, debt-free-date forecasts, refinance analysis,
    advanced reports, backups, exports, packaging, or workbook import posting.
- Recommended next phase:
  - Phase 7: Workbook import staging and mapping.

## Phase 7: Workbook Import Staging and Mapping

- Completion date: 2026-07-28
- Features implemented:
  - `.xlsx` workbook selection through an Electron main-process file dialog.
  - Workbook staging into import batches, sheet mappings, and staged rows.
  - Source workbook name, fingerprint, sheet, row, cell references, displayed
    values, formulas, and timestamps preserved as provenance.
  - Detection of likely debts, transactions, terms, balance snapshots, and
    unknown records.
  - Review UI for import batches, sheet mappings, staged rows, control totals,
    duplicate candidates, invalid rows, ambiguous actual-versus-projected rows,
    and reconciliation exceptions.
  - Review-only approve, reject, and defer states for mappings and rows.
  - Import audit events.
- Material architecture and accounting decisions:
  - Workbook import is staging-only and does not post to live financial tables.
  - Source workbook values remain separate from normalized proposed values.
  - Ambiguous actual-versus-projected rows cannot be approved silently.
  - Workbook formulas are preserved as source metadata only and are not
    translated into application calculation logic.
  - The parser is main-process-only and avoids a vulnerable production workbook
    parsing dependency.
- Database schema or migration changes:
  - Added `drizzle/0001_aberrant_the_santerians.sql`.
  - Added `import_batches`, `import_sheet_mappings`, and `staged_import_rows`
    with review statuses, provenance fields, constraints, indexes, and foreign
    keys.
- New or changed IPC operations:
  - Added typed import operations:
    - `selectWorkbookForImport`
    - `listImportBatches`
    - `getImportBatch`
    - `updateImportSheetMapping`
    - `updateStagedImportRowReview`
  - Preload bridge advanced to version 6.
- New UI screens or workflows:
  - Workbook import navigation item.
  - Import batch list.
  - Sheet mapping review table.
  - Staged row review table and control totals.
- Validation and smoke-test results:
  - Tests cover generated fictional workbook staging, formula preservation,
    ambiguous classification, review updates, audit events, no posting to live
    ledger tables, IPC validation, and renderer import review states.
  - `npm audit --omit=dev` reports no production vulnerabilities in the
    committed dependency set.
  - Electron E2E workflow covers the import screen empty state.
- Known limitations and technical debt:
  - Only `.xlsx` workbooks are supported.
  - Detection is heuristic and conservative.
  - Import approval is review-only; no staged row can be posted yet.
  - No payoff projections, advanced reports, backups, exports, or packaging.
- Recommended next phase:
  - Phase 8: Reviewed workbook import posting.

## Phase 8: Reviewed Workbook Import Posting

- Completion date: 2026-07-28
- Application version: 0.8.0
- Features implemented:
  - Preview of approved staged workbook rows eligible for posting.
  - Explicit confirmed posting of approved actual rows into debts, debt terms,
    posted transactions, transaction allocations, and balance snapshots.
  - Posting results showing which live records were created from each staged row.
  - Safe retry behavior for closed posted batches.
  - Import posting audit events.
- Material architecture and accounting decisions:
  - Posting is all-or-nothing for a batch.
  - Staged rows require approved mappings, approved row review, actual
    classification, and no unresolved validation, duplicate, or reconciliation
    exception flags.
  - Import posting does not create reconciliations.
  - Original workbook displayed values and formulas remain in staging; live
    financial records contain normalized application values.
- Database schema or migration changes:
  - Added `drizzle/0002_foamy_betty_ross.sql`.
  - Added `import_postings` to link each created live record back to the import
    batch and staged row.
- New or changed IPC operations:
  - Added typed `previewImportBatchPosting`.
  - Added typed `postImportBatch`.
  - Preload bridge advanced to version 8.
- New UI screens or workflows:
  - Posting preview panel on the workbook import screen.
  - Explicit post-approved-rows action with disabled states for exceptions,
    empty posting sets, and already-posted batches.
  - Posting-result display showing created live records by source row.
- Validation and smoke-test results:
  - Integration tests cover successful reviewed posting with provenance, safe
    retry without duplicates, and rollback on failed batch posting.
  - Database migration tests and database check include `import_postings`.
- Known limitations and technical debt:
  - Posting requires normalized fields to be present on approved staged rows; the
    UI does not yet provide full inline normalized-field editing.
  - Posting remains conservative and does not resolve duplicate candidates or
    reconciliation exceptions automatically.
  - No payoff projections, advanced reports, backups, exports, or packaging.
- Recommended next phase:
  - Phase 9: Projection and payoff engine.

## Phase 9: Projection and Payoff Engine

- Completion date: 2026-07-28
- Application version: 0.9.0
- Features implemented:
  - Saved payoff scenarios for baseline, debt avalanche, debt snowball, and
    custom priority strategies.
  - User-defined extra monthly payment.
  - Scenario viewing, rerun, and archive behavior.
  - Projected payoff date, total projected interest, monthly cash requirement,
    and interest savings versus baseline.
  - Displayed assumptions, effective dates, engine version, warnings, and
    per-debt projected results.
- Material architecture and accounting decisions:
  - Scenario results are separate from posted actual activity.
  - Scenario starting balances use application-calculated ledger balances as of
    an explicit scenario start date.
  - Effective-dated debt terms are selected for each projection month.
  - Calculation engine version is `payoff-engine-v2`.
  - Engine supports monthly interest, explicit zero-interest obligations, and
    actual/360 or actual/365 simple daily interest where term data is sufficient.
  - Variable-rate debts require explicit scenario assumptions; otherwise they
    are marked unsupported.
  - Revolving debts assume no future draws.
  - Balloon maturities are enforced, and remaining balances at maturity are
    marked unsupported without an explicit balloon-payment assumption.
  - Irregular schedules and unsupported day-count or calculation conventions are
    excluded from reliable scenario totals with debt-level and scenario-level
    warnings.
- Database schema or migration changes:
  - Added `drizzle/0003_peaceful_ghost_rider.sql`.
  - Added `payoff_scenarios` with saved assumptions, result JSON, calculation
    engine version, active/archive status, and timestamps.
- New or changed IPC operations:
  - Added typed payoff scenario operations:
    - `listPayoffScenarios`
    - `getPayoffScenario`
    - `createPayoffScenario`
    - `rerunPayoffScenario`
    - `archivePayoffScenario`
  - Preload bridge advanced to version 9.
- New UI screens or workflows:
  - Payoff scenarios navigation item.
  - Scenario creation form.
  - Saved scenario list with assumption and debt-result details.
  - Rerun and archive actions.
- Validation and smoke-test results:
  - Added pure projection-engine tests for payoff savings, strategy behavior,
    daily-interest calculations, zero-interest debt, variable-rate assumptions,
    balloon maturity, insufficient payments, and unsupported irregular schedules.
  - Added service integration tests for saved scenarios, rerun, archive, audit
    events, and no projected ledger writes.
  - Added renderer and IPC tests for payoff scenario workflow and validation.
- Known limitations and technical debt:
  - Engine supports only documented monthly and simple daily conventions, not
    lender-specific amortization.
  - Custom-priority UI currently accepts debt IDs rather than a drag-and-drop
    ordered debt list.
  - Variable-rate overrides are supported in the service contract but not yet
    exposed as per-debt UI fields.
  - Explicit balloon-payment assumptions, irregular payment schedules, tax
    effects, refinance analysis, and advanced reports are not implemented.
- Recommended next phase:
  - Phase 10: Advanced reports.

## Phase 10: Advanced Debt Reporting

- Completion date: 2026-07-28
- Application version: 0.10.0
- Features implemented:
  - Advanced read-only reports for monthly and annual debt rollforwards, debt
    balance history, posted activity trends, maturity and required-payment
    schedules, interest-rate sensitivity, extra-payment sensitivity,
    actual-versus-plan variance, and reconciliation/data-quality exceptions.
  - Report filters for date range, debt, owner/entity, debt type, and status
    where relevant.
  - Drill-through from report debt rows to debt detail where practical.
  - Restrained principal-reduction chart paired with accessible tabular detail.
- Material architecture and accounting decisions:
  - Reports are computed in the Electron main process and exposed through a
    single narrow typed bridge operation.
  - Report balances use application-calculated ledger balances by default and
    label confirmed snapshots and scenario results separately.
  - Sensitivity reports reuse the payoff scenario engine rather than duplicating
    projection logic.
  - Actual-versus-plan variance is labeled as limited when saved scenarios do
    not contain period-by-period planned balances.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - Added typed `getDebtReports` operation on fixed `debt:reports` channel.
  - Preload bridge advanced to version 10.
- New UI screens or workflows:
  - Added Reports navigation item and advanced debt reporting screen.
  - Added report filter controls, report basis labels, report tables, exception
    section, and drill-through buttons.
- Validation and smoke-test results:
  - Added service integration coverage for report calculations, labeled
    balances, reconciliation exceptions, sensitivity rows, and limited
    actual-versus-plan variance.
  - Added renderer, preload bridge, and IPC tests for report display and
    contract validation.
  - Manual smoke-test status is recorded in the phase-ten completion report.
- Known limitations and technical debt:
  - Reports are computed live and are not persisted report snapshots.
  - Actual-versus-plan reporting remains limited until scenarios persist
    period-by-period plan balances.
  - Charts remain intentionally minimal.
- Recommended next phase:
  - Phase 11: Backup, restore, and data export.

## Phase 11: Backup, Restore, and Data Export

- Completion date: 2026-07-28
- Application version: 0.11.0
- Features implemented:
  - Manual validated SQLite database backups.
  - Automatic rotating startup backups.
  - Restore from listed validated local backups with confirmation.
  - Pre-restore safety backup creation.
  - CSV export of debts, terms, posted transactions, allocations, snapshots,
    reconciliations, scenarios, dashboard data, and advanced report data.
  - Data Management screen showing backup status, available backups, restore
    controls, and export options.
- Material architecture and accounting decisions:
  - Backup, restore, and export run only in the Electron main process.
  - Backups use SQLite's backup API and integrity validation rather than copying
    an open database blindly.
  - Restore validates backups before replacement and records non-sensitive audit
    events.
  - Exports label actual, confirmed, calculated, scenario, and exception values
    separately.
  - Export files omit audit-event detail and are not import sources.
- Database schema or migration changes:
  - No schema or migration changes.
  - Existing `audit_events` records backup, restore, failed-restore, and export
    events.
- New or changed IPC operations:
  - Added typed data-management operations:
    - `getDataManagementStatus`
    - `createManualBackup`
    - `restoreBackup`
    - `exportData`
  - Preload bridge advanced to version 11.
- New UI screens or workflows:
  - Added Data Management navigation item.
  - Added backup status cards, backup table, manual backup action, restore
    action, refresh action, and CSV export action.
- Validation and smoke-test results:
  - Added integration tests for backup validation, restore with safety backup,
    and labeled CSV export.
  - Added renderer, preload bridge, IPC, and Electron E2E coverage for
    data-management access and manual backup.
  - Final validation is recorded in the phase-eleven completion report.
- Known limitations and technical debt:
  - Automatic backups currently run at startup and retain the ten newest
    automatic backups.
  - CSV export is one-way; exported files are not supported import sources.
  - No cloud storage, encryption-key management, or installer packaging.
- Recommended next phase:
  - Packaging and installer preparation when explicitly approved.

## Phase 12: Windows Packaging and Production Readiness

- Completion date: 2026-07-28
- Application version: 0.12.0
- Features implemented:
  - Windows x64 NSIS installer configuration through electron-builder.
  - Generated application icon asset and installer metadata.
  - Electron-compatible better-sqlite3 native-module preparation before
    packaging, with the native binary unpacked from ASAR.
  - Packaged/installed application smoke workflow for launch, database
    creation, manual debt entry, backup, restore, export, same-path
    reinstall/upgrade preservation, and user-data survival after uninstall.
  - Sanitized startup diagnostics written under the Windows user-data directory.
- Material architecture and accounting decisions:
  - The installed app remains local-only and does not depend on Node, npm, VS
    Code, or the source repository at runtime.
  - Production database, backups, diagnostics, and exports remain outside the
    repository and installation directory.
  - Uninstall does not silently remove financial data or backups.
  - Packaging does not change accounting calculations, posting rules,
    reconciliation rules, or backup/restore semantics.
- Database schema or migration changes:
  - No schema or migration changes.
  - Existing migrations are packaged and applied at startup to preserve upgrade
    behavior.
- New or changed IPC operations:
  - No new IPC operations.
  - Existing data-management and debt-maintenance operations are exercised in
    the packaged smoke workflow.
- New UI screens or workflows:
  - No new financial UI workflow.
  - Installed application displays the existing version and last-changed footer.
- Validation and smoke-test results:
  - Added startup diagnostics tests.
  - Added installed packaged-app smoke tests covering launch, database creation,
    debt entry, backup, restore, export, same-path reinstall/upgrade
    preservation, and uninstall user-data preservation.
- Known limitations and technical debt:
  - Installer is unsigned; Windows may show SmartScreen or unknown-publisher
    warnings.
  - Auto-update, code signing, Mac/Linux packaging, and cloud synchronization are
    intentionally out of scope.
- Recommended next phase:
  - Production hardening should focus on signing strategy, upgrade regression
    matrices, and release-process documentation only after explicit approval.

## Phase 13: First User-Acceptance Corrections and Workflow Simplification

- Completion date: 2026-07-28
- Application version: 0.13.0
- Features implemented:
  - Removed Owner/Entity from normal user-facing forms, debt cards, debt detail,
    report filters, and exports while preserving the underlying compatibility
    field.
  - Removed student, medical, and tax debt types from new manual-entry choices;
    existing records using legacy types remain readable and require deliberate
    conversion.
  - Simplified debt creation so effective-dated terms are authoritative for
    required payment and payment frequency.
  - Simplified manual transaction entry to one Transaction Date, optional
    description, internal manual source defaults, and principal/interest/escrow/
    fee/penalty allocations.
  - Added mortgage escrow tracking with escrow deposits, disbursements,
    adjustments, refunds, and a separately displayed calculated escrow balance.
  - Replaced the separate user-facing snapshot action with a combined Reconcile
    Balance workflow that records a supporting confirmed snapshot and a
    reconciliation record.
  - Made debt-list rows clickable while preserving keyboard activation.
  - Fixed navigation highlighting so only the active section is highlighted.
  - Collapsed advanced report sections by default with independently expandable
    detail.
- Material architecture and accounting decisions:
  - No destructive migration was used to remove Owner/Entity; compatibility data
    remains in the database and service DTOs where needed.
  - Debt-level payment/frequency columns remain for compatibility but are
    populated from the initial effective-dated term for new manual debts.
  - Escrow activity is posted in the unified ledger but excluded from
    debt-principal balance calculations and tracked as a separate calculated
    escrow balance.
  - Principal allocation now includes all principal paid, including additional
    principal, for user-facing entry. Legacy extra-principal rows remain
    readable.
  - Manual transaction date is used as both effective and posting date.
  - Reconciliations create supporting snapshots transactionally and do not
    overwrite ledger activity.
- Database schema or migration changes:
  - Added a migration updating the posted transaction type constraint to allow
    `escrow_disbursement`, `escrow_adjustment`, and `escrow_refund`.
  - No debt table columns were removed.
- New or changed IPC operations:
  - Bridge contract version increased to 12.
  - Existing narrow debt-maintenance operations were retained; response DTOs now
    include `calculatedEscrowBalance`.
  - No generic IPC, raw SQL, filesystem, or database access was exposed to the
    renderer.
- New UI screens or workflows:
  - Simplified create/edit debt workflow.
  - Simplified transaction form.
  - Combined Reconcile Balance workflow.
  - Full-row debt-card opening.
  - Collapsed advanced-report sections.
- Validation and smoke-test results:
  - Unit and integration tests were updated for simplified transaction entry,
    escrow posting, combined reconciliation snapshots, clickable debt rows, and
    collapsed report sections.
  - Final full validation and Electron smoke-test results should be recorded in
    the completion report for this phase.
- Known limitations and technical debt:
  - Legacy owner/entity and extra-principal/other fields remain in the database
    for compatibility and import history.
  - Existing records with removed debt types are readable but require deliberate
    conversion through supported maintenance flows.
  - The separate snapshot component remains in source only for compatibility
    until unused code cleanup is explicitly approved.
- Recommended next phase:
  - Use the simplified workflows in user acceptance testing before deciding on
    production hardening, release signing, or targeted cleanup.

## Phase 13 Patch: Positive Transaction Entry

- Completion date: 2026-07-28
- Application version: 0.13.1
- Features implemented:
  - Manual transaction amount and allocation inputs now accept positive currency
    values only.
  - The main-process service applies ledger signs from the selected transaction
    type before repository validation and persistence.
  - Transaction history displays positive user-facing amounts, with direction
    communicated by transaction type.
- Material architecture and accounting decisions:
  - Stored ledger signs remain unchanged for compatibility and accounting
    integrity.
  - Payments persist as negative ledger activity. Draws, fees, interest charges,
    escrow disbursements, escrow refunds, escrow adjustments, principal
    adjustments, and other manual activity persist as positive ledger activity.
  - Reversals remain generated from posted transactions and preserve exact
    offsetting signs internally.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - No new IPC operations.
  - Bridge contract version increased to 13.
  - Existing transaction DTO fields are retained; input semantics changed to
    positive user-entered amounts for manual transaction entry.
- New UI screens or workflows:
  - Transaction-entry amount label simplified to `Amount`.
  - Allocation guidance now states that positive allocation amounts must equal
    the positive entered amount before sign conversion.
- Validation and smoke-test results:
  - Regression tests cover positive-entry payments, draws, fees, escrow deposits,
    escrow disbursements, escrow refunds, and reversals.
  - Final validation and Electron smoke-test results should be recorded in the
    completion report for this patch.
- Known limitations and technical debt:
  - Reconciliation approved adjustments remain signed because they must equal a
    calculated signed reconciliation difference.
- Recommended next phase:
  - Continue user acceptance testing of manual entry before broader cleanup.

## Phase 14: Accounting Correction and Usability Acceptance Fixes

- Completion date: 2026-07-28
- Application version: 0.14.0
- Features implemented:
  - Corrected debt-balance calculations so payments reduce debt only by
    principal-related allocations.
  - Corrected dashboard and report year-to-date metrics so only current-year
    activity is included.
  - Displayed user-facing interest activity as a positive expense amount.
  - Replaced original principal on collapsed debt cards with calculated current
    balance as of the displayed effective date.
  - Added total current escrow balance to the dashboard and escrow balance
    visibility on debt list/detail.
  - Simplified normal reconciliation entry by automatically assigning status
    from the calculated difference and approved adjustment.
  - Added a discoverable Record escrow activity action and escrow activity
    history on mortgage debt detail.
  - Added report date-range presets.
- Material architecture and accounting decisions:
  - Ledger balance calculations now use allocation-level treatment rather than
    full transaction totals.
  - Payment interest and escrow allocations do not reduce principal.
  - Interest allocations affect debt balance only when posted as interest-charge
    transactions.
  - Escrow deposits, disbursements, refunds, adjustments, and reversals affect a
    separate escrow balance.
  - Normal reconciliation statuses are service-assigned rather than user-picked.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - No new IPC operations.
  - Bridge contract version increased to 14 because debt summary, dashboard, and
    reconciliation response semantics changed.
- New UI screens or workflows:
  - Debt cards now show current calculated balance and effective date.
  - Dashboard now includes current escrow balance and escrow drill-through rows.
  - Debt detail now includes escrow activity history and a mortgage escrow action.
  - Reconciliation form now requires only reconciliation date, verified lender
    balance, and optional approved adjustment action.
  - Reports now include date-range presets.
- Validation and smoke-test results:
  - Regression coverage was added for allocation-based principal balance,
    current-year YTD filtering, positive interest display, automatic
    reconciliation status, escrow disbursement behavior, and report presets.
  - Final validation and packaged smoke-test results are recorded in the
    completion report for this phase.
- Known limitations and technical debt:
  - Legacy extra-principal allocation rows remain readable for compatibility.
  - Escrow activity uses the existing transaction-entry path with clearer
    mortgage detail entry points rather than a separate specialized posting
    service.
  - Reconciliation approved adjustments still use signed internal values because
    they must equal a calculated signed reconciliation difference.
- Recommended next phase:
  - Continue focused user acceptance testing before deciding whether to pursue
    release signing, cleanup of legacy compatibility UI/code, or production
    release-process hardening.

## Phase 15: Data-Integrity Repair for Historical Dates, Reversals, and Reconciliation Correction

- Completion date: 2026-07-29
- Application version: 0.15.0
- Features implemented:
  - Reproduced the installed-app historical-payment workflow with generated
    fictional data before implementation.
  - Added explicit financial reversal date entry.
  - Corrected dashboard and report YTD metrics to use transaction effective
    dates and net linked reversal activity.
  - Corrected escrow balance calculations for reversal rows in repository-backed
    dashboard calculations.
  - Added reconciliation lifecycle support for current, superseded, and voided
    records.
  - Added same-date reconciliation correction by superseding the current
    reconciliation and creating a corrected current reconciliation.
  - Removed itemized dashboard escrow-balance rows while preserving the summary
    card and debt-detail escrow history.
  - Added minimum malformed-reversal detection so incomplete reversal allocation
    offsets appear as data-integrity exceptions without rewriting posted rows.
  - Documented a safe manual development-data reset procedure that requires the
    application to be closed and backups or preserved user-data copies first.
- Material architecture and accounting decisions:
  - YTD metrics use financial effective dates only, not created, updated, import,
    audit, or system timestamps.
  - Payment principal reduction is limited to payment activity and linked
    reversals; borrowings remain in borrowing metrics.
  - Interest activity is netted internally and displayed as a positive expense.
  - Reconciliation correction is lifecycle-based and preserves historical rows.
  - Malformed reversal handling is read-only detection and warning in this phase;
    explicit corrective posting remains a future workflow.
- Database schema or migration changes:
  - Added `drizzle/0005_large_omega_sentinel.sql`.
  - Added reconciliation lifecycle and supersede/void metadata columns.
  - Changed current reconciliation uniqueness to a partial unique index for
    current debt/date rows.
  - Adjusted balance-snapshot uniqueness to include source reference so corrected
    reconciliation evidence can be preserved separately.
- New or changed IPC operations:
  - Added typed `voidBalanceReconciliation`.
  - Changed `reverseDebtTransaction` request contract to require `reversalDate`.
  - Bridge contract version increased to 15.
- New UI screens or workflows:
  - Reverse-transaction confirmation includes Reversal date.
  - Reconciliation rows show lifecycle status and expose Correct/Void actions for
    current records.
  - Reconciliation form can correct a current same-date reconciliation.
  - Dashboard keeps only the Current escrow balance summary card.
- Validation and smoke-test results:
  - Integration tests cover historical dated payment/reversal behavior,
    principal/interest/escrow offset, YTD exclusion, and reconciliation
    superseding.
  - Electron E2E covers a generated mortgage, 2021 payment, 2026 YTD exclusion,
    same-date reconciliation correction, dashboard escrow simplification, and
    explicit reversal date.
  - Database migration tests cover applying the reconciliation lifecycle
    migration to a representative existing database with prior reconciliation
    records.
  - Packaged smoke tests cover the installed-app historical mortgage payment,
    2021 reversal, 2026 YTD exclusion, reconciliation correction, and dashboard
    escrow-summary behavior.
- Known limitations and technical debt:
  - A full user-facing malformed-reversal repair wizard remains deferred.
  - Current correction workflow supports reconciliation void/supersede; it does
    not yet provide a specialized allocation-repair wizard for manually corrupted
    reversal rows.
- Recommended next phase:
  - Continue user acceptance testing before deciding whether the malformed
    reversal repair wizard is needed for production data.

## Phase 16: Dashboard and Debt-Detail Usability Refinement

- Completion date: 2026-07-29
- Application version: 0.16.0
- Features implemented:
  - Made the Total active debt dashboard card navigate to the Debts screen.
  - Made the Current escrow balance dashboard card navigate to a focused escrow
    detail view.
  - Added escrow detail rows showing current escrow balances and posted escrow
    activity by applicable debt.
  - Swapped dashboard card order so Interest activity YTD appears before New
    borrowings YTD.
  - Removed visible dashboard explanatory paragraphs while preserving accounting
    basis text in accessible context and service contracts.
  - Added a combined user-facing debt label using debt name and creditor.
  - Simplified debt cards to show current principal balance, current effective
    rate, current required payment, and concise maturity/status information.
  - Simplified the normal debt-detail core information section and hid
    technical effective-term and confirmed-snapshot history sections.
- Material architecture and accounting decisions:
  - Debt name and creditor remain separate database, import, report, and export
    fields; the combined label is renderer presentation only.
  - Current rate and required payment are selected in the main-process service
    from the effective-dated term applicable as of the service effective date.
  - Confirmed balance snapshots and effective-dated terms remain preserved for
    reconciliation, audit, and calculations even though they are hidden from the
    normal debt-detail view.
  - Dashboard metric basis strings remain available through typed DTOs and
    accessible text; the normal visual dashboard is intentionally cleaner.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - No new IPC operations.
  - Debt summary and detail DTOs now include `currentTerm`.
  - Bridge contract version increased to 16.
- New UI screens or workflows:
  - Added dashboard-to-debts card navigation.
  - Added dashboard-to-escrow-detail card navigation.
  - Added Escrow balances and activity detail view.
  - Updated debt list and debt detail primary labels to use the combined
    name-creditor label.
- Validation and smoke-test results:
  - Added or updated renderer and service tests for dashboard navigation, card
    ordering, hidden explanatory dashboard text, combined debt labels, current
    term selection, simplified debt detail, and escrow detail display.
  - Final validation and smoke-test results should be recorded in the completion
    report for this phase.
- Known limitations and technical debt:
  - Effective-term editing remains available through the existing Add term
    workflow, but the full term-history table is no longer displayed in the
    normal debt-detail view.
  - Escrow detail reuses existing debt-detail retrieval rather than introducing
    a separate escrow-only service query.
- Recommended next phase:
  - Continue focused user acceptance testing of the simplified dashboard, debt
    list, debt detail, and escrow navigation before adding unrelated workflows.

## Phase 17: Escrow, Borrowing Metric, and Reporting Visualization Refinement

- Completion date: 2026-07-29
- Application version: 0.17.0
- Features implemented:
  - Added escrow activity entry directly from the Escrow balances and activity
    screen.
  - Supported real estate tax, homeowners insurance, mortgage insurance, escrow
    refund, escrow adjustment, and other named escrow expense entries.
  - Refreshed escrow balances and activity immediately after posting.
  - Updated New borrowings YTD to include opening principal for active debts
    originated during the displayed year.
  - Added duplicate prevention when a same-date borrowing/draw transaction
    already represents the opening principal.
  - Bounded All activity and custom report ranges to January 1, 2019.
  - Added principal and interest trend chart controls with bar and line views.
- Material architecture and accounting decisions:
  - Escrow detail posting reuses the existing typed transaction bridge and
    main-process transaction service; no duplicate accounting logic or generic
    IPC was added.
  - Opening principal is included in New borrowings YTD only for active debts
    originated in the displayed year and is not double-counted when represented
    by an explicit same-date borrowing/draw transaction.
  - Reporting history currently starts on January 1, 2019. Older records remain
    preserved and are excluded only from report period generation.
  - Principal and interest charts are renderer visualizations of existing report
    rows and remain paired with accessible tables.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - No new IPC operations.
  - Existing `createDebtTransaction`, `getDashboard`, `listDebts`, `getDebt`,
    and `getDebtReports` bridge operations are reused.
- New UI screens or workflows:
  - Escrow balances and activity now includes Record escrow activity.
  - Advanced reports now include report-history date clamping and bar/line chart
    selection for principal and interest trends.
- Validation and smoke-test results:
  - Added service regression tests for current-year debt origination, prior-year
    origination, HELOC draws, opening principal plus later draws, duplicate
    prevention, and report-history clamping.
  - Added renderer and Electron E2E coverage for escrow-detail posting, immediate
    refresh, report date boundary, and chart selection.
  - Final command results should be recorded in the completion report for this
    phase.
- Known limitations and technical debt:
  - Reporting-history start date is a fixed constant, not a user-configurable
    setting.
  - Escrow adjustment entry currently represents a positive escrow adjustment;
    negative adjustment workflows require an explicitly approved future design.
- Recommended next phase:
  - Continue user acceptance testing of escrow activity, dashboard borrowing
    metrics, and report chart usefulness before adding unrelated reporting or
    configuration features.

## Phase 18: Debt Reporting Redesign for Financial Analysis

- Completion date: 2026-07-29
- Application version: 0.18.0
- Features implemented:
  - Updated monthly and annual rollforward borrowings to include opening
    principal for debts originated during the report period.
  - Preserved duplicate prevention when an equivalent same-date borrowing/draw
    transaction represents opening principal.
  - Replaced the principal-reduction chart with a debt balance trend showing
    application-calculated ending principal balance by period.
  - Added separate monthly and annual interest expense analysis charts.
  - Redesigned sensitivity rows to show baseline/change fields, payoff timing
    changes, interest changes, and monthly cash requirements.
  - Replaced misleading actual-versus-plan table display with an unavailable
    state when saved scenarios lack period-level planned balances.
- Material architecture and accounting decisions:
  - Dashboard, monthly rollforward, and annual rollforward now use the same
    borrowing definition.
  - Balance trends use period-end application-calculated principal balances,
    not original principal, confirmed snapshots, or scenario balances.
  - Interest analysis remains positive user-facing expense reporting and
    reconciles to the accessible tabular detail.
  - Actual-versus-plan variance requires future period-level scenario baseline
    persistence before it can present reliable planned ending balances.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - No new IPC operations.
  - Existing `getDebtReports` returns expanded typed report rows.
- New UI screens or workflows:
  - Advanced reports now include Debt balance trend and Interest expense
    analysis sections.
  - Sensitivity sections show unavailable states when reliable output cannot be
    produced from current data.
- Validation and smoke-test results:
  - Added service regression tests for opening principal rollforward borrowing,
    duplicate prevention, month-end balances, report-history clamping, and
    sensitivity output.
  - Added renderer and Electron E2E assertions for redesigned balance and
    interest chart sections.
  - Final command results should be recorded in the completion report for this
    phase.
- Known limitations and technical debt:
  - Balance trend grouping is currently total debt; individual-debt and debt-type
    chart grouping remain future refinements.
  - Actual-versus-plan variance remains unavailable until saved scenarios
    persist period-level planned balances and reductions.
- Recommended next phase:
  - Validate the redesigned reports with representative fictional scenarios and
    decide whether period-level scenario baselines should be added before further
    variance reporting work.

## Phase 19: Rollforward Classification and Interest Chart Acceptance Corrections

- Completion date: 2026-07-29
- Application version: 0.19.0
- Features implemented:
  - Corrected monthly and annual principal rollforward classification.
  - Added an explicit rollforward check column.
  - Retained cash payments as supplemental activity information rather than a
    principal-balance driver.
  - Redesigned monthly interest analysis to avoid plotting every zero month in
    long report ranges.
  - Added month-by-month interest comparison across years.
  - Improved annual interest comparison with zero-year omission and annual
    change tables.
- Material architecture and accounting decisions:
  - Principal rollforward now follows Beginning principal + Borrowings -
    Principal reduction + Principal adjustments = Ending principal.
  - Opening principal appears once in Borrowings and does not create an
    offsetting principal adjustment.
  - Escrow deposits, escrow disbursements, escrow refunds, escrow adjustments,
    interest allocations, fees, and penalties do not enter principal
    adjustments merely because they are nonprincipal activity.
  - Cash payments remain visible for review but are not part of the principal
    rollforward equation.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - No new IPC operations.
  - Existing `getDebtReports` returns a rollforward check value on rollforward
    rows.
- New UI screens or workflows:
  - Monthly and annual rollforward tables now show Cash payments, Principal
    adjustments, and Check.
  - Interest expense analysis now has compact basis disclosure, chronological
    trend, and cross-year monthly comparison modes.
- Validation and smoke-test results:
  - Added service regression coverage for new-loan opening principal, normal
    split payments, escrow deposit/disbursement, HELOC draw, true principal
    adjustment, and monthly/annual rollforward checks.
  - Added renderer and Electron E2E assertions for rollforward labels/checks and
    interest comparison mode.
  - Final command results should be recorded in the completion report for this
    phase.
- Known limitations and technical debt:
  - Cash-payment activity remains in the rollforward table as supplemental
    information; if user testing still finds this confusing, it should move to a
    separate cash-payment report.
  - Interest charts use lightweight SVG rendering rather than a dedicated chart
    library.
- Recommended next phase:
  - Review report outputs with additional representative fictional debt
    portfolios before adding further report types.

## Phase 20: Reporting and Transaction-Entry Usability Refinement

- Completion date: 2026-07-30
- Application version: 0.20.0
- Features implemented:
  - Replaced the normal Debt balance history by obligation table with an
    interactive line chart and accessible detail table.
  - Added one chart line per debt plus a total-debt line, with session-only
    legend toggles, dynamic Y-axis scaling, mouse-wheel X-axis zoom, reset zoom,
    and empty state when no lines are selected.
  - Removed the separate visible total-only Debt balance trend section because
    the interactive history chart now covers total and individual debt balances.
  - Simplified payment entry by auto-calculating principal as the payment amount
    remaining after interest, escrow, fees, and penalties.
- Material architecture and accounting decisions:
  - Debt history chart values use application-calculated ending principal
    balance by reporting period; confirmed snapshots remain separate support
    data and are not plotted as current principal.
  - Payment principal auto-calculation is a renderer usability layer. Existing
    main-process validation and signed ledger conversion remain authoritative.
  - Chart visibility and zoom are renderer-only session state and are not
    persisted as settings.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - No new IPC operations.
  - Existing `getDebtReports` continues to provide report data through the typed
    bridge; balance-history rows now represent period-end principal balances.
- New UI screens or workflows:
  - Advanced reports now show the interactive debt balance history chart in the
    existing report section.
  - Payment transaction entry now displays principal as a read-only
    auto-calculated amount for payment transactions.
- Validation and smoke-test results:
  - Added renderer regression coverage for payment principal defaulting,
    recalculation, over-allocation blocking, legend toggles, disabled legend
    fading, Y-axis recalculation, zoom/reset, chart/table reconciliation, and
    removal of the old trend section.
  - Added service assertions that balance-history rows use monthly period-end
    dates and ending-principal basis.
  - Updated Electron and packaged workflows to use positive payment amounts with
    auto-calculated principal.
  - Final command results should be recorded in the completion report for this
    phase.
- Known limitations and technical debt:
  - The interactive chart uses lightweight SVG rendering; deeper analytics such
    as saved chart preferences remain intentionally out of scope.
  - Report chart zoom is limited to the selected report range and does not add
    persistent zoom settings.
- Recommended next phase:
  - Run additional user acceptance testing on report readability and payment
    allocation entry before adding new reporting categories.

## Phase 21: Debt-History Chart and Posted-Transaction Editing Refinement

- Completion date: 2026-07-30
- Application version: 0.21.0
- Features implemented:
  - Refined the debt balance history chart so mouse-wheel input over the chart
    zooms only the chart and normal page scrolling continues outside the chart.
  - Changed chart zoom to update the visible date domain, recalculate readable
    X-axis ticks, show the visible date range, remove normal point markers, and
    hide full chart data behind an optional disclosure.
  - Added a user-facing Edit transaction workflow for eligible posted
    transactions.
  - Implemented transaction edits as atomic superseding corrections that retain
    the original transaction, post a linked reversal, create a corrected
    replacement, and preserve audit history.
- Material architecture and accounting decisions:
  - The existing unified transaction ledger and self-reference columns are used
    for edit provenance; no raw SQL, Drizzle, filesystem, or generic IPC access
    is exposed to the renderer.
  - Current balances, dashboards, reports, exports, and payoff inputs use the
    current transaction chain and exclude superseded originals plus their edit
    reversals.
  - Edits affecting activity on or before a current reconciliation statement
    date mark the reconciliation as an exception requiring review.
  - Chart visibility and zoom remain renderer-only report-session state.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - Added narrow typed `editDebtTransaction` bridge/IPC operation.
- New UI screens or workflows:
  - Posted transaction history now shows Edit for eligible transactions and
    explains restricted transactions.
  - Edit transaction uses the existing positive-entry form, including automatic
    payment-principal calculation.
  - Debt balance history chart data is available through a closed-by-default
    disclosure instead of a full table in the normal view.
- Validation and smoke-test results:
  - Added service, renderer, preload, IPC, Electron E2E, and packaged smoke
    coverage for transaction editing and chart interaction.
  - Focused command results should be recorded in the completion report for this
    phase.
- Known limitations and technical debt:
  - Reconciliation review after transaction editing is represented by an
    exception status rather than a dedicated stale/review status because no
    schema migration was introduced.
  - The chart continues to use lightweight SVG rendering rather than a dedicated
    charting library.
- Recommended next phase:
  - Perform user acceptance testing on transaction correction wording and chart
    zoom behavior before adding more reporting complexity.

## Phase 22: Escrow Integrity, Transaction Voiding, and Chart Panning Correction

- Completion date: 2026-07-30
- Application version: 0.22.0
- Features implemented:
  - Reproduced the generated mortgage escrow workflow and identified an escrow
    calculation drift after editing an escrow disbursement.
  - Centralized current transaction-chain escrow balance behavior so debt
    detail, dashboard, escrow detail, reports, and exports use the same current
    effect rule.
  - Added a user-facing Void transaction workflow for eligible posted
    transactions while preserving original rows and generated offsets for audit
    history.
  - Split transaction presentation into Current activity and an expandable Audit
    history with plain-language chain labels.
  - Added debt-history chart panning after zoom through Shift + mouse wheel,
    click-and-drag, and keyboard previous/next controls.
- Material architecture and accounting decisions:
  - Voids are complete linked offsets, not deletes. The original transaction is
    marked `voided`, the generated reversal offsets total and allocations, and
    reconciliations affected by the change are marked for review.
  - Escrow balances exclude superseded originals and edit-generated reversals,
    allow voided chains to net to zero, and rely on transaction effective dates
    for financial effect.
  - The renderer receives only the narrow typed `voidDebtTransaction` bridge
    operation; no generic IPC, SQL, filesystem, or Drizzle access was added.
- Database schema or migration changes:
  - Added migration `0006_famous_archangel.sql` to expand the
    `debt_transactions.status` check constraint with `voided`.
- New or changed IPC operations:
  - Added `voidDebtTransaction` to the typed preload bridge and IPC handlers.
  - Bridge version increased to 18.
- New UI screens or workflows:
  - Current transaction activity hides generated reversal rows and superseded
    originals while audit history preserves the full chain.
  - Eligible posted transactions now show a Void action with confirmation and a
    user-selected void date.
  - Debt history chart controls now support panning and returning to the latest
    visible periods.
- Validation and smoke-test results:
  - Added service, renderer, Electron E2E, and packaged smoke coverage for edited
    escrow activity, voided activity, shared escrow totals, and chart panning.
  - Final command results should be recorded in the completion report for this
    phase.
- Known limitations and technical debt:
  - The data-management export remains an audit export of posted rows; current
    financial effect is determined by transaction-chain relationships rather
    than by deleting or suppressing audit rows.
  - Chart interaction state remains session-only and is not persisted.
- Recommended next phase:
  - Use additional fictional acceptance data to review void/edit wording,
    current-vs-audit activity presentation, and escrow exports before adding new
    features.

## Phase 23: Emergency Packaged Startup Migration Repair

- Completion date: 2026-07-30
- Application version: 0.22.1
- Features implemented:
  - Diagnosed packaged startup failure against an isolated copy of the existing
    user database.
  - Reproduced `DrizzleError` during migration `0006_famous_archangel` at
    `DROP TABLE debt_transactions` with SQLite
    `SQLITE_CONSTRAINT_TRIGGER`.
  - Repaired migration application so generated SQLite table-rebuild migrations
    run with foreign-key enforcement disabled before Drizzle starts its migration
    transaction, then immediately re-enable and validate foreign keys and
    integrity.
  - Improved startup diagnostics to include sanitized migration identifier,
    SQLite error code, sanitized message, and failing stage.
- Material architecture and accounting decisions:
  - The released migration file was not edited. The repair is in migration
    execution and post-migration validation.
  - Existing debts, transactions, allocations, reconciliations, scenarios,
    imports, backups, and audit history are preserved; no posted financial
    records are rewritten or deleted.
- Database schema or migration changes:
  - No new schema migration.
  - Migration execution now validates `PRAGMA foreign_key_check` and
    `PRAGMA integrity_check` after applying migrations.
- New or changed IPC operations:
  - No IPC changes.
- New UI screens or workflows:
  - No UI workflow changes.
- Validation and smoke-test results:
  - Added regression coverage for upgrading a representative generated 0005
    database containing posted, reversed, superseded, escrow, allocation, and
    reconciliation foreign-key references.
  - Verified an isolated copy of the existing user database migrated from six to
    seven applied migrations with matching counts/control totals before and
    after migration, empty `foreign_key_check`, and `integrity_check` equal to
    `ok`.
  - Final command results should be recorded in the completion report for this
    patch.
- Known limitations and technical debt:
  - Startup diagnostics remain intentionally sanitized and do not include raw SQL
    values, database paths, or financial data.
- Recommended next phase:
  - Install the repaired 0.22.1 package and confirm startup against the live
    database, relying on the existing Desktop emergency copy as the recovery
    point if needed.

## Phase 24: Transaction Visibility, Escrow Activity, and Chart Pan Correction

- Completion date: 2026-07-30
- Application version: 0.22.2
- Features implemented:
  - Corrected Current activity so reversed originals, generated reversals,
    voided rows, superseded originals, and zero-effect correction-chain members
    no longer appear as active transaction rows.
  - Preserved the full original, reversal, replacement, and void chain in audit
    history with plain-language labels.
  - Updated escrow activity in debt detail and escrow detail to show only
    current effective escrow-affecting rows by default.
  - Changed escrow activity display to signed escrow balance impact and added a
    running balance column plus visible balance check.
  - Tightened debt-history chart drag panning so pointer drag does not select
    axis labels or page text and panning stays inside the selected report range.
- Material architecture and accounting decisions:
  - No schema or IPC changes. The correction is presentation-layer filtering and
    display conversion using existing transaction status and relationship DTOs.
  - Escrow display signs match calculated escrow balance impact rather than raw
    persisted allocation signs.
- Database schema or migration changes:
  - No schema or migration changes.
- New or changed IPC operations:
  - No IPC changes.
- New UI screens or workflows:
  - Existing Current activity, Audit history, Escrow activity, Escrow detail, and
    Debt balance history chart interactions were corrected in place.
- Validation and smoke-test results:
  - Added renderer tests for current transaction visibility, audit-chain
    traceability, signed escrow rows, visible escrow balance reconciliation, and
    chart drag-selection suppression.
  - Final command results should be recorded in the completion report for this
    patch.
- Known limitations and technical debt:
  - Chart interaction remains a lightweight SVG implementation with
    session-only zoom and pan state.
- Recommended next phase:
  - Continue acceptance testing with fictional edited, voided, reversed, and
    escrow-heavy data before expanding import or reporting scope.

## Phase 25: Transaction, Reconciliation, Scrolling, and Report Presentation Refinement

- Completion date: 2026-07-31
- Application version: 0.22.3
- Features implemented:
  - Current transaction, escrow, and reconciliation lists now sort newest-first
    with created-timestamp tie-breaking and exclude non-current lifecycle rows.
  - Reconciliation entry now accepts only date and verified balance; mismatches
    are rejected with verified, calculated, and difference values.
  - Removed unnecessary form and report explanation copy, removed normal-entry
    transaction descriptions, and marked required fields with `*`.
  - Successful transaction entry returns focus to the debt heading; transaction
    editing focuses the first edit field at the top of the debt screen.
  - Added debt-source annual stacked interest bars, source toggles, collapsed
    report data, and bounded monthly zoom/pan controls.
- Material architecture and accounting decisions:
  - Existing historical approved-adjustment DTOs and records remain readable,
    but the normal workflow no longer creates them.
  - Annual debt-source interest segments are calculated in the main process from
    posted current activity and sent through the typed report DTO.
- Database schema or migration changes:
  - No schema migration. A report DTO field was extended for annual debt-source
    interest segments.
- New or changed IPC operations:
  - No IPC operation changes; existing report and reconciliation bridge contracts
    remain narrow and typed.
- New UI screens or workflows:
  - Refined debt detail transaction/reconciliation forms and report presentation.
- Validation and smoke-test results:
  - Focused renderer tests: 26 passed; database/service integration tests: 62
    passed.
  - Full `npm run check` passed: formatting, lint, type checking, 129 unit tests,
    database integrity, and Electron E2E (1 active test passed; packaged specs
    are skipped in the source-app suite).
  - `npm run package:smoke` passed installed-app and upgrade-preservation tests.
  - Known command warnings: npm pending native install-script review, Node
    `fs.R_OK` deprecation, and temporary installed-app directory cleanup warning.
- Known limitations and technical debt:
  - Historical adjustment-linked reconciliations remain visible only through
    audit data and are not recreated by the normal form.
- Recommended next phase:
  - Continue fictional-data acceptance testing for report source toggles and
    correction-chain workflows.

## Phase 26: Debt History and Interest Chart Usability Corrections

- Completion date: 2026-07-31
- Application version: 0.22.4
- Features implemented:
  - Added accessible Select none/Select all debt-history legend control.
  - Aligned monthly interest wheel zoom with bounded debt-history chart
    interaction and preserved drag pan and period controls.
  - Added range-aware monthly ticks, filled radio states, annual totals above
    stacked bars, and stable multi-treatment year comparison bars.
- Material architecture and accounting decisions:
  - Chart interaction remains renderer-only presentation state and uses the
    selected report range as its boundary.
  - Annual visible totals remain the sum of visible current-effect debt-source
    segments.
- Database schema or migration changes:
  - None.
- New or changed IPC operations:
  - None.
- New UI screens or workflows:
  - Existing debt-history and interest analysis charts were refined in place.
- Validation and smoke-test results:
  - `npm run format` and `npm run check` passed. The gate completed with 10
    test files and 130 tests passing, database integrity passing, production
    build passing, and the active Electron E2E workflow passing; packaged source
    specs were skipped in that suite.
  - The source Electron E2E regression also verifies both Select none and Select
    all legend states.
  - `npm run package:smoke` passed installer launch, packaged workflow, and
    upgrade-preservation tests. The runner reported its existing temporary
    installed-app cleanup warning and Node `fs.R_OK` deprecation warning.
- Known limitations and technical debt:
  - Chart rendering remains lightweight SVG with session-only view state.
- Recommended next phase:
  - Continue fictional-data acceptance testing for report accessibility and
    chart interaction boundaries.

## Phase 27: Report Ordering and Chart Interaction Refinement

- Completion date: 2026-07-31
- Application version: 0.22.5
- Features implemented:
  - Reordered advanced reports to balance history, interest analysis, monthly
    rollforward, annual rollforward, then the remaining reports.
  - Simplified balance-history labels to debt names and assigned stable solid
    colors before dashed fallback styles.
  - Added focusable chart data details for balance, monthly interest,
    month-comparison, and annual stacked segments.
  - Added annual segment totals and percentages to focus/hover details while
    keeping bar segments free of dashed borders.
- Material architecture and accounting decisions:
  - Chart details are presentation-only and derive from existing report DTO
    values; creditor data remains available to other workflows.
  - Hidden series are removed from both rendering and focusable detail targets.
- Database schema or migration changes:
  - None.
- New or changed IPC operations:
  - None.
- New UI screens or workflows:
  - Existing advanced report charts and section ordering were refined in place.
- Validation and smoke-test results:
  - `npm run format` and `npm run check` passed. The gate completed with 10
    test files and 130 tests passing, database integrity passing, production
    build passing, and the active Electron E2E workflow passing; packaged source
    specs were skipped in that suite.
  - `npm run package:smoke` passed packaged launch and upgrade-preservation
    tests. Existing npm native-script review and Node `fs.R_OK` deprecation
    warnings were reported.
- Known limitations and technical debt:
  - Tooltip details use focusable SVG title content and remain session-local.
- Recommended next phase:
  - Continue fictional-data accessibility review of dense multi-year report
    ranges.

## Phase 28: Chart Border and Tooltip Simplification

- Completion date: 2026-07-31
- Application version: 0.22.6
- Features implemented:
  - Removed all outlines from month-comparison bars while preserving stable
    fill-color year mapping and grouped spacing.
  - Simplified balance, monthly, comparison, and annual segment focus/hover
    details to compact period/name/amount content.
  - Kept annual segment percentage detail without repeating the annual total.
- Material architecture and accounting decisions:
  - Tooltip content remains presentation-only and uses the existing focusable
    SVG data targets, with no timing state or ledger effect.
- Database schema or migration changes:
  - None.
- New or changed IPC operations:
  - None.
- New UI screens or workflows:
  - Existing report charts were refined in place.
- Validation and smoke-test results:
  - `npm run format` and `npm run check` passed. The gate completed with 10
    test files and 130 tests passing, database integrity passing, production
    build passing, and the active Electron E2E workflow passing; packaged source
    specs were skipped in that suite.
  - `npm run package:smoke` passed packaged launch and upgrade-preservation
    tests. The runner reported the existing Node `fs.R_OK` deprecation and
    temporary installed-app cleanup warnings.
- Known limitations and technical debt:
  - Tooltip details continue to use native SVG title behavior for immediate
    pointer and keyboard access.
- Recommended next phase:
  - Continue fictional-data accessibility review of chart focus and hover
    behavior.

## Phase 29: Dynamic Chart Scaling and Backup Retention

- Completion date: 2026-08-01
- Application version: 0.23.0
- Features implemented:
  - Added shared dynamic Y-axis scaling for debt balance history, monthly
    interest trend, month-by-month interest comparison, and annual interest
    comparison charts.
  - Added backup deletion with confirmation and immediate backup-list refresh.
  - Limited successful automatic startup backups to one per local calendar day.
  - Added automatic five-calendar-day retention cleanup for automatic backups.
- Material architecture and accounting decisions:
  - Chart scales are pure presentation calculations from visible report values;
    no report DTO, ledger, or accounting calculation semantics changed.
  - Backup deletion and retention remain main-process-only filesystem
    operations with specific IPC and non-sensitive audit events.
- Database schema or migration changes:
  - None.
- New or changed IPC operations:
  - Added `debt:data-management:delete-backup`.
  - Increased the typed preload bridge version to 19.
- New UI screens or workflows:
  - Existing report charts now show readable intermediate currency ticks.
  - Existing Data Management backup list now shows newest backups first with
    filename secondary and Delete beside Restore.
- Validation and smoke-test results:
  - Focused test run passed for renderer app, preload bridge, IPC handlers, and
    data-management integration tests: 4 files and 100 tests.
  - `npm run format` passed.
  - `npm run check` passed. The gate completed with 10 test files and 134 tests
    passing, database integrity passing, production build passing, and the
    active Electron E2E workflow passing; packaged source specs were skipped in
    that suite.
  - `npm run package:smoke` passed packaged launch and upgrade-preservation
    tests. The runner reported the existing Node `fs.R_OK` deprecation warning
    and a temporary installed-app cleanup warning.
- Known limitations and technical debt:
  - Chart state remains session-local SVG presentation state.
- Recommended next phase:
  - Continue backup/restore acceptance testing with generated packaged-app data.

## Phase 30: Controlled Debt Deletion and Refinance Chains

- Completion date: 2026-08-01
- Application version: 0.24.0
- Features implemented:
  - Added a debt-detail Danger zone for permanent debt deletion with dependent
    record counts, exact debt-name entry, two confirmations, and an immediately
    validated pre-delete backup.
  - Added atomic main-process deletion of debts and dependent terms,
    transactions, allocations, snapshots, reconciliations, import provenance,
    debt-chain audit events, and payoff-scenario references.
  - Added refinance-chain fields so separate obligations can link to prior and
    replacement debts, show a shared financing-chain name, and identify the
    refinance date.
  - Added combined financing-chain balance trend rows while retaining separate
    loan-level history and activity.
- Material architecture and accounting decisions:
  - Permanent deletion remains a narrow IPC operation; no renderer filesystem,
    database, or SQL access was added.
  - Deletion is guarded against overlapping backup, restore, import posting, or
    permanent deletion operations at the IPC layer.
  - Refinance links preserve separate legal obligations and do not merge terms,
    ledgers, snapshots, or reconciliations.
- Database schema or migration changes:
  - Added migration `0007_bumpy_patriot.sql` to add nullable refinance-chain
    columns, self-referential foreign keys, validation checks, and supporting
    indexes to `debts`.
  - Added `refinanced` as a debt status.
- New or changed IPC operations:
  - Added `debt:delete-permanently`.
  - Increased the typed preload bridge version to 20.
- New UI screens or workflows:
  - Debt create/edit forms can link refinance relationships and financing-chain
    names.
  - Debt detail displays refinanced-from, refinanced-into, refinance date, and
    permanent-deletion controls.
- Validation and smoke-test results:
  - Focused service integration tests passed: 62 tests.
  - Focused renderer, preload, and IPC tests passed: 46 tests.
  - Focused database migration tests passed: 7 tests.
  - `npm run format` passed.
  - `npm run check` passed under escalation after an initial sandbox
    access-denied failure in the Electron build. The gate completed with 10
    Vitest files and 142 tests passing, database integrity passing, production
    build passing, and the active Electron E2E workflow passing; packaged source
    specs were skipped in that suite.
  - `npm run package:smoke` passed packaged launch and upgrade-preservation
    tests. The runner reported the existing Node `fs.R_OK` deprecation warning
    and a temporary installed-app cleanup warning.
- Known limitations and technical debt:
  - Permanent deletion recovery is by restoring the validated backup; no
    in-place undo is provided.
  - Combined refinance-chain reporting is limited to balance trends; rollforward
    rows remain loan-level aggregate report rows.
- Recommended next phase:
  - Continue generated-data acceptance testing around administrative recovery
    and refinance-chain report review.
