// Types shared between the Electron main process, preload and renderer.

/** auto = Claude Code's classifier approves or denies each action */
export type PermissionModeUI = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'

export interface McpServerEntry {
  /** stdio */
  type?: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** http / sse */
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
}

/** What "Test" found when connecting to an MCP server. */
export interface McpTestResult {
  ok: boolean
  /** the tools it offers */
  tools?: string[]
  /** the name the server gives itself */
  server?: string
  ms?: number
  error?: string
}

export interface AppSettings {
  defaultCwd: string
  defaultModel: string // '' = Claude Code default
  defaultPermissionMode: PermissionModeUI
  effort: '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Pass --chrome so Claude can drive your real Chrome via the Claude in Chrome extension */
  chromeIntegration: boolean
  /** Built-in computer-use tool: screenshots + mouse/keyboard on the primary display */
  computerUse: boolean
  /** Claude can create artifacts (pages, apps, diagrams, documents) shown in a side panel */
  artifacts: boolean
  /** Claude keeps a memory of useful facts across chats (per project, and global) */
  memory: boolean
  /** Claude can search and read your earlier chats */
  chatSearch: boolean
  /** Claude-powered knowledge search (uses your plan's usage); the three parts below can be switched separately */
  smartKnowledge: boolean
  /** Claude picks the passages that answer the question from the keyword search's best candidates */
  smartRerank: boolean
  /** a research helper (subagent) reads through the knowledge and reports back with sources */
  smartResearcher: boolean
  /** Claude writes a line of context for each passage when knowledge is indexed (once per document) */
  smartContext: boolean
  /** model for picking passages and writing contexts ('haiku', 'sonnet', 'opus') */
  smartModel: string
  /** Load ~/.claude (user) + project settings: CLAUDE.md, skills, slash commands, plugins, hooks */
  loadUserSettings: boolean
  loadProjectSettings: boolean
  mcpServers: Record<string, McpServerEntry>
  theme: 'system' | 'light' | 'dark'
  /** font for Claude's replies */
  replyFont: 'source-serif' | 'newsreader' | 'times' | 'georgia' | 'cambria' | 'sans'
  /** font for your messages, the reply box and the rest of the interface */
  uiFont: 'dm-sans' | 'system'
  /** desktop notification when Claude finishes or needs you while LocalClaude isn't focused */
  notifications: boolean
  /** name new chats with a short AI-written title after the first reply (one small Haiku request) */
  autoTitles: boolean
  /** style for chats that haven't picked one ('' = Claude Code's normal style) */
  defaultStyle: string
  /** your own response styles, alongside the built-in ones */
  customStyles: ResponseStyle[]
  /** global shortcut that brings LocalClaude forward with a new chat ('' = off) */
  quickShortcut: string
  /** write a password-protected backup to backupDir on a schedule (the password is kept apart, in the vault) */
  autoBackup: boolean
  backupDir: string
  backupEvery: 'daily' | 'weekly'
  /** how many automatic backups to keep in the folder */
  backupKeep: number
  /** use the Obsidian vault at all: off stops searching, writing and syncing, but keeps the link and choices */
  obsidianEnabled: boolean
  /** your Obsidian vault (its folder), '' when none is linked */
  obsidianVault: string
  /** Claude can search and read the vault's notes in every chat */
  obsidianSearch: boolean
  /** Claude can save notes into the vault (in obsidianFolder/Notes) */
  obsidianWrite: boolean
  /** keep each chat as a note in the vault (obsidianFolder/Chats) */
  obsidianSyncChats: boolean
  /** keep what Claude remembers as a note (obsidianFolder/Memory.md) */
  obsidianSyncMemory: boolean
  /** LocalClaude's folder inside the vault */
  obsidianFolder: string
  /** what Claude calls you (shown in the sidebar too); '' = the name from your email */
  userName: string
  /** Remote Control: how sessions started from your phone run, and their permission mode ('' = ask) */
  remoteSpawn: RemoteSpawn
  remotePermissionMode: string
  /** Extra instructions appended to Claude Code's system prompt */
  appendSystemPrompt: string
}

