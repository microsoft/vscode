import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AgentEvent,
  AppSettings,
  Attachment,
  AuthStatus,
  BackupResult,
  ComposeRequest,
  BackupStatus,
  ChatMessage,
  DesignExportResult,
  DesignInfo,
  LockStatus,
  McpServerEntry,
  McpTestResult,
  LoginEvent,
  PermissionDecision,
  PermissionModeUI,
  Artifact,
  ChatSearchHit,
  ExportRequest,
  ExportResult,
  GitStatus,
  ImportResult,
  MemoryItem,
  ObsidianVault,
  PlanUsage,
  Project,
  ProjectArtifactRef,
  ProjectContextUsage,
  RemoteSpawn,
  RemoteState,
  RewindPreview,
  RewindRequest,
  SendPayload,
  SessionMeta,
  SmartKnowledgeStatus,
  VaultStatus
} from '../shared/types'

/** Memory after a change, plus the updated project when it was project memory. */
type MemoryState = { items: MemoryItem[]; project?: Project }

const inv = <T>(ch: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(ch, ...args) as Promise<T>

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const fn = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api = {
  lockStatus: () => inv<LockStatus>('app:lockStatus'),
  resetData: () => inv<LockStatus>('app:resetData'),
  appInfo: () =>
    inv<{ version: string; platform: string; arch: string; electron: string; claudeBinary: string | null; userData: string; logFile: string }>('app:info'),

  authStatus: () => inv<AuthStatus>('auth:status'),
  login: () => inv<void>('auth:login'),
  loginInput: (text: string) => inv<void>('auth:loginInput', text),
  cancelLogin: () => inv<void>('auth:cancelLogin'),
  logout: () => inv<void>('auth:logout'),
  onLogin: (cb: (e: LoginEvent) => void) => on<LoginEvent>('login:event', cb),

  getSettings: () => inv<AppSettings>('settings:get'),
  setSettings: (patch: Partial<AppSettings>) => inv<AppSettings>('settings:set', patch),

  listSessions: () => inv<SessionMeta[]>('sessions:list'),
  createSession: (cwd?: string, projectId?: string, design?: DesignInfo) => inv<SessionMeta>('sessions:create', cwd, projectId, design),
  deleteSession: (id: string) => inv<void>('sessions:delete', id),
  updateSession: (id: string, patch: Partial<Pick<SessionMeta, 'title' | 'cwd' | 'pinned' | 'projectId'>>) => inv<SessionMeta>('sessions:update', id, patch),
  history: (id: string) => inv<ChatMessage[]>('sessions:history', id),
  isRunning: (id: string) => inv<boolean>('sessions:running', id),

  send: (p: SendPayload) => inv<void>('chat:send', p),
  interrupt: (id: string) => inv<void>('chat:interrupt', id),
  respond: (sessionId: string, requestId: string, d: PermissionDecision & { switchMode?: PermissionModeUI }) =>
    inv<void>('chat:respond', sessionId, requestId, d),
  setMode: (id: string, mode: PermissionModeUI) => inv<void>('chat:setMode', id, mode),
  setModel: (id: string, model: string) => inv<void>('chat:setModel', id, model),
  setDirs: (id: string, dirs: string[]) => inv<void>('chat:setDirs', id, dirs),
  listModels: () => inv<{ value: string; displayName: string; description: string }[]>('models:list'),
  rewindPreview: (id: string, messageId: string) => inv<RewindPreview>('chat:rewindPreview', id, messageId),
  rewind: (id: string, req: RewindRequest) =>
    inv<{ ok: boolean; error?: string; text?: string; filesChanged?: number }>('chat:rewind', id, req),
  toggleMcp: (id: string, name: string, enabled: boolean) => inv<void>('mcp:toggle', id, name, enabled),
  reconnectMcp: (id: string, name: string) => inv<void>('mcp:reconnect', id, name),
  refreshMcp: (id: string) => inv<void>('mcp:refresh', id),
  onEvent: (cb: (e: AgentEvent) => void) => on<AgentEvent>('agent:event', cb),

  pickFolder: (title?: string) => inv<string | null>('dialog:pickFolder', title),
  pickFiles: () => inv<string[]>('dialog:pickFiles'),
  readImages: (paths: string[]) => inv<Attachment[]>('files:readImages', paths),
  /** Absolute path of a file dropped or pasted into the window */
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  /** Paths of what was dropped: items from VS Code's explorer, or files from the OS (copied to a temporary folder) */
  droppedPaths: (dt: DataTransfer | null) => webUtils.getPathsForDrop(dt),
  /** VS Code: put text or file mentions into the open chat's message box (editor commands) */
  onCompose: (cb: (c: ComposeRequest) => void) => on<ComposeRequest>('editor:compose', cb),
  /** VS Code: the app is listening; events for a view that was just opened are held until then */
  ready: () => inv<void>('app:ready'),
  openPath: (p: string) => inv<string>('shell:openPath', p),
  openExternal: (url: string) => inv<void>('shell:openExternal', url),
  revealLog: () => inv<void>('log:reveal'),
  logError: (message: string) => inv<void>('log:renderer', message),
  gitStatus: (cwd: string) => inv<GitStatus | null>('git:status', cwd),
  remoteState: () => inv<RemoteState>('remote:state'),
  remoteStart: (opts: { cwd: string; name?: string; spawn: RemoteSpawn; permissionMode?: string }) => inv<RemoteState>('remote:start', opts),
  remoteStop: () => inv<void>('remote:stop'),
  remoteConsent: (yes: boolean) => inv<void>('remote:consent', yes),
  remoteTrust: () => inv<RemoteState>('remote:trust'),
  onRemote: (cb: (s: RemoteState) => void) => on<RemoteState>('remote:changed', cb),
  testMcpServer: (entry: McpServerEntry) => inv<McpTestResult>('mcp:test', entry),
  createWorktree: (sessionId: string, name: string) => inv<SessionMeta>('git:worktree', sessionId, name),
  openInEditor: (path: string) => inv<void>('files:openInEditor', path),
  setWindowTheme: (dark: boolean) => inv<void>('window:theme', dark),

  listArtifacts: (sessionId: string) => inv<Artifact[]>('artifacts:list', sessionId),
  saveArtifact: (sessionId: string, artifactId: string, version: number) => inv<boolean>('artifacts:save', sessionId, artifactId, version),

  listProjects: () => inv<Project[]>('projects:list'),
  createProject: (input: { name: string; description?: string; cwd?: string }) => inv<Project>('projects:create', input),
  addProjectDir: (id: string, folder?: string) => inv<Project | null>('projects:addDir', id, folder),
  removeProjectDir: (id: string, folder: string) => inv<Project>('projects:removeDir', id, folder),
  setProjectMainDir: (id: string) => inv<Project | null>('projects:setMainDir', id),
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'cwd' | 'pinned'>>) =>
    inv<Project>('projects:update', id, patch),
  deleteProject: (id: string) => inv<void>('projects:delete', id),
  addProjectFiles: (id: string, paths: string[]) => inv<{ project: Project; skipped: string[] }>('projects:addFiles', id, paths),
  addProjectFolder: (id: string) => inv<Project | null>('projects:addFolder', id),
  addKnowledgePaths: (id: string, paths: string[]) => inv<{ project: Project; skipped: string[] }>('projects:addKnowledgePaths', id, paths),
  removeProjectFolder: (id: string, folder: string) => inv<Project>('projects:removeFolder', id, folder),
  obsidianVaults: () => inv<ObsidianVault[]>('obsidian:vaults'),
  obsidianStatus: () => inv<VaultStatus>('obsidian:status'),
  openInObsidian: (path?: string) => inv<void>('obsidian:open', path),
  openChatInObsidian: (sessionId: string) => inv<boolean>('obsidian:openChat', sessionId),
  saveAllToVault: () => inv<number>('obsidian:saveAll'),
  removeProjectFile: (id: string, fileId: string) => inv<Project>('projects:removeFile', id, fileId),
  projectArtifacts: (id: string) => inv<ProjectArtifactRef[]>('projects:artifacts', id),
  allArtifacts: () => inv<ProjectArtifactRef[]>('artifacts:all'),
  openArtifactInBrowser: (sessionId: string, artifactId: string, version?: number) => inv<boolean>('artifacts:openInBrowser', sessionId, artifactId, version),
  /** one frame as PDF or PNG: exactly width × height when `exact` (a fixed-size frame), else the whole page */
  exportDesign: (sessionId: string, artifactId: string, version: number, format: 'pdf' | 'png', width: number, height?: number, exact?: boolean) =>
    inv<DesignExportResult>('design:export', sessionId, artifactId, version, format, width, height, exact),
  /** every frame as one PDF, a page per frame */
  exportDesignAll: (sessionId: string, items: { artifactId: string; version: number; width: number; height: number }[]) =>
    inv<DesignExportResult>('design:exportAll', sessionId, items),
  /** a new chat in this folder that can read the design, to build it in code */
  designHandoff: (sessionId: string, artifactId: string, version: number, folder: string) =>
    inv<{ meta: SessionMeta; path: string }>('design:handoff', sessionId, artifactId, version, folder),
  projectContext: (id: string) => inv<ProjectContextUsage | null>('projects:context', id),

  /** Memory: projectId null = global memory */
  globalMemory: () => inv<MemoryItem[]>('memory:global'),
  addMemory: (projectId: string | null, text: string) => inv<MemoryState>('memory:add', projectId, text),
  editMemory: (projectId: string | null, id: string, text: string) => inv<MemoryState>('memory:edit', projectId, id, text),
  removeMemory: (projectId: string | null, id: string) => inv<MemoryState>('memory:remove', projectId, id),
  clearMemory: (projectId: string | null) => inv<MemoryState>('memory:clear', projectId),

  usage: () => inv<PlanUsage>('usage:get'),
  /** Claude-powered knowledge search: progress of writing passage contexts */
  smartKnowledgeStatus: () => inv<SmartKnowledgeStatus>('knowledge:smartStatus'),
  onSmartKnowledge: (cb: (s: SmartKnowledgeStatus) => void) => on<SmartKnowledgeStatus>('knowledge:smart', cb),
  searchChats: (query: string) => inv<ChatSearchHit[]>('search:chats', query),
  copyImage: (sessionId: string, id: string) => inv<boolean>('image:copy', sessionId, id),
  saveImage: (sessionId: string, id: string) => inv<{ ok: boolean; path?: string }>('image:save', sessionId, id),
  setStyle: (id: string, style: string) => inv<void>('chat:setStyle', id, style),
  shortcutStatus: () => inv<{ accelerator: string; ok: boolean }>('shortcut:status'),
  /** a notification was clicked: show that chat */
  onOpenSession: (cb: (sessionId: string) => void) => on<string>('app:open-session', cb),
  /** the global shortcut was pressed */
  onNewChat: (cb: () => void) => on<null>('app:new-chat', () => cb()),

  exportData: (req: ExportRequest) => inv<ExportResult>('export:run', req),
  revealFile: (path: string) => inv<void>('export:reveal', path),
  importData: () => inv<ImportResult>('import:run'),
  importWithPassword: (password: string) => inv<ImportResult>('import:withPassword', password),
  cancelImport: () => inv<void>('import:cancel'),
  backupStatus: () => inv<BackupStatus>('backup:status'),
  setBackupPassword: (password: string | null) => inv<BackupStatus>('backup:setPassword', password),
  backupNow: () => inv<BackupResult>('backup:runNow'),
  backupSaveAs: (password: string) => inv<BackupResult>('backup:saveAs', password),
  platform: process.platform
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
