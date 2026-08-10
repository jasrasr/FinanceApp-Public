# ADR 036: Configurable Data Locations and Portable Restore

## Status

Accepted for version 1.3.0.

## Decision

Persist backup and export folders in SQLite application settings. Keep the live
database in the existing local user-data path. All folder/file selection,
copying, validation, and opening operations remain in the Electron main process
behind typed purpose-specific IPC methods.

Backups may be stored in OneDrive or removable storage. A portable restore first
validates the selected SQLite backup, copies it into the configured managed
backup folder, and leaves the source unchanged. Location migration validates
each copied backup before deleting originals. Automatic retention applies only
to automatic backups; manual, imported, and pre-restore backups remain protected.

Two computers must not edit independent copies expecting merge. Move work by
creating a backup, allowing OneDrive synchronization, restoring on the other
computer, and continuing there.