export interface SessionMeta {
  id: string // SDK session id (UUID) once known, else a local temp id
  sdkSessionId?: string
  title: string
  cwd: string
  additionalDirs: string[]
  model: string
  permissionMode: PermissionModeUI
  pinned?: boolean
  /** chat belongs to this project (instructions + knowledge are added to every turn) */
  projectId?: string
  /** how many artifacts this chat has (shown as an icon in the sidebar) */
  artifactCount?: number
  /** restored from an export without its Claude Code transcript: the old messages are sent as context on the next turn */
  imported?: boolean
  /** response style for this chat (undefined = the default style, 'default' = Claude Code's normal style) */
  style?: string
  /** where the title came from: the first message ('auto'), Claude ('ai') or you ('user') */
  titleSource?: 'auto' | 'ai' | 'user'
  /** a design from the Design page: Claude builds it on a canvas beside the chat */
  design?: DesignInfo
  createdAt: number
  updatedAt: number
  /** UUID of the last transcript entry of the latest finished turn (rewind fork point) */
  tip?: string
  /** Pending conversation rewind: resume the transcript only up to this entry */
  resumeAt?: string
}

/** One hunk of a unified diff, as Claude Code reports it for Edit/Write */
export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

/** An image kept with a chat (what you attached, or what a tool returned such as a screenshot).
 * The bytes are stored encrypted next to the chat and shown through lcimg://. */
export interface ImageRef {
  id: string
  mediaType: string
  width?: number
  height?: number
}

export type ContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'tool'
      toolUseId: string
      name: string
      input: unknown
      inputJsonPartial?: string
      result?: string
      isError?: boolean
      /** structured diff from Claude Code (Edit/Write) */
      patch?: DiffHunk[]
      /** images the tool returned (screenshots, image files Claude read) */
      images?: ImageRef[]
      done: boolean
    }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  parts: ContentPart[]
  /** set for messages produced inside a subagent (Agent/Task tool) */
  parentToolUseId?: string | null
  /** user messages: how many images were attached */
  images?: number
  /** user messages: the attached images (chats from before images were kept only have the count) */
  imageRefs?: ImageRef[]
  ts: number
  /** user messages: the UUID sent to Claude Code (file checkpoint id) */
  uuid?: string
  /** user messages: transcript entry this message followed (conversation rewind point) */
  forkAt?: string
}

export interface SlashCommandInfo {
  name: string
  description: string
  argumentHint: string
}

export interface ContextUsage {
  percentage: number
  totalTokens: number
  maxTokens: number
  categories: { name: string; tokens: number; color: string; kind: string }[]
}

export interface McpStatus {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'
  error?: string
  toolCount?: number
}

export interface RewindPreview {
  canRewind: boolean
  error?: string
  filesChanged?: string[]
  insertions?: number
  deletions?: number
}

export interface RewindRequest {
  messageId: string
  code: boolean
  conversation: boolean
}

export interface TurnStats {
  costUsd: number
  inputTokens: number
  outputTokens: number
  durationMs: number
  numTurns: number
}

/** Subscription usage window info reported by Claude Code */
export interface RateLimitInfo {
  status: 'allowed' | 'allowed_warning' | 'rejected'
  resetsAt?: number
  rateLimitType?: string
  utilization?: number
}

export interface InitInfo {
  model: string
  cwd: string
  tools: string[]
  slashCommands: string[]
  skills: string[]
  mcpServers: { name: string; status: string }[]
  apiKeySource: string
  claudeCodeVersion: string
  permissionMode: string
}

export interface PermissionRequest {
  requestId: string
  sessionId: string
  toolName: string
  input: Record<string, unknown>
  title?: string
  displayName?: string
  decisionReason?: string
  blockedPath?: string
  hasSuggestions: boolean
}

