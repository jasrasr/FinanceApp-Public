# ADR 007: Typed Debt IPC Contracts

## Status

Accepted

## Context

The sandboxed renderer needs debt-maintenance capabilities without receiving raw
Electron, database, SQL, Node, or filesystem access.

## Decision

Expose seven fixed preload operations: list, get, create, update, add term,
archive, and restore. Shared TypeScript contracts and Zod schemas define every
request, response DTO, and structured application error.

The preload validates requests before invocation and validates responses before
exposure. Main-process handlers repeat request validation, validate service
output, and reject senders that are not the configured local application main
frame.

## Consequences

- The renderer cannot select arbitrary channels.
- Database rows and Drizzle objects remain in the main process.
- Business rules remain in the application service rather than handlers.
- Contract changes require coordinated main, preload, renderer, and test updates.
