# AGENTS.md

## Purpose

Debt Tracker is a Windows-first, local, single-user desktop application for
recording debt activity, measuring debt reduction, reconciling balances,
forecasting cash requirements, and comparing payoff strategies.

The application must emphasize:

- Accounting integrity and traceability.
- Effective-dated financial information.
- Exact and reproducible financial calculations.
- Clear separation of actual, projected, and scenario activity.
- Explicit reconciliation of application balances to external statements.
- Useful decision-support reporting.

Version one is limited to debt management. Tax estimates, partnership basis,
asset inventory, accounts-receivable analysis, and unrelated workbook
schedules are out of scope unless explicitly approved.

## Approved Architecture

- Electron desktop application.
- React and TypeScript renderer built with Vite.
- TypeScript business and application services in the Electron main process.
- SQLite as the local database.
- `better-sqlite3` for database access.
- Drizzle ORM for schema definitions and migrations.
- Zod validation at user-input, IPC, import, and persistence boundaries.
- A sandboxed renderer with context isolation enabled.
- Node integration disabled in the renderer.
- A narrow, typed preload bridge for approved IPC operations.
- No direct renderer access to Node, the filesystem, or the database.
- Tailwind CSS and accessible UI primitives.
- TanStack Table for data grids.
- Recharts for charts.
- Vitest and React Testing Library for unit and component testing.
- Playwright for critical end-to-end desktop workflows.
- electron-vite and electron-builder for development and packaging.

The renderer is responsible for presentation and interaction. Database, file,
import, backup, calculation, and operating-system operations belong in the
main process.

The application is local-only. Do not add login, cloud synchronization,
telemetry, analytics, remote APIs, or network dependencies without explicit
approval.

## Implementation Sequence

Implement the application in this order:

1. Application foundation.
2. Core database schema and migrations.
3. Manual debt-entry workflow.
4. Manual payment, borrowing, and balance-snapshot workflow.
5. Account-detail and reconciliation screen.
6. Basic dashboard.
7. Workbook import staging and mapping.
8. Projection and payoff engine.
9. Advanced reports.
10. Backup, restore, export, and packaging.

Do not build the workbook importer before the core manual workflows are
working. The database and accounting rules must first be proven through
manual entry, review, and reconciliation.

## Inspect Before Modifying

Before changing code:

1. Inspect the relevant files, tests, schema, documentation, and nearby
   implementations.
2. Check `git status` and preserve unrelated user changes.
3. Review existing utilities and patterns before introducing alternatives.
4. Understand the financial, database, migration, and reporting effect of the
   proposed change.
5. Identify whether the affected behavior represents actual, confirmed,
   calculated, projected, or scenario information.

Do not replace, rewrite, or remove a working feature merely because another
implementation is preferred. Make the smallest coherent change that satisfies
the requirement.

## Standard Task Execution Protocol

For every implementation, modification, review, or fix, automatically:

- Inspect the relevant code, tests, schema, documentation, and existing
  patterns.
- Check `git status` and preserve unrelated changes.
- Stay within the requested scope and avoid later-phase features.
- Identify material architecture, accounting, database, IPC, security,
  privacy, migration, and UI decisions.
- Follow existing architecture and conventions unless a documented change is
  justified.
- Make the smallest coherent change that fully satisfies the request.
- Use only generated or irreversibly sanitized test data.
- Preserve all Electron, IPC, database, financial-data, and repository
  privacy controls.
- Add or update tests proportionate to the risk and behavior changed.
- Update affected documentation and create ADRs for material decisions.
- Inspect `package.json` before running commands.
- Run every currently configured check relevant to the change.
- Perform a controlled smoke test for user-facing or critical workflows.
- Never claim a test, command, or manual verification was completed unless it
  actually was.
- Report implementation details, files changed, material decisions, database or
  IPC changes, tests, smoke-test results, warnings, limitations, final Git
  status, and one recommended commit message.
- Never commit, push, rewrite history, or use destructive Git commands unless
  explicitly instructed.

## Coding and Naming Conventions

