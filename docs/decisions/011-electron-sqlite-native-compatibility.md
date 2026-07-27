# ADR 011: Electron and SQLite Native Compatibility

## Status

Accepted

## Context

better-sqlite3 is a native module. Node 24 and Electron use different native
module ABIs, and the development workstation does not have Python/C++ compilation
tooling.

## Decision

Use Electron 41.10.3 with better-sqlite3 12.10.0 because this pairing has official
Windows x64 prebuilt binaries. Commands that execute SQLite under Node restore
the Node prebuild. Electron development and end-to-end commands install the
Electron prebuild through the package's prebuild installer.

## Consequences

- Development and tests do not require a local compiler toolchain.
- Native preparation commands may emit upstream deprecation warnings.
- Electron and better-sqlite3 upgrades must be reviewed as a compatible pair.
- Packaging remains deferred and will require its own native-module validation.