export type PermissionDecision =
  | { behavior: 'allow'; always?: boolean; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message?: string }

/** Events pushed from main -> renderer */
export type AgentEvent =
  | { type: 'status'; sessionId: string; status: 'idle' | 'running' | 'starting' }
  | { type: 'init'; sessionId: string; info: InitInfo }
  | { type: 'sdk-session'; sessionId: string; sdkSessionId: string }
  | { type: 'message-start'; sessionId: string; message: ChatMessage }
  | { type: 'text-delta'; sessionId: string; messageId: string; partIndex: number; text: string }
  | { type: 'thinking-delta'; sessionId: string; messageId: string; partIndex: number; text: string }
  | { type: 'tool-start'; sessionId: string; messageId: string; partIndex: number; toolUseId: string; name: string }
  | { type: 'tool-input-delta'; sessionId: string; messageId: string; partIndex: number; json: string }
  | { type: 'message-final'; sessionId: string; message: ChatMessage }
  | { type: 'tool-result'; sessionId: string; toolUseId: string; result: string; isError: boolean; patch?: DiffHunk[]; images?: ImageRef[] }
  | { type: 'turn-done'; sessionId: string; stats: TurnStats; isError: boolean; errorText?: string }
  | { type: 'error'; sessionId: string; text: string }
  | { type: 'rate-limit'; sessionId: string; info: RateLimitInfo }
  | { type: 'permission'; request: PermissionRequest }
  | { type: 'permission-cancel'; requestId: string }
  | { type: 'meta'; meta: SessionMeta }
  | { type: 'account'; email?: string; subscriptionType?: string }
  | { type: 'context'; sessionId: string; usage: ContextUsage }
  | { type: 'commands'; sessionId: string; commands: SlashCommandInfo[] }
  | { type: 'mcp-status'; sessionId: string; servers: McpStatus[] }
  | { type: 'history-reset'; sessionId: string; history: ChatMessage[] }
  | { type: 'artifact'; sessionId: string; artifact: Artifact }
  | { type: 'project'; project: Project }
  | { type: 'global-memory'; items: MemoryItem[] }

export interface AuthStatus {
  loggedIn: boolean
  authMethod?: string
  apiProvider?: string
  usingApiKeyEnv: boolean
  email?: string
  subscriptionType?: string
  error?: string
}

export interface LockStatus {
  ok: boolean
  reason?: string
  encryptionBackend: string
  machineIdShort: string
}

export interface Attachment {
  kind: 'image'
  mediaType: string
  base64: string
  name: string
}

export interface SendPayload {
  sessionId: string
  text: string
  attachments: Attachment[]
  /** images already saved with this chat to send again (editing or retrying a message) */
  reuseImages?: ImageRef[]
  /** sent to Claude after the text but not shown in the chat (VS Code: the open file and selection) */
  hiddenContext?: string
}

/** Claude-powered knowledge search: progress of writing passage contexts */
export interface SmartKnowledgeStatus {
  queuedDocs: number
  done: number
  total: number
  running: boolean
  lastError?: string
}

/** VS Code: text and/or file mentions an editor command puts into the message box */
export interface ComposeRequest {
  text?: string
  paths?: string[]
  /** the workspace folder, for a new chat when none is open */
  cwd?: string
}

