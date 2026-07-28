# Project Progress

This document is a concise chronological handoff log for future developers and
AI assistants. It summarizes completed implementation phases using repository
history, documentation, ADRs, migrations, and implemented code.

Version tracking note: application-version progress tracking was added after
phase seven on 2026-07-28. The current application version is `0.10.0`, aligned
to the ten completed feature phases. Earlier phase entries did not record an
application version at the time they were completed.

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
  - Phase 11: Backup, restore, export, and packaging.
