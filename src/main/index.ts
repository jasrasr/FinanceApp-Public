import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabaseContext } from './database/connection';
import { DatabaseMigrationError } from './database/connection';
import { initializeApplicationDatabase } from './database/database-startup';
import { resolveApplicationDatabasePath } from './database/database-path';
import {
  registerDebtIpcHandlers,
  removeDebtIpcHandlers,
} from './ipc/debt-ipc-handlers';
import { createTrustedSenderValidator } from './ipc/trusted-sender';
import { createDataManagementService } from './services/data-management-service';
import { createDebtMaintenanceService } from './services/debt-maintenance-service';
import { writeStartupDiagnostics } from './startup-diagnostics';

const rendererFile = join(__dirname, '../renderer/index.html');

const trustedRendererLocation = (): string =>
  process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(rendererFile).toString();

const selectFolder = (title: string): string | null => {
  const result = dialog.showOpenDialogSync({
    title,
    properties: ['openDirectory', 'createDirectory'],
  });

  return result?.[0] ?? null;
};

const selectBackupFile = (): string | null => {
  const result = dialog.showOpenDialogSync({
    title: 'Select Debt Tracker backup',
    properties: ['openFile'],
    filters: [{ name: 'Debt Tracker backup', extensions: ['sqlite3'] }],
  });
  return result?.[0] ?? null;
};

const createWindow = (): BrowserWindow => {
  const mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    height: 800,
    minHeight: 640,
    minWidth: 960,
    show: false,
    title: 'Debt Tracker',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webSecurity: true,
    },
    width: 1280,
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== trustedRendererLocation()) {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(rendererFile);
  }

  return mainWindow;
};

let databaseContext: DatabaseContext | undefined;
let debtMaintenanceService: ReturnType<typeof createDebtMaintenanceService> | undefined;

const applyTestUserDataOverride = (): void => {
  const override = process.env.DEBT_TRACKER_TEST_USER_DATA_DIR;

  if (override) {
    if (process.env.DEBT_TRACKER_TEST_MODE !== '1') {
      throw new Error('Test user-data override requires explicit test mode.');
    }

    app.setPath('userData', override);
  }
};

const startApplication = async (): Promise<void> => {
  applyTestUserDataOverride();
  await app.whenReady();
  const userDataDirectory = app.getPath('userData');
  const applicationRootDirectory = app.getAppPath();
  const migrationsDirectory = join(applicationRootDirectory, 'drizzle');
  const databasePath = resolveApplicationDatabasePath(
    userDataDirectory,
    applicationRootDirectory,
  );
  const backupRootDirectory = join(userDataDirectory, 'backups');
  const exportRootDirectory =
    process.env.DEBT_TRACKER_TEST_EXPORT_DIR &&
    process.env.DEBT_TRACKER_TEST_MODE === '1'
      ? process.env.DEBT_TRACKER_TEST_EXPORT_DIR
      : join(userDataDirectory, 'exports');

  const reopenDatabaseContext = (): void => {
    databaseContext = initializeApplicationDatabase({
      userDataDirectory,
      applicationRootDirectory,
      migrationsDirectory,
    });
    const nextDebtMaintenanceService = createDebtMaintenanceService({
      database: databaseContext.database,
    });
    if (debtMaintenanceService) {
      Object.assign(debtMaintenanceService, nextDebtMaintenanceService);
    } else {
      debtMaintenanceService = nextDebtMaintenanceService;
    }
  };

  try {
    reopenDatabaseContext();
    writeStartupDiagnostics({
      applicationRootDirectory,
      backupRootDirectory,
      databasePath,
      isPackaged: app.isPackaged,
      status: 'ok',
      userDataDirectory,
    });
  } catch (error) {
    writeStartupDiagnostics({
      applicationRootDirectory,
      backupRootDirectory,
      databasePath,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      isPackaged: app.isPackaged,
      migrationFailure:
        error instanceof DatabaseMigrationError ? error.details : undefined,
      status: 'database_initialization_failed',
      userDataDirectory,
    });
    console.error(
      'Debt Tracker database initialization failed. See startup diagnostics in the user-data directory.',
    );
    dialog.showErrorBox(
      'Debt Tracker could not start',
      'The local database could not be initialized or migrated. No changes were made through the application.',
    );
    app.quit();
    return;
  }

  const service = debtMaintenanceService;
  if (!service || !databaseContext) {
    throw new Error('Debt Tracker database service was not initialized.');
  }
  const dataManagementService = createDataManagementService({
    applicationRootDirectory,
    backupRootDirectory,
    exportRootDirectory,
    databasePath,
    getContext: () => {
      if (!databaseContext) throw new Error('Database context is not available.');
      return databaseContext;
    },
    getDashboard: () => {
      if (!debtMaintenanceService) throw new Error('Debt service is not available.');
      return debtMaintenanceService.getDashboard({});
    },
    getReports: () => {
      if (!debtMaintenanceService) throw new Error('Debt service is not available.');
      return debtMaintenanceService.getDebtReports({
        startDate: null,
        endDate: null,
        debtId: null,
        ownerEntity: null,
        debtType: null,
        status: null,
      });
    },
    reopenContext: reopenDatabaseContext,
    openBackupFolder: (directory) => {
      void shell.openPath(directory);
      return true;
    },
  });
  void dataManagementService.createAutomaticBackup('startup').catch((error) => {
    const detail =
      error instanceof Error ? error.message : 'Unknown automatic backup error.';
    console.error(`Debt Tracker automatic backup failed: ${detail}`);
  });
  registerDebtIpcHandlers(
    ipcMain,
    service,
    dataManagementService,
    createTrustedSenderValidator(trustedRendererLocation()),
    { selectFolder, selectBackupFile },
  );
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
};

void startApplication();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  removeDebtIpcHandlers(ipcMain);
  databaseContext?.close();
  databaseContext = undefined;
});