export interface LoginEvent {
  type: 'output' | 'exit'
  text?: string
  code?: number | null
  url?: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCwd: '',
  defaultModel: '',
  defaultPermissionMode: 'default',
  effort: '',
  chromeIntegration: false,
  computerUse: false,
  artifacts: true,
  memory: true,
  chatSearch: true,
  smartKnowledge: false,
  smartRerank: true,
  smartResearcher: true,
  smartContext: false,
  smartModel: 'haiku',
  loadUserSettings: true,
  loadProjectSettings: true,
  mcpServers: {},
  theme: 'system',
  replyFont: 'source-serif',
  uiFont: 'dm-sans',
  notifications: true,
  autoTitles: true,
  defaultStyle: '',
  customStyles: [],
  quickShortcut: 'CommandOrControl+Alt+Space',
  autoBackup: false,
  backupDir: '',
  backupEvery: 'daily',
  backupKeep: 7,
  obsidianEnabled: true,
  obsidianVault: '',
  obsidianSearch: true,
  obsidianWrite: false,
  obsidianSyncChats: false,
  obsidianSyncMemory: false,
  obsidianFolder: 'LocalClaude',
  userName: '',
  remoteSpawn: 'same-dir',
  remotePermissionMode: '',
  appendSystemPrompt: ''
}

// ---------------------------------------------------------------- artifacts
export type ArtifactType = 'html' | 'react' | 'svg' | 'markdown' | 'code' | 'mermaid'

export interface ArtifactVersion {
  content: string
  ts: number
}

/** A standalone piece of content Claude made in a chat, kept with every version. */
export interface Artifact {
  id: string
  sessionId: string
  title: string
  type: ArtifactType
  /** for type "code" */
  language?: string
  versions: ArtifactVersion[]
  /** in a design: where the frame sits on the canvas and its size */
  frame?: ArtifactFrame
  createdAt: number
  updatedAt: number
}

export interface ArtifactFrame {
  /** frames with the same section sit in one row under its heading */
  section?: string
  width?: number
  height?: number
}

// ---------------------------------------------------------------- design
/** What a design is; it picks Claude's instructions and how the canvas shows it. */
export type DesignKind = 'prototype' | 'slides' | 'wireframe' | 'onepager' | 'other'

export interface DesignInfo {
  kind: DesignKind
  /** match the look of the code in the working folder (its design system) */
  matchStyle?: boolean
}

export interface DesignExportResult {
  ok: boolean
  canceled?: boolean
  error?: string
  path?: string
}

// ---------------------------------------------------------------- projects
export interface ProjectFile {
  id: string
  name: string
  size: number
  addedAt: number
}