- Use strict TypeScript.
- Avoid `any`; validate unknown external values before use.
- Keep financial calculations pure, deterministic, and independent of the UI.
- Keep database access out of React components.
- Keep React components focused on presentation and interaction.
- Use kebab-case file and directory names.
- Use PascalCase for React components and TypeScript types.
- Use camelCase for variables and functions.
- Prefix React hooks with `use`.
- Use plural snake_case names for database tables.
- Use snake_case names for database columns.
- Give migrations descriptive timestamped names.
- Centralize monetary rounding, rate conversion, and date conventions.
- Include actionable context in errors without exposing sensitive data.
- Add comments for accounting intent and non-obvious decisions, not to
  restate straightforward code.
- Use dependency injection or explicit service boundaries where needed to
  keep financial logic testable.
- Do not place business rules directly in IPC handlers or UI event handlers.

## Financial Calculation Rules

- Never use binary floating-point values for money.
- Store money as integer cents.
- Store interest rates as scaled integers and convert them through tested
  domain helpers.
- Store dates as ISO `YYYY-MM-DD` values.
- Make day-count conventions explicit, including 360-day, 365-day, and
  monthly calculations.
- Keep principal, interest, escrow, fees, penalties, and extra principal
  separate.
- Keep actual, projected, and scenario activity separate.
- Display the effective date of every material balance and report.
- Version material calculation rules when a change could alter historical or
  projected results.
- Add unit tests for rounding, irregular payment dates, rate changes, draws,
  extra payments, payoff events, period boundaries, and reconciliation
  differences.
- Do not present an application-calculated balance as a confirmed balance.
- Do not present a projected or scenario balance as actual activity.
- Do not silently infer accounting treatment from incomplete data.

## Effective-Dated Balance Model

A debt balance is effective-dated information. The application must clearly
distinguish the following concepts:

### Original Principal

The amount originally borrowed or the opening principal used to establish the
debt. It is not automatically the current balance.

### Imported Historical Transactions

Payments, borrowings, adjustments, fees, and other activity imported from an
external source. Imported transactions remain staged until reviewed and
posted.

### Confirmed Balance

A balance supported by a statement, lender record, or explicitly approved
manual entry as of a specific date.

Every confirmed balance must have:

- An effective date.
- A source or source type.
- An optional external reference.
- Supporting notes where appropriate.
- An audit trail showing how it entered the application.

### Application-Calculated Balance

The balance calculated from posted activity through a stated date. It must
display its calculation date and must not be labeled as confirmed unless it
has been reconciled to external support.

### Projected Future Balance

A forecast produced from scheduled payments, assumed borrowings, rate
assumptions, and other baseline projection inputs.

Projected balances must remain separate from posted actual activity.

### Scenario Balance

A result produced by a saved payoff or planning scenario. Scenario balances
must identify the scenario and assumptions that produced them and must never
update the actual ledger.

## Balance Reconciliation Model

The application must support explicit balance reconciliations between an
external statement and the application ledger.

Each reconciliation must contain:

- Debt identifier.
- Statement date.
- Statement ending balance.
- Application-calculated balance as of the same date.
- Difference.
- Reconciliation status.
- Explanation or adjustment.
- Supporting notes.
- Source or statement reference when available.
- Created and updated timestamps.
- Audit information identifying the related posting or import operation.

At minimum, reconciliation statuses must distinguish:

- Unreconciled.
- In progress.
- Reconciled.
- Reconciled with an approved adjustment.
- Exception requiring follow-up.

The difference must be calculated by the application and not entered
independently.

A reconciliation adjustment must be explicit, reviewed, and traceable. The
application must not silently overwrite the ledger balance to match a
statement.

Reconciliation history must be retained even after later statements are
reconciled.

## Database Rules

- SQLite is the system of record.
- Only the Electron main process may open the production database.
- Store the live database in the Windows application-data directory.
- Never store the live database in the Git repository or a
  cloud-synchronized working directory.
- Enable SQLite foreign-key enforcement.
- Use database transactions for multi-record changes.
- Apply schema changes only through committed migrations.
- Never edit a migration that may already have been applied.
- Back up the database before migrations and material imports once backup
  support exists.
- Do not silently delete posted financial activity.
- Use reversals, superseding entries, explicit adjustments, or archival where
  appropriate.
