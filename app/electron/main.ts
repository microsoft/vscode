import { app, BrowserWindow, ipcMain, dialog, Menu, shell, crashReporter } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { autoUpdater } from 'electron-updater';
import { logger } from './logger.js';
import { registerFileHandlers } from './ipc-handlers.js';
import { createMenu } from './menu.js';
import { createWindow } from './window.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function setupAutoUpdater(): void {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for update...');
    mainWindow?.webContents.send('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    logger.info(`Update available: ${info.version}`);
    mainWindow?.webContents.send('updater:available', info);
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('Update not available.');
    mainWindow?.webContents.send('updater:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info(`Update downloaded: ${info.version}`);
    mainWindow?.webContents.send('updater:downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    logger.error('Auto-updater error:', err);
    mainWindow?.webContents.send('updater:error', err.message);
  });

  // Check for updates every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);

  // Initial check after 10 seconds
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);
}

async function init(): Promise<void> {
  logger.info(`Starting AI Studio v${app.getVersion()}`);

  // Configure crash reporter
  if (!isDev) {
    crashReporter.start({
      uploadToServer: false, // For solo founder, keep it local-only or use a service like Sentry later
    });
  }

  mainWindow = createWindow(isDev);

  registerFileHandlers(mainWindow);
  createMenu(mainWindow);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  setupAutoUpdater();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // App-level IPC handlers
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:minimize', () => mainWindow?.minimize());
  ipcMain.handle('app:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('app:toggle-devtools', () => {
    mainWindow?.webContents.toggleDevTools();
  });

  // Dialog handlers
  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Open Project Folder',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      title: 'Open File',
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:save-file', async (_event, defaultPath: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      title: 'Save File',
    });
    if (result.canceled) return null;
    return result.filePath;
  });

  // Auto-updater IPC handlers
  ipcMain.handle('updater:check', () => {
    if (!isDev) {
      return autoUpdater.checkForUpdates().catch(() => null);
    }
    return null;
  });
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle crashes
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logger.error(`Render process gone: ${details.reason} (${details.exitCode})`);
  });
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

app.on('child-process-gone', (event, details) => {
  logger.error(`Child process gone: ${details.type} ${details.reason} (${details.exitCode})`);
});

app.whenReady().then(init);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    init();
  }
});
