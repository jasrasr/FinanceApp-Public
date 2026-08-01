# ADR 033: Remove Workbook Import and Fix Permanent Debt Deletion Dialog

## Status

Accepted.

## Context

Permanent debt deletion previously used browser-native prompt and confirmation
dialogs from the renderer. In the installed Electron application, clicking
`Delete debt permanently` produced no visible confirmation workflow, so the
request never reached the typed bridge, IPC handler, backup precondition, or
deletion service.

Workbook import is no longer part of the normal product workflow. Existing
databases may still contain legacy import tables and provenance rows.

## Decision

- Replace browser-native deletion prompts with an in-app confirmation dialog.
- Keep the existing typed IPC deletion operation and main-process backup
  precondition.
- Show debt name, related-record counts, immediate-backup status, typed-name
  confirmation, and irreversible-action confirmation before deletion.
- Remove workbook import navigation, renderer screens, preload bridge methods,
  IPC handlers, parser code, import-posting service code, and current product
  documentation.
- Retain legacy import database tables and migrations to avoid destructive
  migration risk and preserve existing provenance readability.

## Consequences

- Permanent deletion is testable in renderer, IPC, source E2E, and packaged-app
  smoke workflows without relying on browser dialogs.
- Renderer code no longer receives workbook import bridge methods.
- Existing databases with legacy import tables continue to open, back up,
  restore, export, and support permanent-deletion cleanup.
- ADR 015 and ADR 016 describe historical implementations only; this ADR
  supersedes them for current product behavior.
