# Debt Tracker

Debt Tracker is a Windows-first, local, single-user Electron desktop application.
The current repository contains only the application foundation and a blank React
shell. Debt-management features have not been implemented.

## Foundation

- Electron main process written in TypeScript.
- React and TypeScript renderer built by Vite through electron-vite.
- Sandboxed renderer with context isolation enabled and Node integration disabled.
- Minimal typed preload bridge containing static application metadata only.
- Strict TypeScript, ESLint, Prettier, Vitest, React Testing Library, and Tailwind
  CSS.

No database driver, ORM, workbook importer, financial calculation, reporting,
end-to-end testing, or installer packaging is configured yet.

## Prerequisites

- Node.js
- npm
- Git

## Commands

Install exact locked dependencies:

```powershell
npm ci
```

The install step downloads Electron's official prebuilt Windows binary for local
development.

Run the local development application:

```powershell
npm run dev
```

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
```

## Privacy

Use only generated or irreversibly sanitized data in source code, tests,
documentation, screenshots, and commits. Do not copy personal workbooks,
financial data, databases, exports, or backups into this repository.

## Documentation

- [`docs/data-dictionary.md`](docs/data-dictionary.md)
- [`docs/accounting-rules.md`](docs/accounting-rules.md)
- [`docs/workbook-mapping.md`](docs/workbook-mapping.md)
- [`docs/decisions/`](docs/decisions/)
