import { BrowserWindow, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupWindowState } from './window-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createWindow(isDev: boolean): BrowserWindow {
  const win = new BrowserWindow({
    minWidth: 800,
    minHeight: 600,
    title: 'AI Studio',
    backgroundColor: '#1e1e2e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setupWindowState(win, app.getPath('userData'));

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  return win;
}
