import { BrowserWindow, screen } from 'electron';
import fs from 'fs';
import path from 'path';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

export function setupWindowState(win: BrowserWindow, storagePath: string) {
  const stateFilePath = path.join(storagePath, 'window-state.json');

  const loadState = (): WindowState => {
    try {
      if (fs.existsSync(stateFilePath)) {
        return JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load window state:', e);
    }
    return { width: 1400, height: 900 };
  };

  const saveState = () => {
    try {
      const bounds = win.getBounds();
      const state: WindowState = {
        ...bounds,
        isMaximized: win.isMaximized(),
      };
      fs.writeFileSync(stateFilePath, JSON.stringify(state), 'utf8');
    } catch (e) {
      console.error('Failed to save window state:', e);
    }
  };

  const state = loadState();

  // Validate state (ensure window is within visible screen bounds)
  const area = screen.getDisplayMatching(state as any).workArea;
  if (state.x !== undefined && state.y !== undefined) {
    if (
      state.x < area.x ||
      state.y < area.y ||
      state.x + state.width > area.x + area.width ||
      state.y + state.height > area.y + area.height
    ) {
      state.x = undefined;
      state.y = undefined;
    }
  }

  win.setBounds({
    width: state.width || 1400,
    height: state.height || 900,
    x: state.x,
    y: state.y,
  });

  if (state.isMaximized) {
    win.maximize();
  }

  win.on('resize', saveState);
  win.on('move', saveState);
  win.on('close', saveState);
}
