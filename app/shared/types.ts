// File system types
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  size?: number;
  modified?: number;
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
}

// Editor types
export interface EditorTab {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
  cursorPosition?: CursorPosition;
}

export interface CursorPosition {
  line: number;
  column: number;
}

// AI types
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  codeBlocks?: CodeBlock[];
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

export interface AICompletionRequest {
  prompt: string;
  context: string;
  language: string;
  cursorPosition: CursorPosition;
}

export interface AICompletionResponse {
  suggestion: string;
  confidence: number;
}

export interface AIChatRequest {
  messages: AIMessage[];
  context?: string;
  selectedCode?: string;
  action?: AIAction;
}

export type AIAction =
  | 'chat'
  | 'explain'
  | 'fix'
  | 'generate'
  | 'complete'
  | 'suggest-terminal';

export interface AIChatResponse {
  message: AIMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Project types
export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened: number;
  created: number;
}

// Settings types
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

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  tabSize: 2,
  wordWrap: 'off',
  minimap: true,
  autoSave: true,
  autoSaveDelay: 1000,
  terminalFontSize: 13,
  aiProvider: 'openai',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  aiBaseUrl: 'https://api.openai.com/v1',
  sidebarWidth: 260,
  terminalHeight: 250,
  aiPanelWidth: 380,
};

// Auth types
export interface User {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
}

// Usage tracking
export interface UsageRecord {
  id: string;
  userId: string;
  action: string;
  details: string;
  timestamp: number;
}

// IPC Channel names
export const IPC_CHANNELS = {
  // File operations
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',
  FILE_RENAME: 'file:rename',
  FILE_LIST: 'file:list',
  FILE_CREATE: 'file:create',
  FILE_SEARCH: 'file:search',
  FILE_WATCH: 'file:watch',

  // Directory operations
  DIR_CREATE: 'dir:create',
  DIR_DELETE: 'dir:delete',
  DIR_SELECT: 'dir:select',

  // Terminal operations
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_DATA: 'terminal:data',

  // AI operations
  AI_CHAT: 'ai:chat',
  AI_COMPLETE: 'ai:complete',
  AI_STREAM: 'ai:stream',
  AI_STREAM_DATA: 'ai:stream-data',
  AI_STREAM_END: 'ai:stream-end',
  AI_STREAM_ERROR: 'ai:stream-error',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',

  // Projects
  PROJECT_LIST: 'project:list',
  PROJECT_OPEN: 'project:open',
  PROJECT_CREATE: 'project:create',
  PROJECT_DELETE: 'project:delete',
  PROJECT_RECENT: 'project:recent',

  // App
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',
  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_TOGGLE_DEVTOOLS: 'app:toggle-devtools',

  // Dialog
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_OPEN_FOLDER: 'dialog:open-folder',
  DIALOG_SAVE_FILE: 'dialog:save-file',
} as const;

// Search types
export interface SearchResult {
  filePath: string;
  line: number;
  column: number;
  match: string;
  context: string;
}

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  include?: string;
  exclude?: string;
}
