import BetterSqlite3 from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import type {
  CreateManualBackupRequest,
  DashboardDto,
  DataExportDto,
  DataManagementStatusDto,
  DeleteBackupRequest,
  DebtReportsDto,
  ExportDataRequest,
  GetDataManagementStatusRequest,
  RestoreBackupRequest,
} from '../../shared/debt-contracts';
import {
  createManualBackupRequestSchema,
  exportDataRequestSchema,
  getDataManagementStatusRequestSchema,
  restoreBackupRequestSchema,
} from '../../shared/debt-contracts';
import type { DatabaseContext } from '../database/connection';
import { ApplicationServiceError } from './application-error';

type BackupKind = 'manual' | 'automatic' | 'pre_restore';

interface BackupSummary {
  readonly id: string;
  readonly fileName: string;
  readonly kind: BackupKind;
  readonly createdAtUtc: string;
  readonly sizeBytes: number;
  readonly integrityStatus: 'valid' | 'invalid' | 'not_checked';
}

interface BackupOperation {
  readonly status: 'succeeded' | 'failed' | 'not_run';
  readonly message: string;
  readonly completedAtUtc: string | null;
  readonly backup: BackupSummary | null;
}

export interface DataManagementService {
  getDataManagementStatus(
    request: GetDataManagementStatusRequest,
  ): DataManagementStatusDto;
  createManualBackup(
    request: CreateManualBackupRequest,
  ): Promise<DataManagementStatusDto>;
  createAutomaticBackup(reason: 'startup' | 'pre_restore'): Promise<BackupSummary>;
  restoreBackup(request: RestoreBackupRequest): Promise<DataManagementStatusDto>;
  deleteBackup(request: DeleteBackupRequest): Promise<DataManagementStatusDto>;
  exportData(request: ExportDataRequest): DataExportDto;
}

export interface DataManagementServiceDependencies {
  readonly applicationRootDirectory: string;
  readonly backupRootDirectory: string;
  readonly databasePath: string;
  readonly createId?: () => string;
  readonly getContext: () => DatabaseContext;
  readonly getDashboard: () => DashboardDto;
  readonly getReports: () => DebtReportsDto;
  readonly now?: () => string;
  readonly reopenContext: () => void;
  readonly selectExportDirectory?: () => string | null;
}

const backupOperationNotRun: BackupOperation = {
  status: 'not_run',
  message: 'No operation has been run in this session.',
  completedAtUtc: null,
  backup: null,
};

const safeTimestamp = (timestamp: string): string =>
  timestamp.replaceAll(':', '').replaceAll('.', '-');

const isPathInside = (candidate: string, parent: string): boolean => {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return (
    relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
};

const createUniquePath = (directory: string, fileName: string): string => {
  const extension = extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  let candidate = join(directory, fileName);
  let suffix = 1;

  while (existsSync(candidate)) {
    candidate = join(directory, `${stem}-${suffix}${extension}`);
    suffix += 1;
  }

  return candidate;
};

const backupKindFromFileName = (fileName: string): BackupKind => {
  if (fileName.startsWith('manual-')) return 'manual';
  if (fileName.startsWith('pre-restore-')) return 'pre_restore';
  return 'automatic';
};

const validateDatabaseFile = (databasePath: string): void => {
  let sqlite: BetterSqlite3.Database | undefined;

  try {
    sqlite = new BetterSqlite3(databasePath, {
      fileMustExist: true,
      readonly: true,
    });
    const integrity = sqlite.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new Error('SQLite integrity check did not return ok.');
    }
    const foreignKeyRows = sqlite.pragma('foreign_key_check') as unknown[];
    if (foreignKeyRows.length > 0) {
      throw new Error('SQLite foreign-key check returned violations.');
    }
  } finally {
    sqlite?.close();
  }
};

const csvValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csvFromRows = (rows: readonly Record<string, unknown>[]): string => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (columns.length === 0) return '';
  return [
    columns.map(csvValue).join(','),
    ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(',')),
  ].join('\r\n');
};

const queryRows = (
  sqlite: BetterSqlite3.Database,
  sql: string,
): readonly Record<string, unknown>[] =>
  sqlite.prepare(sql).all() as readonly Record<string, unknown>[];

