# ADR 020: Windows Packaging and Production Readiness

## Status

Accepted.

## Context

Debt Tracker is a Windows-first local Electron application with a native SQLite
dependency through better-sqlite3. Phase twelve requires a working Windows x64
installer and an installed application that runs independently of the source
repository, Node, npm, or development tools.

The package must not include personal financial data, development databases,
workbooks, backups, exports, logs, test fixtures, or generated installer
artifacts. Live data must remain under the Windows application user-data
location.

## Decision

Use electron-builder to create a Windows x64 NSIS installer.

Packaging commands generate the application icon, build Electron output, install
the better-sqlite3 prebuilt binary for the configured Electron runtime, and then
run electron-builder. The better-sqlite3 native `.node` binary and prebuilds are
unpacked from ASAR so SQLite can load in the installed Electron runtime.

The NSIS installer is per-user, allows installation-directory selection, creates
standard shortcuts, and does not delete application user data on uninstall.

Packaged contents explicitly include only compiled application output,
committed migrations, package metadata, and runtime dependencies. Packaging
excludes databases, workbooks, backups, exports, logs, test outputs, E2E tests,
documentation, and generated installer artifacts.

Startup diagnostics are written under user data with sanitized status and
location checks. They do not expose financial values, stack traces, raw database
paths, shell access, Git details, environment variables, or generic IPC to the
renderer.

## Consequences

- The installed application can launch without Node, npm, VS Code, or the source
  repository.
- better-sqlite3 remains compatible with Electron's ABI when the packaging
  scripts are followed.
- User databases and backups survive uninstall and same-path reinstall or
  upgrade because the app identifier and user-data path remain stable.
- The installer is unsigned. Windows may display SmartScreen or
  unknown-publisher warnings until a future code-signing process is approved.
- Packaged smoke tests are separate from the standard source validation gate
  because they produce installers and run OS-level install/uninstall behavior.
