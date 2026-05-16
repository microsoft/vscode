import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // File operations
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  listFiles: (dirPath: string) => Promise<unknown>;
  createFile: (filePath: string, content?: string) => Promise<void>;
  searchFiles: (rootPath: string, query: string, options?: unknown) => Promise<unknown>;

  // Directory operations
  createDirectory: (dirPath: string) => Promise<void>;
  deleteDirectory: (dirPath: string) => Promise<void>;
  selectDirectory: () => Promise<string | null>;

  // Terminal operations
  createTerminal: (id: string, cwd?: string) => Promise<void>;
  writeTerminal: (id: string, data: string) => Promise<void>;
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>;
  killTerminal: (id: string) => Promise<void>;
  onTerminalData: (callback: (id: string, data: string) => void) => () => void;

  // AI operations
  aiChat: (request: unknown) => Promise<unknown>;
  aiComplete: (request: unknown) => Promise<unknown>;
  aiStreamChat: (request: unknown) => Promise<string>;
  onAIStreamData: (callback: (streamId: string, data: string) => void) => () => void;
  onAIStreamEnd: (callback: (streamId: string) => void) => () => void;
  onAIStreamError: (callback: (streamId: string, error: string) => void) => () => void;

  // Settings
  getSettings: () => Promise<unknown>;
  setSettings: (settings: unknown) => Promise<void>;
  resetSettings: () => Promise<void>;

  // Projects
  listProjects: () => Promise<unknown>;
  openProject: (path: string) => Promise<unknown>;
  createProject: (name: string, path: string) => Promise<unknown>;
  deleteProject: (id: string) => Promise<void>;
  getRecentProjects: () => Promise<unknown>;

  // App
  getVersion: () => Promise<string>;
  quit: () => Promise<void>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  toggleDevTools: () => Promise<void>;

  // Dialogs
  openFileDialog: () => Promise<string | null>;
  openFolderDialog: () => Promise<string | null>;
  saveFileDialog: (defaultPath: string) => Promise<string | null>;
}

const api: ElectronAPI = {
  // File operations
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('file:rename', oldPath, newPath),
  listFiles: (dirPath) => ipcRenderer.invoke('file:list', dirPath),
  createFile: (filePath, content) => ipcRenderer.invoke('file:create', filePath, content),
  searchFiles: (rootPath, query, options) => ipcRenderer.invoke('file:search', rootPath, query, options),

  // Directory operations
  createDirectory: (dirPath) => ipcRenderer.invoke('dir:create', dirPath),
  deleteDirectory: (dirPath) => ipcRenderer.invoke('dir:delete', dirPath),
  selectDirectory: () => ipcRenderer.invoke('dialog:open-folder'),

  // Terminal operations
  createTerminal: (id, cwd) => ipcRenderer.invoke('terminal:create', id, cwd),
  writeTerminal: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  killTerminal: (id) => ipcRenderer.invoke('terminal:kill', id),
  onTerminalData: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) => callback(id, data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },

  // AI operations
  aiChat: (request) => ipcRenderer.invoke('ai:chat', request),
  aiComplete: (request) => ipcRenderer.invoke('ai:complete', request),
  aiStreamChat: (request) => ipcRenderer.invoke('ai:stream', request),
  onAIStreamData: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, streamId: string, data: string) => callback(streamId, data);
    ipcRenderer.on('ai:stream-data', handler);
    return () => ipcRenderer.removeListener('ai:stream-data', handler);
  },
  onAIStreamEnd: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, streamId: string) => callback(streamId);
    ipcRenderer.on('ai:stream-end', handler);
    return () => ipcRenderer.removeListener('ai:stream-end', handler);
  },
  onAIStreamError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, streamId: string, error: string) => callback(streamId, error);
    ipcRenderer.on('ai:stream-error', handler);
    return () => ipcRenderer.removeListener('ai:stream-error', handler);
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),

  // Projects
  listProjects: () => ipcRenderer.invoke('project:list'),
  openProject: (projectPath) => ipcRenderer.invoke('project:open', projectPath),
  createProject: (name, projectPath) => ipcRenderer.invoke('project:create', name, projectPath),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  getRecentProjects: () => ipcRenderer.invoke('project:recent'),

  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  quit: () => ipcRenderer.invoke('app:quit'),
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  toggleDevTools: () => ipcRenderer.invoke('app:toggle-devtools'),

  // Dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  saveFileDialog: (defaultPath) => ipcRenderer.invoke('dialog:save-file', defaultPath),
};

contextBridge.exposeInMainWorld('electronAPI', api);