const insertAuditEvent = (
  context: DatabaseContext,
  input: {
    readonly id: string;
    readonly eventType: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly action: string;
    readonly occurredAtUtc: string;
    readonly source: 'system' | 'user';
    readonly summary: string;
    readonly afterMetadataJson?: string | null;
  },
): void => {
  context.sqlite
    .prepare(
      `insert into audit_events (
        id,
        event_type,
        entity_type,
        entity_id,
        action,
        occurred_at_utc,
        source,
        summary,
        before_metadata_json,
        after_metadata_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, null, ?)`,
    )
    .run(
      input.id,
      input.eventType,
      input.entityType,
      input.entityId,
      input.action,
      input.occurredAtUtc,
      input.source,
      input.summary,
      input.afterMetadataJson ?? null,
    );
};

const backupSummary = (
  filePath: string,
  integrityStatus: BackupSummary['integrityStatus'],
): BackupSummary => {
  const fileName = basename(filePath);
  const stats = statSync(filePath);
  const fileTimestamp = /^.*-(\d{4}-\d{2}-\d{2}T\d{6}-\d{3}Z)\.sqlite3$/.exec(
    fileName,
  )?.[1];
  const createdAtUtc = fileTimestamp
    ? fileTimestamp.replace(/T(\d{2})(\d{2})(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z')
    : stats.birthtime.toISOString();
  return {
    id: fileName,
    fileName,
    kind: backupKindFromFileName(fileName),
    createdAtUtc,
    sizeBytes: stats.size,
    integrityStatus,
  };
};

const listBackups = (backupRootDirectory: string): readonly BackupSummary[] => {
  if (!existsSync(backupRootDirectory)) return [];

  return readdirSync(backupRootDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.sqlite3') &&
        (entry.name.startsWith('manual-') ||
          entry.name.startsWith('auto-') ||
          entry.name.startsWith('pre-restore-')),
    )
    .map((entry) => {
      const filePath = join(backupRootDirectory, entry.name);
      try {
        validateDatabaseFile(filePath);
        return backupSummary(filePath, 'valid');
      } catch {
        return backupSummary(filePath, 'invalid');
      }
    })
    .sort((left, right) => right.createdAtUtc.localeCompare(left.createdAtUtc));
};

const localDate = (timestamp: string): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addLocalCalendarDays = (dateText: string, days: number): string => {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
};

const removeBackupFiles = (backupRootDirectory: string, fileName: string): void => {
  for (const candidate of [
    join(backupRootDirectory, fileName),
    join(backupRootDirectory, `${fileName}-wal`),
    join(backupRootDirectory, `${fileName}-shm`),
  ]) {
    if (existsSync(candidate)) rmSync(candidate, { force: true });
  }
};

const writeCsvFile = (
  directory: string,
  fileName: string,
  rows: readonly Record<string, unknown>[],
): number => {
  const path = createUniquePath(directory, fileName);
  const content = csvFromRows(rows);
  writeFileSync(path, `${content}\r\n`, { encoding: 'utf8', flag: 'wx' });
  return 1;
};

export const createDataManagementService = ({
  applicationRootDirectory,
  backupRootDirectory,
  createId = randomUUID,
  databasePath,
  getContext,
  getDashboard,
  getReports,
  now = () => new Date().toISOString(),
  reopenContext,
  selectExportDirectory,
}: DataManagementServiceDependencies): DataManagementService => {
  let lastBackup: BackupOperation = backupOperationNotRun;
  let lastRestore: BackupOperation = backupOperationNotRun;
  const activeBackupIds = new Set<string>();

  const ensureBackupRoot = (): void => {
    if (isPathInside(backupRootDirectory, applicationRootDirectory)) {
      throw new ApplicationServiceError(
        'validation',
        'Backup directory must remain outside the application repository.',
      );
    }
    mkdirSync(backupRootDirectory, { recursive: true });
  };

  const status = (): DataManagementStatusDto => {
    ensureBackupRoot();
    const backups = listBackups(backupRootDirectory);
    return {
      backupDirectoryDisplayPath: backupRootDirectory,
      lastSuccessfulBackupAtUtc:
        backups.find((backup) => backup.integrityStatus === 'valid')?.createdAtUtc ??
        null,
      availableBackups: [...backups],
      lastBackup,
      lastRestore,
    };
  };

  const validBackups = (): readonly BackupSummary[] =>
    listBackups(backupRootDirectory).filter(
      (backup) => backup.integrityStatus === 'valid',
    );

  const assertCanDeleteBackup = (backup: BackupSummary): void => {
    if (activeBackupIds.has(backup.id)) {
      throw new ApplicationServiceError(
        'conflict',
        'This backup is currently being validated or restored.',
      );
    }
    if (
      backup.integrityStatus === 'valid' &&
      validBackups().filter((candidate) => candidate.id !== backup.id).length === 0
    ) {
      throw new ApplicationServiceError(
        'conflict',
        'At least one valid backup must be retained.',
      );
    }
  };

  const backupForId = (backupId: string): BackupSummary => {
    const backupFilePath = join(backupRootDirectory, backupId);
    if (
      !isPathInside(backupFilePath, backupRootDirectory) ||
      !existsSync(backupFilePath)
    ) {
      throw new ApplicationServiceError(
        'validation',
        'Selected backup is not available.',
      );
    }
    const backup = listBackups(backupRootDirectory).find(
      (candidate) => candidate.id === basename(backupFilePath),
    );
    if (!backup) {
      throw new ApplicationServiceError(
        'validation',
        'Selected backup is not available.',
      );
    }
    return backup;
  };

  const cleanupAutomaticBackups = (): void => {
    ensureBackupRoot();
    const todayLocal = localDate(now());
    const cutoffLocal = addLocalCalendarDays(todayLocal, -5);
    const automatic = listBackups(backupRootDirectory).filter(
      (backup) =>
        backup.kind === 'automatic' &&
        localDate(backup.createdAtUtc) < cutoffLocal &&
        !activeBackupIds.has(backup.id),
    );
    const removed: string[] = [];

    for (const backup of automatic) {
      try {
        assertCanDeleteBackup(backup);
        removeBackupFiles(backupRootDirectory, backup.fileName);
        removed.push(backup.fileName);
      } catch (error) {
        if (error instanceof ApplicationServiceError && error.code === 'conflict')
          break;
        throw error;
      }
    }

    if (removed.length > 0) {
      insertAuditEvent(getContext(), {
        id: createId(),
        eventType: 'database_backup_retention_cleaned',
        entityType: 'database_backup',
        entityId: 'automatic-backup-retention',
        action: 'delete',
        occurredAtUtc: now(),
        source: 'system',
        summary: `Removed ${removed.length} expired automatic backup(s).`,
        afterMetadataJson: JSON.stringify({ removedCount: removed.length }),
      });
    }
  };

  const createBackup = async (
    kind: BackupKind,
    source: 'system' | 'user',
  ): Promise<BackupSummary> => {
    ensureBackupRoot();
    const timestamp = now();
    const prefix =
      kind === 'manual' ? 'manual' : kind === 'pre_restore' ? 'pre-restore' : 'auto';
    const filePath = createUniquePath(
      backupRootDirectory,
      `${prefix}-${safeTimestamp(timestamp)}.sqlite3`,
    );
    const context = getContext();
    context.sqlite.pragma('wal_checkpoint(PASSIVE)');
    await context.sqlite.backup(filePath);
    activeBackupIds.add(basename(filePath));
    try {
      validateDatabaseFile(filePath);
    } finally {
      activeBackupIds.delete(basename(filePath));
    }

    const summary = backupSummary(filePath, 'valid');
    insertAuditEvent(context, {
      id: createId(),
      eventType:
        kind === 'pre_restore'
          ? 'database_pre_restore_backup_created'
          : 'database_backup_created',
      entityType: 'database_backup',
      entityId: summary.id,
      action: 'create',
      occurredAtUtc: timestamp,
      source,
      summary:
        kind === 'pre_restore'
          ? 'Created a pre-restore safety backup.'
          : 'Created and validated a SQLite backup.',
      afterMetadataJson: JSON.stringify({ kind, fileName: summary.fileName }),
    });
    lastBackup = {
      status: 'succeeded',
      message: 'Backup completed and passed SQLite integrity checks.',
      completedAtUtc: timestamp,
      backup: summary,
    };
    return summary;
  };

  const restoreFromFile = async (backupFilePath: string): Promise<BackupSummary> => {
    const backupId = basename(backupFilePath);
    activeBackupIds.add(backupId);
    try {
      validateDatabaseFile(backupFilePath);
    } finally {
      activeBackupIds.delete(backupId);
    }
    const safetyBackup = await createBackup('pre_restore', 'system');
    const restoreTimestamp = now();
    const tempRestorePath = createUniquePath(
      dirname(databasePath),
      `restore-${safeTimestamp(restoreTimestamp)}.sqlite3`,
    );
    let source: BetterSqlite3.Database | undefined;
    let databaseClosed = false;
    const movedFiles: { readonly from: string; readonly to: string }[] = [];

    try {
      activeBackupIds.add(backupId);
      source = new BetterSqlite3(backupFilePath, {
        fileMustExist: true,
        readonly: true,
      });
      await source.backup(tempRestorePath);
      validateDatabaseFile(tempRestorePath);
      source.close();
      source = undefined;
      activeBackupIds.delete(backupId);

      getContext().close();
      databaseClosed = true;

      for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
        if (existsSync(path)) {
          const movedPath = createUniquePath(
            dirname(path),
            `${basename(path)}.before-restore`,
          );
          renameSync(path, movedPath);
          movedFiles.push({ from: movedPath, to: path });
        }
      }

      renameSync(tempRestorePath, databasePath);
      reopenContext();
      validateDatabaseFile(databasePath);

      insertAuditEvent(getContext(), {
        id: createId(),
        eventType: 'database_restored',
        entityType: 'database_backup',
        entityId: basename(backupFilePath),
        action: 'restore',
        occurredAtUtc: restoreTimestamp,
        source: 'user',
        summary: 'Restored the database from a validated backup.',
        afterMetadataJson: JSON.stringify({
          restoredBackupFileName: basename(backupFilePath),
          safetyBackupFileName: safetyBackup.fileName,
        }),
      });

      for (const moved of movedFiles) rmSync(moved.from, { force: true });
      const restored = backupSummary(backupFilePath, 'valid');
      lastRestore = {
        status: 'succeeded',
        message: 'Restore completed from a validated backup.',
        completedAtUtc: restoreTimestamp,
        backup: restored,
      };
      return restored;
    } catch (error) {
      source?.close();
      activeBackupIds.delete(backupId);
      rmSync(tempRestorePath, { force: true });

      if (!existsSync(databasePath) && movedFiles.length > 0) {
        for (const moved of movedFiles.reverse()) {
          if (existsSync(moved.from)) renameSync(moved.from, moved.to);
        }
      }

      try {
        if (databaseClosed) reopenContext();
        insertAuditEvent(getContext(), {
          id: createId(),
          eventType: 'database_restore_failed',
          entityType: 'database_backup',
          entityId: basename(backupFilePath),
          action: 'restore_failed',
          occurredAtUtc: now(),
          source: 'user',
          summary: 'Database restore failed; existing database remains usable.',
          afterMetadataJson: JSON.stringify({
            backupFileName: basename(backupFilePath),
          }),
        });
      } catch {
        // Preserve the original restore failure for the caller.
      }

      lastRestore = {
        status: 'failed',
        message: 'Restore failed. The existing database remains usable.',
        completedAtUtc: now(),
        backup: null,
      };
      throw new ApplicationServiceError(
        'internal',
        error instanceof Error ? error.message : 'Restore failed.',
      );
    }
  };

  const exportData = (request: ExportDataRequest): DataExportDto => {
    const parsed = exportDataRequestSchema.parse(request);
    if (parsed.format !== 'csv') {
      throw new ApplicationServiceError('validation', 'Only CSV export is configured.');
    }
    const selectedDirectory = selectExportDirectory?.() ?? null;
    if (!selectedDirectory) {
      return {
        status: 'cancelled',
        exportedAtUtc: null,
        exportDirectoryDisplayPath: null,
        fileCount: 0,
        format: 'csv',
        message: 'Export was cancelled.',
      };
    }
    if (isPathInside(selectedDirectory, applicationRootDirectory)) {
      throw new ApplicationServiceError(
        'validation',
        'Exports must be saved outside the application repository.',
      );
    }

    const timestamp = now();
    const exportDirectory = createUniquePath(
      selectedDirectory,
      `debt-tracker-export-${safeTimestamp(timestamp)}`,
    );
    mkdirSync(exportDirectory, { recursive: true });

    const sqlite = getContext().sqlite;
    let fileCount = 0;
    fileCount += writeCsvFile(
      exportDirectory,
      'actual-debts.csv',
      queryRows(
        sqlite,
        `select id, name, creditor, debt_type, purpose, status,
          original_principal_cents, origination_date, maturity_date,
          minimum_payment_cents, payment_frequency, credit_limit_cents,
          collateral_description, tax_category, deductible_percentage_bps,
          archived_at_utc, created_at_utc, updated_at_utc,
          'actual/opening obligation facts' as value_basis
        from debts order by name`,
      ),
    );
    fileCount += writeCsvFile(
      exportDirectory,
      'actual-effective-dated-terms.csv',
      queryRows(
        sqlite,
        "select *, 'actual/effective-dated terms' as value_basis from debt_terms order by debt_id, effective_start_date",
      ),
    );
    fileCount += writeCsvFile(
      exportDirectory,
      'actual-posted-transactions.csv',
      queryRows(
        sqlite,
        `select id, debt_id, transaction_type, effective_date as transaction_date,
          total_amount_cents, status, description, reversal_of_transaction_id,
          supersedes_transaction_id, created_at_utc, updated_at_utc,
          'actual/posted ledger activity' as value_basis
        from debt_transactions order by effective_date, created_at_utc`,
      ),
    );
    fileCount += writeCsvFile(
      exportDirectory,
      'actual-transaction-allocations.csv',
      queryRows(
        sqlite,
        `select id, transaction_id,
          case when allocation_type = 'extra_principal' then 'principal' else allocation_type end as allocation_type,
          amount_cents, notes, created_at_utc, updated_at_utc,
          case
            when allocation_type = 'escrow' then 'actual/posted escrow allocation detail'
            else 'actual/posted allocation detail'
          end as value_basis
        from transaction_allocations
        where allocation_type <> 'other'
        order by transaction_id, allocation_type`,
      ),
    );
    fileCount += writeCsvFile(
      exportDirectory,
      'confirmed-balance-snapshots.csv',
      queryRows(
        sqlite,
        "select *, 'confirmed/external balance evidence' as value_basis from balance_snapshots order by effective_date",
      ),
    );
    fileCount += writeCsvFile(
      exportDirectory,
      'actual-balance-reconciliations.csv',
      queryRows(
        sqlite,
        "select *, 'actual/reconciliation comparison' as value_basis from balance_reconciliations order by statement_date",
      ),
    );
    fileCount += writeCsvFile(
      exportDirectory,
      'scenario-payoff-scenarios.csv',
      queryRows(
        sqlite,
        "select *, 'scenario/saved projection result' as value_basis from payoff_scenarios order by created_at_utc",
      ),
    );

    if (parsed.includeReports) {
      const dashboard = getDashboard();
      fileCount += writeCsvFile(exportDirectory, 'calculated-dashboard-summary.csv', [
        {
          value_basis: 'calculated/dashboard metric',
          effective_date: dashboard.effectiveDate,
          ytd_start_date: dashboard.yearToDateStartDate,
          active_debt_count: dashboard.activeDebtCount,
          ...dashboard.totals,
        },
      ]);

      const reports = getReports();
      fileCount += writeCsvFile(
        exportDirectory,
        'calculated-report-monthly-rollforward.csv',
        reports.monthlyRollforward.rows.map((row) => ({
          value_basis: 'calculated/monthly rollforward',
          ...row,
        })),
      );
      fileCount += writeCsvFile(
        exportDirectory,
        'calculated-report-annual-rollforward.csv',
        reports.annualRollforward.rows.map((row) => ({
          value_basis: 'calculated/annual rollforward',
          ...row,
        })),
      );
      fileCount += writeCsvFile(
        exportDirectory,
        'calculated-report-balance-history.csv',
        reports.balanceHistory.rows.map((row) => ({
          value_basis: 'calculated balance with confirmed snapshot shown separately',
          ...row,
        })),
      );
      fileCount += writeCsvFile(
        exportDirectory,
        'scenario-report-actual-versus-plan.csv',
        reports.actualVersusPlanVariance.rows.map((row) => ({
          value_basis: 'scenario variance compared with actual ledger activity',
          ...row,
          warnings: row.warnings.join('; '),
        })),
      );
      fileCount += writeCsvFile(
        exportDirectory,
        'exceptions-report-reconciliation-data-quality.csv',
        reports.reconciliationAndDataQuality.rows.map((row) => ({
          value_basis: 'exception/data quality',
          ...row,
        })),
      );
    }

    insertAuditEvent(getContext(), {
      id: createId(),
      eventType: 'data_export_created',
      entityType: 'data_export',
      entityId: basename(exportDirectory),
      action: 'export',
      occurredAtUtc: timestamp,
      source: 'user',
      summary: 'Created a data export outside the application repository.',
      afterMetadataJson: JSON.stringify({ format: parsed.format, fileCount }),
    });

    return {
      status: 'succeeded',
      exportedAtUtc: timestamp,
      exportDirectoryDisplayPath: exportDirectory,
      fileCount,
      format: 'csv',
      message: 'Export completed.',
    };
  };

  return {
    getDataManagementStatus: (request) => {
      getDataManagementStatusRequestSchema.parse(request);
      return status();
    },
    createManualBackup: async (request) => {
      createManualBackupRequestSchema.parse(request);
      try {
        await createBackup('manual', 'user');
      } catch (error) {
        lastBackup = {
          status: 'failed',
          message: error instanceof Error ? error.message : 'Backup failed.',
          completedAtUtc: now(),
          backup: null,
        };
        throw error;
      }
      return status();
    },
    createAutomaticBackup: async (reason) => {
      if (reason === 'pre_restore') return createBackup('pre_restore', 'system');
      ensureBackupRoot();
      const todayLocal = localDate(now());
      const successfulAutomaticToday = listBackups(backupRootDirectory).find(
        (backup) =>
          backup.kind === 'automatic' &&
          backup.integrityStatus === 'valid' &&
          localDate(backup.createdAtUtc) === todayLocal,
      );
      if (successfulAutomaticToday) {
        cleanupAutomaticBackups();
        return successfulAutomaticToday;
      }
      const backup = await createBackup('automatic', 'system');
      cleanupAutomaticBackups();
      return backup;
    },
    restoreBackup: async (request) => {
      const parsed = restoreBackupRequestSchema.parse(request);
      ensureBackupRoot();
      const backup = backupForId(parsed.backupId);
      await restoreFromFile(join(backupRootDirectory, backup.fileName));
      return status();
    },
    deleteBackup: async (request) => {
      const parsed = restoreBackupRequestSchema.parse(request);
      ensureBackupRoot();
      const summary = backupForId(parsed.backupId);
      assertCanDeleteBackup(summary);
      try {
        removeBackupFiles(backupRootDirectory, summary.fileName);
        insertAuditEvent(getContext(), {
          id: createId(),
          eventType: 'database_backup_deleted',
          entityType: 'database_backup',
          entityId: summary.id,
          action: 'delete',
          occurredAtUtc: now(),
          source: 'user',
          summary: 'Deleted a validated local database backup.',
          afterMetadataJson: JSON.stringify({
            kind: summary.kind,
            createdAtUtc: summary.createdAtUtc,
          }),
        });
      } catch (error) {
        throw new ApplicationServiceError(
          'internal',
          error instanceof Error ? error.message : 'Backup deletion failed.',
        );
      }
      return status();
    },
    exportData,
  };
};