- Record import provenance and audit events for material changes.
- Import external data into staging tables and reconcile it before posting.
- Keep imported source values separate from normalized posted values.
- Require explicit effective dates for balance-affecting records.
- Database tests must use isolated temporary databases containing generated
  or sanitized data.
- Never commit databases, journal files, backup files, or database exports.

The core schema must support at least:

- Debts and debt terms.
- Effective-dated interest-rate periods.
- Payments and payment allocations.
- Borrowings and draws.
- Confirmed balance snapshots.
- Balance reconciliations.
- Import batches and staged import rows.
- Posted import provenance.
- Projection assumptions.
- Saved scenarios.
- Audit events.
- Application settings.

## Workbook Import Rules

The workbook is an import source, not the application calculation engine.

- Do not build the importer before the manual debt, activity, snapshot, and
  reconciliation workflows are functioning.
- Import into staging tables first.
- Preserve the source sheet, row, cell references, and original displayed
  values where practical.
- Validate and normalize staged values before posting.
- Show proposed debt and field mappings to the user.
- Show control totals and reconciliation differences before posting.
- Require explicit review before staged rows become posted activity.
- Do not silently classify a workbook row as actual or projected.
- Flag every ambiguous row for review.
- Do not post ambiguous activity until its classification and effective date
  have been approved.
- Treat formulas, hard-coded values, and displayed results as distinct source
  characteristics where relevant.
- Do not translate legacy workbook formulas directly into production
  calculation code without independently documenting and testing the
  accounting rule.
- Never modify the source workbook during import.
- Never copy the actual workbook into the repository.

## Documentation Requirements

Database schema and financial calculation decisions must be documented as part
of the same change that implements them.

Maintain these documents:

### `docs/data-dictionary.md`

Document:

- Tables and columns.
- Data types and units.
- Required and optional fields.
- Relationships and foreign keys.
- Effective-date behavior.
- Status values.
- Audit and provenance fields.
- Money and interest-rate storage conventions.

### `docs/accounting-rules.md`

Document:

- Balance definitions.
- Transaction posting rules.
- Principal and interest allocation.
- Borrowing and draw treatment.
- Statement reconciliation.
- Adjustments and reversals.
- Day-count conventions.
- Rate changes.
- Projection boundaries.
- Scenario isolation.
- Rounding rules.
- Material control totals.

### `docs/workbook-mapping.md`

Document:

- Source sheets and tables.
- Source-to-staging mappings.
- Staging-to-posting mappings.
- Actual-versus-projected review rules.
- Ambiguous fields and manual decisions.
- Known workbook anomalies.
- Import control totals.
- Reconciliation procedures.

### `docs/decisions/`

Use architecture decision records for material choices involving:

- Architecture or process boundaries.
- Database design.
- Financial calculation methodology.
- Import behavior.
- Security and privacy.
- Backup and restore.
- Packaging.
- Major dependency selection or replacement.

Do not leave material database or accounting decisions documented only in
source-code comments, commit messages, or conversation history.

## Test Data and Privacy

The first implementation and all subsequent automated tests must use generated
or sanitized test data only.

Do not copy actual personal financial information into:

- The repository.
- Source code.
- Test fixtures.
- Seed files.
- Snapshots.
- Screenshots.
- Documentation examples.
- Error messages.
- Logs.
- Commits.
- Pull requests or issue descriptions.

Do not copy the actual workbook into the repository.

Generated test data must use fictional:

- People and entity names.
- Lenders.
- Account references.
- Debt balances.
- Payment histories.
- Interest rates where necessary.
- Statement and reconciliation examples.

Sanitized data must be irreversibly de-identified and reviewed before it is
added to the repository.

Local development against actual financial data may occur only through an
explicit user-controlled import or entry workflow after the application can
store that data outside the repository.

## UI and Design Principles

- Use a clean, restrained, professional visual style.
- Optimize for efficient review by a financially sophisticated user.
- Prefer clear hierarchy and progressive disclosure over dense screens.
- Make keyboard navigation and accessible labels first-class requirements.
- Format currency consistently and align numeric columns.
- Display negative financial amounts consistently.
- Distinguish actual, confirmed, calculated, projected, and scenario values
  using both text and visual treatment.
