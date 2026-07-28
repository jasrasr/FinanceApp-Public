import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabaseContext } from './database/connection';
import { initializeApplicationDatabase } from './database/database-startup';
import {
  registerDebtIpcHandlers,
  removeDebtIpcHandlers,
} from './ipc/debt-ipc-handlers';
import { createTrustedSenderValidator } from './ipc/trusted-sender';
import { createDebtMaintenanceService } from './services/debt-maintenance-service';

const rendererFile = join(__dirname, '../renderer/index.html');

const trustedRendererLocation = (): string =>
  process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(rendererFile).toString();

const selectWorkbookPath = (): string | null => {
  const result = dialog.showOpenDialogSync({
    title: 'Select workbook to stage for import',
    properties: ['openFile'],
    filters: [
      {
        name: 'Excel workbooks',
        extensions: ['xlsx'],
      },
    ],
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

  try {
    databaseContext = initializeApplicationDatabase({
      userDataDirectory: app.getPath('userData'),
      applicationRootDirectory: app.getAppPath(),
      migrationsDirectory: join(app.getAppPath(), 'drizzle'),
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Unknown database startup error.';
    console.error(`Debt Tracker database initialization failed: ${detail}`);
    dialog.showErrorBox(
      'Debt Tracker could not start',
      'The local database could not be initialized or migrated. No changes were made through the application.',
    );
    app.quit();
    return;
  }

  const service = createDebtMaintenanceService({
    database: databaseContext.database,
    selectWorkbookPath,
  });
  registerDebtIpcHandlers(
    ipcMain,
    service,
    createTrustedSenderValidator(trustedRendererLocation()),
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