/** A group of chats sharing instructions, knowledge files and a working folder. */
export interface Project {
  id: string
  name: string
  description: string
  instructions: string
  /** the project's main folder: new chats in it start here (falls back to the default) */
  cwd?: string
  /** more folders every chat in the project can work in */
  dirs?: string[]
  files: ProjectFile[]
  /** folders linked as knowledge: read live from disk, and Claude searches them */
  folders?: string[]
  /** facts Claude (or you) saved for this project */
  memory?: MemoryItem[]
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------- memory
/** Something worth remembering in later chats, e.g. a preference or a project decision. */
export interface MemoryItem {
  id: string
  text: string
  /** who saved it */
  source: 'claude' | 'you'
  createdAt: number
  updatedAt?: number
  /** chat it came from, when Claude saved it */
  sessionId?: string
}

/** An artifact from one of a project's chats (for the project page). */
export interface ProjectArtifactRef {
  sessionId: string
  chatTitle: string
  projectId?: string
  id: string
  title: string
  type: ArtifactType
  versions: number
  updatedAt: number
}

/** Approximate tokens a project adds to every chat in it. */
export interface ProjectContextUsage {
  instructions: number
  knowledge: number
  memory: number
  total: number
  /** the knowledge files are too large to send in full, so Claude searches them instead */
  searched: boolean
}

// ---------------------------------------------------------------- export / import
export type ExportScope = 'chat' | 'chats' | 'project' | 'all'

export interface ExportOptions {
  /** what to include of Claude's tool use: nothing, one summary line per group, or every step with inputs and output */
  tools: 'none' | 'summary' | 'full'
  thinking: boolean
  artifacts: 'latest' | 'all' | 'none'
  /** project instructions, knowledge files and memory */
  knowledge: boolean
  /** add localclaude-backup.json so the export can be imported back into LocalClaude */
  backup: boolean
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { tools: 'summary', thinking: false, artifacts: 'latest', knowledge: true, backup: true }

export interface ExportRequest {
  scope: ExportScope
  sessionId?: string
  /** scope 'chats': the chats you selected */
  sessionIds?: string[]
  projectId?: string
  options: ExportOptions
}

export interface ExportResult {
  ok: boolean
  canceled?: boolean
  error?: string
  path?: string
  chats: number
  artifacts: number
  files: number
}

export interface ImportResult {
  ok: boolean
  canceled?: boolean
  error?: string
  /** the file is a password-protected backup: ask for the password and call importWithPassword */
  needsPassword?: boolean
  chats: number
  projects: number
  artifacts: number
  memory: number
  skipped: number
  /** chats whose Claude Code transcript isn't on this machine: they continue with the old messages as context */
  withoutTranscript: number
}

// ---------------------------------------------------------------- Remote Control
/** How the Remote Control server handles new sessions from your phone: in its folder, each in a new git worktree, or just one. */
export type RemoteSpawn = 'same-dir' | 'worktree' | 'session'

export interface RemoteState {
  status: 'off' | 'starting' | 'consent' | 'untrusted' | 'connecting' | 'connected' | 'error'
  cwd?: string
  name?: string
  spawn?: RemoteSpawn
  /** claude.ai/code link to the session */
  url?: string
  /** "folder · branch", from the status line */
  where?: string
  error?: string
  /** a session ended with an error (the server keeps running) */
  problem?: string
  /** what the server printed, each line once */
  log: string[]
  startedAt?: number
}

// ---------------------------------------------------------------- git
export interface GitStatus {
  branch: string
  /** the repository's top folder */
  root: string
  /** files with changes (staged, unstaged or new) */
  changed: number
  /** paths relative to the repository's top folder, with git's two-letter status */
  files: { status: string; path: string }[]
  /** the folder is a linked worktree (not the main checkout) */
  worktree: boolean
}

// ---------------------------------------------------------------- Obsidian
export interface ObsidianVault {
  path: string
  name: string
  /** open in Obsidian right now */
  open?: boolean
}

export interface VaultStatus {
  linked: boolean
  /** linked, but switched off in settings */
  off?: boolean
  name?: string
  /** the folder is gone (moved, or a drive that isn't connected) */
  missing?: boolean
  files?: number
  passages?: number
  /** more files than are indexed */
  more?: boolean
}

// ---------------------------------------------------------------- backups
export interface BackupStatus {
  /** a password is saved for automatic backups */
  hasPassword: boolean
  lastAt?: number
  lastFile?: string
  lastSize?: number
  lastError?: string
  /** where automatic backups go when no folder is chosen */
  defaultDir: string
  running: boolean
}

export interface BackupResult {
  ok: boolean
  canceled?: boolean
  error?: string
  path?: string
  size?: number
}

// ---------------------------------------------------------------- styles & usage
/** A way of responding (tone, length, format), added to Claude's instructions. */
export interface ResponseStyle {
  id: string
  name: string
  description: string
  prompt: string
}

/** One plan rate-limit window, e.g. the 5-hour session or the weekly limit. */
export interface UsageWindow {
  key: string
  label: string
  /** percent used, 0-100 */
  utilization: number | null
  /** ISO time the window resets */
  resetsAt: string | null
}

/** Your Claude plan's usage limits, as Claude Code reports them. */
export interface PlanUsage {
  available: boolean
  subscription: string | null
  windows: UsageWindow[]
  extra: { enabled: boolean; utilization: number | null; used: number | null; limit: number | null; currency: string | null } | null
  fetchedAt: number
  error?: string
}

/** A chat that matches a search, with a bit of context around the match. */
export interface ChatSearchHit {
  sessionId: string
  title: string
  projectId?: string
  updatedAt: number
  snippet: string
  matches: number
}