- Never rely on color alone to communicate financial status.
- Show assumptions, effective dates, source, and reconciliation status near
  material results.
- Pair material charts with accessible tabular detail.
- Use restrained color and reserve warning colors for meaningful exceptions.
- Confirm destructive actions and provide recovery when practical.
- Keep empty, loading, validation, and error states deliberate and useful.
- Make reconciliation exceptions easy to identify and investigate.
- Do not show a balance without making its type and effective date available.

## Command Availability

The source of truth for available commands is `package.json`.

Before running a command:

1. Inspect `package.json`.
2. Confirm that the script exists.
3. Do not claim a command was run if it has not yet been configured.

### Currently Configured Commands

The application foundation, core database, and manual debt-entry phases provide:

    npm run dev
    npm run build
    npm run format
    npm run format:check
    npm run lint
    npm run typecheck
    npm run test
    npm run test:integration
    npm run test:e2e
    npm run db:generate
    npm run db:migrate
    npm run db:check
    npm run check
    npm run native:node
    npm run native:electron

After a lockfile exists, clean dependency installation should use:

    npm ci

### Commands to Add When Their Supporting Workflows Exist

Add these scripts when their related infrastructure is implemented:

    npm run package

`npm run check` runs formatting verification, linting, type checking, unit and
integration tests, the isolated database check, a production build, and the
isolated Electron end-to-end workflow.

`native:node` restores the Node-compatible better-sqlite3 prebuild for Vitest and
database scripts. `native:electron` installs the official prebuild for the
configured Electron runtime. Commands that need either ABI invoke the appropriate
preparation automatically.

End-to-end tests must be included in the completion gate when a change affects
a critical workflow, Electron integration, imports, backups, migrations,
restore behavior, or packaging.

Update this section and the README when command availability changes. Do not
leave placeholder scripts that report success without performing the stated
check.

## Task Prompt Interpretation

Future prompts may intentionally be brief because `AGENTS.md` contains the
standing project requirements. Interpret future prompts as providing only:

- The phase or objective.
- Included scope.
- Explicitly excluded scope.
- Task-specific accounting, validation, UI, or acceptance requirements.

Do not require standing instructions to be repeated in each task prompt.

## Testing and Completion

Test every change in proportion to its risk before declaring it complete.

At minimum:

1. Add or update automated tests for changed behavior.
2. Run relevant focused tests while developing.
3. Run every currently configured completion command relevant to the change.
4. Test database migrations against both a new database and a representative
   prior schema once migration testing exists.
5. Reconcile financial calculations to independently determined expected
   results.
6. Verify affected UI states, including empty, error, validation, and
   reconciliation-exception states.
7. Report the commands run and any remaining limitations.
8. Clearly identify any planned command that is not yet configured.

A change is not complete merely because it compiles or appears correct in one
manual example.

Do not declare a feature complete without testing it.

## Security and Privacy

- Load only packaged local application content.
- Do not add telemetry, analytics, remote APIs, network synchronization, or
  remote content without explicit approval.
- Keep the renderer sandboxed with context isolation enabled.
- Keep Node integration disabled in the renderer.
- Expose only narrow, purpose-specific IPC methods.
- Validate IPC sender, channel, arguments, and returned data.
- Do not expose raw Electron or Node APIs to the renderer.
- Do not log financial values or personally identifiable information.
- Treat imported files and their contents as untrusted input.
- Keep production financial data outside the repository.
- Do not embed secrets or encryption keys in source code.

## Git Workflow

Working directly on `main` is permitted while the project remains small.

Regardless of branch strategy:

- Keep `main` buildable.
- Make small, logically complete commits.
- Review `git status` before every commit.
- Review the relevant `git diff` before every commit.
- Do not include unrelated user changes in a commit.
- Use clear commit subjects, preferably Conventional Commit prefixes such as
  `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, and `chore:`.
- Do not rewrite shared history.
- Do not use destructive Git commands without explicit approval.
- Include migration files, documentation, and corresponding tests in the same
  logical change as a schema modification.
- Never commit personal financial data, databases, workbooks, backups,
  exports, secrets, generated installers, or packaged application artifacts.
- Inspect staged contents before committing to prevent accidental inclusion
  of sensitive data.
