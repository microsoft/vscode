// Re-export shared types for frontend use
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  size?: number;
  modified?: number;
}

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export type AIAction =
  | 'chat'
  | 'explain'
  | 'fix'
  | 'generate'
  | 'complete'
  | 'suggest-terminal';

export interface AIChatRequest {
  messages: AIMessage[];
  context?: string;
  selectedCode?: string;
  action?: AIAction;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: 'on' | 'off';
  minimap: boolean;
  autoSave: boolean;
  autoSaveDelay: number;
  terminalFontSize: number;
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
  sidebarWidth: number;
  terminalHeight: number;
  aiPanelWidth: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened: number;
  created: number;
}

export interface SearchResult {
  filePath: string;
  line: number;
  column: number;
  match: string;
  context: string;
}

export type SidebarView = 'explorer' | 'search' | 'ai' | 'settings';

export type PanelView = 'terminal' | 'output' | 'problems';

// Electron API type for window.electronAPI
export interface ElectronAPI {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;
  listFiles: (dirPath: string) => Promise<FileEntry[]>;
  createFile: (filePath: string, content?: string) => Promise<void>;
  searchFiles: (rootPath: string, query: string, options?: Record<string, unknown>) => Promise<SearchResult[]>;
  createDirectory: (dirPath: string) => Promise<void>;
  deleteDirectory: (dirPath: string) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  createTerminal: (id: string, cwd?: string) => Promise<void>;
  writeTerminal: (id: string, data: string) => Promise<void>;
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>;
  killTerminal: (id: string) => Promise<void>;
  onTerminalData: (callback: (id: string, data: string) => void) => () => void;
  aiChat: (request: AIChatRequest) => Promise<{ message: AIMessage }>;
  aiComplete: (request: unknown) => Promise<{ suggestion: string; confidence: number }>;
  aiStreamChat: (request: AIChatRequest) => Promise<string>;
  onAIStreamData: (callback: (streamId: string, data: string) => void) => () => void;
  onAIStreamEnd: (callback: (streamId: string) => void) => () => void;
  onAIStreamError: (callback: (streamId: string, error: string) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  listProjects: () => Promise<Project[]>;
  openProject: (path: string) => Promise<Project>;
  createProject: (name: string, path: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  getRecentProjects: () => Promise<Project[]>;
  getVersion: () => Promise<string>;
  quit: () => Promise<void>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  toggleDevTools: () => Promise<void>;
  openFileDialog: () => Promise<string | null>;
  openFolderDialog: () => Promise<string | null>;
  saveFileDialog: (defaultPath: string) => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
