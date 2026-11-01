// LocalClaude inside VS Code: Claude Code on your Claude subscription, as the editor's AI.
//
// This is the VS Code counterpart of the desktop app's main process (src/main/index.ts in the
// LocalClaude repository). The chat engine, storage, projects, memory, artifacts and the rest are
// the same modules; this file wires them to VS Code instead of Electron: webviews instead of a
// window, VS Code dialogs, the editor for opening files, and the workspace folder as the place
// new chats work in.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import * as vscode from 'vscode'
import { artifactExt, safeFileName } from '../../shared/format'
import {
  DEFAULT_EXPORT_OPTIONS,
  type AgentEvent,
  type AppSettings,
  type Attachment,
  type BackupResult,
  type BackupStatus,
  type DesignExportResult,
  type DesignInfo,
  type ExportRequest,
  type ExportResult,
  type GitStatus,
  type ImportResult,
  type McpServerEntry,
  type MemoryItem,
  type PermissionDecision,
  type PermissionModeUI,
  type Project,
  type ProjectArtifactRef,
  type RemoteSpawn,
  type RewindRequest,
  type SendPayload,
  type SessionMeta,
  type VaultStatus
} from '../../shared/types'
import { PROJECT_KNOWLEDGE_LIMIT, SessionManager, projectKnowledgeChars } from '../agent'
import { renderArtifactPage } from '../artifacts'
import { BACKUP_EXT, MIN_PASSWORD, backupDue, backupFileName, createBackup, decryptBackup, isEncryptedBackup, writeBackupTo } from '../backup'
import { authStatus, cancelLogin, logout, resolveClaudeBinary, sendLoginInput, startLogin, subscriptionEnv } from '../claude'
import { DRAFT_PAGE, withDesignBridge } from '../design'
import { buildChatsExport, buildFullExport, buildProjectExport, chatMarkdown, importBackup, projectContext, readBackup } from '../exporter'
import { createWorktree, gitStatus } from '../git'
import { IMAGE_EXT, sniffImageType, thumbnail } from '../images'
import { KnowledgeService } from '../knowledge'
import { log, logFile } from '../log'
import { testMcpServer } from '../mcpCheck'
import { addMemory, editMemory, getMemory, removeMemory, setMemory } from '../memory'
import { notificationFor } from '../notify'
import { VaultSync, activeVault, detectVaults, obsidianUri } from '../obsidian'
import {
  addProjectDir,
  addProjectFiles,
  addProjectFolder,
  createProject,
  removeProjectDir,
  removeProjectFile,
  removeProjectFolder,
  setProjectMainDir,
  updateProject
} from '../projects'
import { RemoteControl } from '../remoteControl'
import { ContextWriter, claudeAsk, type Ask } from '../smartKnowledge'
import { SecureStore } from '../store'
import { generateTitle } from '../titles'
import { fakeRemoteCommand } from '../fakeRemote'
import { createZip } from '../zip'
import { Bridge } from './bridge'
import { exportDesign, exportFramesPdf, setBrowserPath } from './designExport'
import { app, initShim, shell, type BrowserWindow } from './electronShim'
import { editorContext, problemsPrompt, selectionPrompt } from './editorContext'
import { LocalServer } from './server'
import { webviewHtml } from './webviewHtml'

const VIEW_ID = 'localclaude.chat'

/** Settings that only change the UI; changing them doesn't restart idle chats. */
const UI_ONLY_SETTINGS = new Set<keyof AppSettings>([
  'theme',
  'replyFont',
  'uiFont',
  'notifications',
  'autoTitles',
  'quickShortcut',
  'defaultCwd',
  'defaultModel',
  'defaultPermissionMode',
  'autoBackup',
  'backupDir',
  'backupEvery',
  'backupKeep',
  'obsidianSyncChats',
  'obsidianSyncMemory',
  'remoteSpawn',
  'remotePermissionMode',
  // Claude-powered knowledge search: the helper model and passage contexts don't change how chats run
  'smartModel',
  'smartContext'
])

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

/** Computer use stays off inside VS Code: Claude could click VS Code itself, including its own permission prompts. */
class EditorStore extends SecureStore {
  override getSettings(): AppSettings {
    return { ...super.getSettings(), computerUse: false }
  }
}

const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** VS Code's file filters from Electron-style ones. */
function filters(list?: { name: string; extensions: string[] }[]): Record<string, string[]> | undefined {
  if (!list?.length) return undefined
  return Object.fromEntries(list.map((f) => [f.name, f.extensions]))
}

async function saveDialog(title: string, defaultPath: string, list?: { name: string; extensions: string[] }[]): Promise<string | null> {
  const uri = await vscode.window.showSaveDialog({ title, defaultUri: vscode.Uri.file(defaultPath), filters: filters(list) })
  return uri?.fsPath ?? null
}

async function openDialog(opts: { title: string; folders?: boolean; many?: boolean; filters?: { name: string; extensions: string[] }[] }): Promise<string[]> {
  const uris = await vscode.window.showOpenDialog({
    title: opts.title,
    canSelectFolders: !!opts.folders,
    canSelectFiles: !opts.folders,
    canSelectMany: !!opts.many,
    filters: filters(opts.filters),
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
  })
  return uris?.map((u) => u.fsPath) ?? []
}

/** The folder a new chat works in: the active file's workspace folder, else the first one. */
function workspaceCwd(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri
  const folder = (active && vscode.workspace.getWorkspaceFolder(active)) ?? vscode.workspace.workspaceFolders?.[0]
  return folder?.uri.scheme === 'file' ? folder.uri.fsPath : undefined
}

export class LocalClaudeHost implements vscode.WebviewViewProvider {
  private readonly bridge = new Bridge()
  private store!: EditorStore
  private readonly knowledge = new KnowledgeService()
  private manager!: SessionManager
  private vaultSync!: VaultSync
  private ask!: Ask
  private contextWriter!: ContextWriter
  private remote!: RemoteControl
  private server!: LocalServer
  private view: vscode.WebviewView | undefined
  private panels = new Set<vscode.WebviewPanel>()
  private pendingImport: string | null = null
  private backupRunning = false
  private timers: ReturnType<typeof setInterval>[] = []
  private started: Promise<void> | undefined

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Starts once; views and commands wait for it, so activation itself returns right away. */
  start(): Promise<void> {
    return (this.started ??= this.doStart())
  }

  private async doStart(): Promise<void> {
    await initShim(this.context)
    log('info', `LocalClaude for VS Code ${app.getVersion()} starting (VS Code ${vscode.version}, ${process.platform} ${process.arch})`)
    this.store = new EditorStore()
    this.store.open()
    if (!this.store.lock.ok) log('warn', 'data locked:', this.store.lock.reason ?? '')
    // Claude-powered knowledge search (optional): small tool-free requests, and passage contexts written in the background
    this.ask = claudeAsk(() => (this.store.lock.ok ? this.store.getSettings().smartModel : ''))
    this.contextWriter = new ContextWriter(
      this.store,
      this.ask,
      () => this.knowledge.invalidateAll(),
      (st) => this.bridge.send('knowledge:smart', st)
    )
    this.manager = new SessionManager(
      this.store,
      (e: AgentEvent) => {
        this.bridge.send('agent:event', e)
        this.notify(e)
        this.syncToVault(e)
        if (e.type === 'error') log('warn', `chat ${e.sessionId.slice(0, 8)}: ${e.text.slice(0, 500)}`)
      },
      {
        knowledge: this.knowledge,
        ask: this.ask,
        titleFor: (user, reply) => (this.store.getSettings().autoTitles ? generateTitle(user, reply) : Promise.resolve(null)),
        // the end-to-end tests' stand-in for Claude Code (LOCALCLAUDE_FAKE_AGENT=1) doesn't write transcripts
        transcriptExists: process.env.LOCALCLAUDE_FAKE_AGENT ? () => true : undefined
      }
    )
    const store = this.store
    this.vaultSync = new VaultSync(
      {
        getSession: (id) => store.getSession(id),
        loadHistory: (id) => this.manager.history(id),
        loadArtifacts: (id) => store.loadArtifacts(id),
        loadImage: (sid, id) => store.loadImage(sid, id),
        getProject: (id) => store.getProject(id),
        listProjects: () => store.listProjects(),
        getGlobalMemory: () => store.getGlobalMemory(),
        getNotePath: (id) => store.getNotePath(id),
        setNotePath: (id, rel) => store.setNotePath(id, rel)
      },
      () => store.getSettings()
    )
    this.remote = new RemoteControl(
      (s) => {
        this.bridge.send('remote:changed', s)
        if (s.status === 'error') log('warn', 'remote control:', s.error ?? '')
      },
      () => {
        if (process.env.LOCALCLAUDE_FAKE_AGENT) return fakeRemoteCommand()
        const bin = resolveClaudeBinary()
        return bin ? { bin, args: [], env: subscriptionEnv() } : null
      }
    )
    this.server = new LocalServer({
      artifact: (sessionId, artifactId, version, design) => {
        if (!this.store.lock.ok) return null
        const a = this.store.loadArtifacts(sessionId).find((x) => x.id === artifactId)
        const v = a?.versions[version] ?? a?.versions[(a?.versions.length ?? 0) - 1]
        if (!a || !v) return null
        const page = renderArtifactPage(a.type, v.content)
        return design ? withDesignBridge(page) : page
      },
      draft: () => DRAFT_PAGE,
      image: (sessionId, imageId, width) => {
        const data = this.store.lock.ok ? this.store.loadImage(sessionId, imageId) : null
        if (!data) return null
        const body = width ? thumbnail(data, width, `${sessionId}/${imageId}`) : data
        return { body, type: sniffImageType(body) ?? 'application/octet-stream' }
      }
    })
    await this.server.start()
    if (this.store.lock.ok) {
      this.applySmartKnowledge()
      this.warmVault()
    }
    this.registerIpc()
    this.scheduleBackups()
  }

  dispose(): void {
    for (const t of this.timers) clearInterval(t)
    this.remote?.stop()
    this.manager?.shutdownAll()
    this.server?.stop()
  }

  // ---------------------------------------------------------------- views

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view
    if (!(await this.ready(view.webview))) return
    this.setupWebview(view.webview, 'sidebar')
    const sub = this.bridge.attach(view.webview)
    view.onDidDispose(() => {
      sub.dispose()
      if (this.view === view) this.view = undefined
    })
  }

  /** Wait for start-up; if it failed, the view says why instead of showing a broken app. */
  private async ready(webview: vscode.Webview): Promise<boolean> {
    try {
      await this.start()
      return true
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
      webview.html = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:16px"><h3>LocalClaude could not start</h3><p>${msg}</p><p>Run "LocalClaude: Show Log" for details.</p></body>`
      return false
    }
  }

  /** LocalClaude in an editor tab: the full app layout with room for the chat list and artifacts. */
  async openInEditor(): Promise<vscode.WebviewPanel> {
    const existing = [...this.panels][0]
    if (existing) {
      existing.reveal()
      return existing
    }
    const panel = vscode.window.createWebviewPanel('localclaude.editor', 'LocalClaude', vscode.ViewColumn.Active, {
      retainContextWhenHidden: true,
      enableFindWidget: false
    })
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'claude.svg')
    this.panels.add(panel)
    if (!(await this.ready(panel.webview))) return panel
    this.setupWebview(panel.webview, 'editor')
    const sub = this.bridge.attach(panel.webview)
    panel.onDidDispose(() => {
      sub.dispose()
      this.panels.delete(panel)
    })
    return panel
  }

  private setupWebview(webview: vscode.Webview, place: 'sidebar' | 'editor'): void {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media')
    webview.options = {
      enableScripts: true,
      localResourceRoots: [media],
      // artifact previews and images come from the local server; map its port when VS Code runs remotely
      portMapping: [{ webviewPort: this.server.listenPort, extensionHostPort: this.server.listenPort }]
    }
    webview.html = webviewHtml({
      webview,
      media,
      serverOrigin: this.server.origin,
      serverBase: this.server.base,
      platform: process.platform,
      place
    })
  }

  /** The view the user works in: the editor tab if it's showing, else the side bar view (opened if needed). */
  async reveal(): Promise<vscode.Webview | undefined> {
    await this.start()
    const panel = [...this.panels].find((p) => p.visible)
    if (panel) {
      panel.reveal()
      return panel.webview
    }
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`)
    // the view resolves asynchronously the first time it opens
    for (let i = 0; i < 50 && !this.view; i++) await new Promise((r) => setTimeout(r, 100))
    this.view?.show(false)
    return this.view?.webview
  }

  /** Put text and/or file mentions into the composer of the chat that's open (a new chat if none). */
  async compose(c: { text?: string; paths?: string[]; newChat?: boolean }): Promise<void> {
    const cwd = workspaceCwd()
    const target = await this.reveal()
    this.bridge.sendWhenReady(target, 'editor:compose', { ...c, cwd })
  }

  newChat(): void {
    void this.reveal().then((target) => this.bridge.sendWhenReady(target, 'app:new-chat', null))
  }

  // ---------------------------------------------------------------- notifications and vault

  private notify(e: AgentEvent): void {
    if (e.type !== 'turn-done' && e.type !== 'permission') return
    if (!this.store.lock.ok || !this.store.getSettings().notifications) return
    const viewShowing = this.view?.visible || [...this.panels].some((p) => p.visible)
    if (vscode.window.state.focused && viewShowing) return
    const sessionId = e.type === 'permission' ? e.request.sessionId : e.sessionId
    const meta = this.store.getSession(sessionId)
    const last = [...this.manager.history(sessionId)]
      .reverse()
      .find((m) => m.role === 'assistant' && !m.parentToolUseId && m.parts.some((p) => p.kind === 'text' && p.text.trim()))
    const n = notificationFor(e, { chatTitle: meta?.title, lastReply: last?.parts.map((p) => (p.kind === 'text' ? p.text : '')).join(' ') })
    if (!n) return
    void vscode.window.showInformationMessage(`${n.title}: ${n.body}`, 'Open').then(async (pick) => {
      if (pick !== 'Open') return
      const target = await this.reveal()
      this.bridge.sendWhenReady(target, 'app:open-session', n.sessionId)
    })
  }

  /** Passage contexts on or off (Settings): when on, indexing the knowledge starts writing them. */
  private applySmartKnowledge(): void {
    const s = this.store.getSettings()
    if (s.smartKnowledge && s.smartContext) {
      this.knowledge.setContextSource(this.contextWriter)
      void this.warmKnowledge()
    } else {
      this.contextWriter.stop()
      this.knowledge.setContextSource(null)
    }
  }

  /** Index what Claude would search: big projects' files, linked folders and the vault (so contexts get written ahead of time). */
  private async warmKnowledge(): Promise<void> {
    try {
      for (const p of this.store.listProjects()) {
        if (p.files.length && projectKnowledgeChars(p, this.store) > PROJECT_KNOWLEDGE_LIMIT)
          this.knowledge.project(p.id, p.updatedAt, p.files, () => this.store.loadProjectFiles(p.id))
        for (const f of p.folders ?? []) if (existsSync(f)) await this.knowledge.folder(f, `folder ${basename(f)}`)
      }
    } catch (e) {
      log('warn', 'indexing knowledge failed:', e)
    }
    this.warmVault()
  }

  private warmVault(): void {
    const v = activeVault(this.store.getSettings())
    if (v) void this.knowledge.folder(v, `Obsidian vault ${basename(v)}`).catch(() => {})
  }

  private syncToVault(e: AgentEvent): void {
    if (e.type === 'turn-done') this.vaultSync.chatChanged(e.sessionId)
    else if (e.type === 'meta') this.vaultSync.chatChanged(e.meta.id)
    else if (e.type === 'global-memory' || e.type === 'project') this.vaultSync.memoryChanged()
  }

  // ---------------------------------------------------------------- backups

  private defaultBackupDir(): string {
    return join(app.getPath('documents'), 'LocalClaude backups')
  }

  private backupStatus(): BackupStatus {
    const st = this.store.getBackupState()
    return { hasPassword: !!st.password, lastAt: st.lastAt, lastFile: st.lastFile, lastSize: st.lastSize, lastError: st.lastError, defaultDir: this.defaultBackupDir(), running: this.backupRunning }
  }

  private async runAutoBackup(): Promise<BackupResult> {
    const s = this.store.getSettings()
    const password = this.store.getBackupState().password
    if (!password) return { ok: false, error: 'Set a backup password first.' }
    if (this.backupRunning) return { ok: false, error: 'A backup is already running.' }
    this.backupRunning = true
    try {
      const r = await writeBackupTo(this.store, s.backupDir || this.defaultBackupDir(), password, s.backupKeep)
      this.store.setBackupState({ lastAt: Date.now(), lastFile: r.path, lastSize: r.size, lastError: undefined })
      log('info', `backup written (${Math.round(r.size / 1024)} KB)`)
      return { ok: true, ...r }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      log('error', 'automatic backup failed:', e)
      this.store.setBackupState({ lastError: error })
      return { ok: false, error }
    } finally {
      this.backupRunning = false
    }
  }

  private scheduleBackups(): void {
    const tick = (): void => {
      if (!this.store.lock.ok) return
      const s = this.store.getSettings()
      const st = this.store.getBackupState()
      if (s.autoBackup && st.password && backupDue(st.lastAt, s.backupEvery)) void this.runAutoBackup()
    }
    // a minute after start (not to slow VS Code's startup), then every half hour
    const first = setTimeout(tick, 60_000)
    this.timers.push(first as unknown as ReturnType<typeof setInterval>, setInterval(tick, 30 * 60_000))
  }

  // ---------------------------------------------------------------- IPC

  /** Register an IPC handler that refuses to run while the app data is locked to another machine. */
  private handle(channel: string, fn: (...args: never[]) => unknown, allowLocked = false): void {
    this.bridge.handle(channel, (...args: never[]) => {
      if (!allowLocked && !this.store.lock.ok) throw new Error('App is locked: data belongs to another machine')
      return (fn as (...a: unknown[]) => unknown)(...args)
    })
  }

  private registerIpc(): void {
    const store = this.store
    const manager = this.manager
    const knowledge = this.knowledge
    const vaultSync = this.vaultSync
    const remote = this.remote
    const handle = this.handle.bind(this)

    // ---- app / lock
    handle('app:lockStatus', () => store.lock, true)
    handle(
      'app:resetData',
      () => {
        manager.shutdownAll()
        return store.reset()
      },
      true
    )
    handle(
      'app:info',
      () => ({
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electron: `VS Code ${vscode.version}`,
        claudeBinary: resolveClaudeBinary() ?? null,
        userData: app.getPath('userData'),
        logFile: logFile()
      }),
      true
    )
    handle('log:reveal', () => vscode.window.showTextDocument(vscode.Uri.file(logFile())), true)
    handle('log:renderer', (message: string) => log('error', `[webview] ${String(message).slice(0, 4000)}`), true)

    // ---- auth (your Claude subscription, via Claude Code's own login)
    handle('auth:status', () => authStatus())
    handle('auth:login', () => startLogin(this.bridge.windowLike() as unknown as BrowserWindow))
    handle('auth:loginInput', (text: string) => sendLoginInput(text))
    handle('auth:cancelLogin', () => cancelLogin())
    handle('auth:logout', async () => {
      manager.shutdownAll()
      await logout()
    })

    // ---- settings
    handle('settings:get', () => store.getSettings())
    handle('settings:set', (patch: Partial<AppSettings>) => {
      const before = store.getSettings()
      const s = store.setSettings(patch)
      if (activeVault(s) && (s.obsidianVault !== before.obsidianVault || !before.obsidianEnabled)) this.warmVault()
      if (s.obsidianSyncMemory && (!before.obsidianSyncMemory || !before.obsidianEnabled)) vaultSync.memoryChanged()
      if (Object.keys(patch).some((k) => !UI_ONLY_SETTINGS.has(k as keyof AppSettings))) manager.restartIdle()
      if (s.smartKnowledge !== before.smartKnowledge || s.smartContext !== before.smartContext) this.applySmartKnowledge()
      return s
    })
    handle('knowledge:smartStatus', () => this.contextWriter.status())
    // VS Code owns keyboard shortcuts: "LocalClaude: Focus" (Ctrl+Alt+Space by default)
    handle('shortcut:status', () => ({ accelerator: '', ok: true }))
    handle('usage:get', () => manager.usage())
    handle('search:chats', (query: string) => manager.searchChats(query))

    // ---- sessions
    handle('sessions:list', () => store.listSessions())
    // A chat without a folder of its own works in the workspace you have open.
    handle('sessions:create', (cwd?: string, projectId?: string, design?: DesignInfo) =>
      manager.create(cwd || (projectId || design ? undefined : workspaceCwd()), projectId, design)
    )
    handle('sessions:delete', (id: string) => manager.delete(id))
    handle('sessions:update', (id: string, patch: Partial<Pick<SessionMeta, 'title' | 'cwd' | 'pinned' | 'projectId'>>) => manager.updateMeta(id, patch))
    handle('sessions:history', (id: string) => manager.history(id))
    handle('sessions:running', (id: string) => manager.isRunning(id))

    // ---- artifacts
    handle('artifacts:list', (sessionId: string) => store.loadArtifacts(sessionId))
    handle('artifacts:save', async (sessionId: string, artifactId: string, version: number) => {
      const a = store.loadArtifacts(sessionId).find((x) => x.id === artifactId)
      const v = a?.versions[version]
      if (!a || !v) return false
      const file = await saveDialog('Save artifact', join(workspaceCwd() ?? app.getPath('downloads'), safeFileName(a.title) + '.' + artifactExt(a)))
      if (!file) return false
      writeFileSync(file, v.content)
      void vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true })
      return true
    })
    const artifactRefs = (projectId?: string): ProjectArtifactRef[] =>
      store
        .listSessions()
        .filter((s) => s.artifactCount && (!projectId || s.projectId === projectId))
        .flatMap((s) =>
          store
            .loadArtifacts(s.id)
            .map((a) => ({ sessionId: s.id, chatTitle: s.title, projectId: s.projectId, id: a.id, title: a.title, type: a.type, versions: a.versions.length, updatedAt: a.updatedAt }))
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
    handle('projects:artifacts', (id: string) => artifactRefs(id))
    handle('artifacts:all', () => artifactRefs())
    // A page you can open in your browser (React apps and diagrams load their libraries from the web).
    handle('artifacts:openInBrowser', (sessionId: string, artifactId: string, version?: number) => {
      const a = store.loadArtifacts(sessionId).find((x) => x.id === artifactId)
      const v = a?.versions[version ?? a.versions.length - 1]
      if (!a || !v) return false
      const dir = join(app.getPath('temp'), 'localclaude-artifacts')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `${safeFileName(a.title)}.html`)
      writeFileSync(file, renderArtifactPage(a.type, v.content))
      void shell.openExternal(pathToFileURL(file).href)
      return true
    })

    // ---- design
    handle(
      'design:export',
      async (sessionId: string, artifactId: string, version: number, format: 'pdf' | 'png', width: number, height?: number, exact?: boolean): Promise<DesignExportResult> => {
        const a = store.loadArtifacts(sessionId).find((x) => x.id === artifactId)
        const v = a?.versions[version]
        if (!a || !v) return { ok: false, error: 'Design not found.' }
        const file = await saveDialog(
          format === 'pdf' ? 'Export as PDF' : 'Export as PNG',
          join(app.getPath('downloads'), `${safeFileName(a.title)}.${format}`),
          [format === 'pdf' ? { name: 'PDF', extensions: ['pdf'] } : { name: 'PNG image', extensions: ['png'] }]
        )
        if (!file) return { ok: false, canceled: true }
        try {
          const slides = store.getSession(sessionId)?.design?.kind === 'slides'
          writeFileSync(file, await exportDesign(renderArtifactPage(a.type, v.content), { format, width: Math.round(width) || 1440, height: Math.round(height ?? 0), slides, exact }))
          return { ok: true, path: file }
        } catch (e) {
          log('warn', 'design export failed:', e)
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }
    )
    handle('design:exportAll', async (sessionId: string, items: { artifactId: string; version: number; width: number; height: number }[]): Promise<DesignExportResult> => {
      const all = store.loadArtifacts(sessionId)
      const pages = items.flatMap((it) => {
        const a = all.find((x) => x.id === it.artifactId)
        const v = a?.versions[it.version]
        return a && v ? [{ html: renderArtifactPage(a.type, v.content), width: Math.round(it.width), height: Math.round(it.height) }] : []
      })
      if (!pages.length) return { ok: false, error: 'There are no frames to export yet.' }
      const file = await saveDialog('Export all frames as PDF', join(app.getPath('downloads'), `${safeFileName(store.getSession(sessionId)?.title ?? 'Design')}.pdf`), [
        { name: 'PDF', extensions: ['pdf'] }
      ])
      if (!file) return { ok: false, canceled: true }
      try {
        writeFileSync(file, await exportFramesPdf(pages))
        return { ok: true, path: file }
      } catch (e) {
        log('warn', 'design export failed:', e)
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })
    // Build a design in code: a new chat in the project's folder that can read the design's file.
    handle('design:handoff', (sessionId: string, artifactId: string, version: number, folder: string) => {
      const a = store.loadArtifacts(sessionId).find((x) => x.id === artifactId)
      const v = a?.versions[version]
      if (!a || !v) throw new Error('Design not found.')
      const dir = join(app.getPath('temp'), 'localclaude-handoff')
      mkdirSync(dir, { recursive: true })
      const path = join(dir, `${safeFileName(a.title)}.${artifactExt(a)}`)
      writeFileSync(path, v.content)
      const meta = { ...manager.create(folder), additionalDirs: [dir] }
      store.upsertSession(meta)
      return { meta, path }
    })

    // ---- projects
    const projectChanged = (p: Project): Project => {
      // instructions and knowledge are part of the system prompt: idle chats restart to pick them up
      manager.restartIdle()
      return p
    }
    handle('projects:list', () => store.listProjects())
    handle('projects:create', (input: { name: string; description?: string; cwd?: string }) => createProject(store, { ...input, cwd: input.cwd || workspaceCwd() }))
    handle('projects:update', (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'cwd' | 'pinned'>>) => {
      const p = updateProject(store, id, patch)
      return Object.keys(patch).every((k) => k === 'pinned') ? p : projectChanged(p)
    })
    handle('projects:context', (id: string) => {
      const p = store.getProject(id)
      return p ? projectContext(p, store.loadProjectFiles(id)) : null
    })
    handle('projects:delete', (id: string) => {
      store.deleteProject(id)
      manager.restartIdle()
    })
    handle('projects:addFiles', async (id: string, paths: string[]) => {
      const r = await addProjectFiles(store, id, paths)
      projectChanged(r.project)
      return r
    })
    handle('projects:addKnowledgePaths', async (id: string, paths: string[]) => {
      const folders = paths.filter(isDir)
      let project = store.getProject(id)!
      for (const f of folders) project = addProjectFolder(store, id, f)
      const files = paths.filter((p) => !folders.includes(p))
      const r = files.length ? await addProjectFiles(store, id, files) : { project, skipped: [] as string[] }
      projectChanged(r.project)
      return r
    })
    handle('projects:addFolder', async (id: string) => {
      const [folder] = await openDialog({ title: 'Link a folder as knowledge', folders: true })
      return folder ? projectChanged(addProjectFolder(store, id, folder)) : null
    })
    const pickProjectDir = async (title: string): Promise<string | null> => (await openDialog({ title, folders: true }))[0] ?? null
    handle('projects:addDir', async (id: string, folder?: string) => {
      const path = folder ?? (await pickProjectDir('Add a folder to this project'))
      if (!path) return null
      if (!isDir(path)) throw new Error('Only folders can be added here.')
      return projectChanged(addProjectDir(store, id, path))
    })
    handle('projects:removeDir', (id: string, folder: string) => projectChanged(removeProjectDir(store, id, folder)))
    handle('projects:setMainDir', async (id: string) => {
      const path = await pickProjectDir('Main folder for this project')
      return path ? projectChanged(setProjectMainDir(store, id, path)) : null
    })
    handle('projects:removeFolder', (id: string, folder: string) => {
      knowledge.invalidate(folder)
      return projectChanged(removeProjectFolder(store, id, folder))
    })
    handle('projects:removeFile', (id: string, fileId: string) => projectChanged(removeProjectFile(store, id, fileId)))

    // ---- memory (global when projectId is null)
    const memoryState = (projectId: string | null): { items: MemoryItem[]; project?: Project } => {
      // memory is part of the system prompt: idle chats restart to pick up your edits
      manager.restartIdle()
      vaultSync.memoryChanged()
      const project = projectId ? store.getProject(projectId) : undefined
      return { items: getMemory(store, projectId ?? undefined), project }
    }
    handle('memory:global', () => store.getGlobalMemory())
    handle('memory:add', (projectId: string | null, text: string) => {
      addMemory(store, projectId ?? undefined, text, 'you')
      return memoryState(projectId)
    })
    handle('memory:edit', (projectId: string | null, id: string, text: string) => {
      editMemory(store, projectId ?? undefined, id, text)
      return memoryState(projectId)
    })
    handle('memory:remove', (projectId: string | null, id: string) => {
      removeMemory(store, projectId ?? undefined, id)
      return memoryState(projectId)
    })
    handle('memory:clear', (projectId: string | null) => {
      setMemory(store, projectId ?? undefined, [])
      return memoryState(projectId)
    })

    // ---- export / import
    handle('export:run', async (req: ExportRequest): Promise<ExportResult> => {
      const opts = { ...DEFAULT_EXPORT_OPTIONS, ...req.options }
      const none = { chats: 0, artifacts: 0, files: 0 }
      try {
        manager.flushAll()
        if (req.scope === 'chat') {
          const meta = req.sessionId ? store.getSession(req.sessionId) : undefined
          if (!meta) return { ok: false, error: 'Chat not found', ...none }
          const artifacts = opts.artifacts === 'none' ? [] : store.loadArtifacts(meta.id)
          const project = meta.projectId ? store.getProject(meta.projectId) : undefined
          const file = await saveDialog('Export chat', join(app.getPath('documents'), safeFileName(meta.title) + '.md'), [{ name: 'Markdown', extensions: ['md'] }])
          if (!file) return { ok: false, canceled: true, ...none }
          writeFileSync(file, chatMarkdown(meta, store.loadHistory(meta.id), opts, { project, artifacts }))
          return { ok: true, path: file, chats: 1, artifacts: artifacts.length, files: 0 }
        }
        const project = req.scope === 'project' && req.projectId ? store.getProject(req.projectId) : undefined
        if (req.scope === 'project' && !project) return { ok: false, error: 'Project not found', ...none }
        const some = req.scope === 'chats' ? (req.sessionIds ?? []) : null
        if (some && !some.length) return { ok: false, error: 'No chats selected', ...none }
        const built = some ? buildChatsExport(store, some, opts) : project ? buildProjectExport(store, project, opts) : buildFullExport(store, opts)
        const file = await saveDialog(some ? 'Export chats' : project ? 'Export project' : 'Export everything', join(app.getPath('documents'), built.name + '.zip'), [
          { name: 'ZIP archive', extensions: ['zip'] }
        ])
        if (!file) return { ok: false, canceled: true, ...none }
        writeFileSync(file, createZip(built.entries))
        return { ok: true, path: file, ...built.stats }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), ...none }
      }
    })
    handle('export:reveal', (p: string) => shell.showItemInFolder(p))
    const emptyImport = { chats: 0, projects: 0, artifacts: 0, memory: 0, skipped: 0, withoutTranscript: 0 }
    handle('import:run', async (): Promise<ImportResult> => {
      const [file] = await openDialog({ title: 'Import a LocalClaude export or backup', filters: [{ name: 'LocalClaude export or backup', extensions: ['zip', 'json', BACKUP_EXT] }] })
      if (!file) return { ok: false, canceled: true, ...emptyImport }
      try {
        const buf = readFileSync(file)
        // a password-protected backup: the view asks for the password, then calls import:withPassword
        if (isEncryptedBackup(buf)) {
          this.pendingImport = file
          return { ok: false, needsPassword: true, ...emptyImport }
        }
        const { backup, images } = readBackup(buf)
        return importBackup(store, backup, undefined, images)
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), ...emptyImport }
      }
    })
    handle('import:withPassword', async (password: string): Promise<ImportResult> => {
      if (!this.pendingImport) return { ok: false, error: 'Choose the backup file again.', ...emptyImport }
      try {
        const { backup, images } = readBackup(await decryptBackup(readFileSync(this.pendingImport), password))
        this.pendingImport = null
        return importBackup(store, backup, undefined, images)
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), ...emptyImport }
      }
    })
    handle('import:cancel', () => {
      this.pendingImport = null
    })

    // ---- backups
    handle('backup:status', () => this.backupStatus())
    handle('backup:setPassword', (password: string | null) => {
      if (password !== null && password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`)
      store.setBackupState({ password: password ?? undefined })
      return this.backupStatus()
    })
    handle('backup:runNow', () => this.runAutoBackup())
    handle('backup:saveAs', async (password: string): Promise<BackupResult> => {
      if (!password || password.length < MIN_PASSWORD) return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` }
      const file = await saveDialog('Save a backup', join(store.getSettings().backupDir || app.getPath('documents'), backupFileName()), [
        { name: 'LocalClaude backup', extensions: [BACKUP_EXT] }
      ])
      if (!file) return { ok: false, canceled: true }
      try {
        const data = await createBackup(store, password)
        writeFileSync(file, data)
        return { ok: true, path: file, size: data.length }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })

    // ---- Obsidian
    handle('obsidian:vaults', () => detectVaults())
    handle('obsidian:status', async (): Promise<VaultStatus> => {
      const { obsidianVault: v, obsidianEnabled } = store.getSettings()
      if (!v) return { linked: false }
      if (!obsidianEnabled) return { linked: true, name: basename(v), off: true }
      if (!existsSync(v)) return { linked: true, name: basename(v), missing: true }
      const { index, more } = await knowledge.folder(v, `Obsidian vault ${basename(v)}`)
      return { linked: true, name: basename(v), files: index.docs.length, passages: index.size, more }
    })
    handle('obsidian:open', (path?: string) => {
      const target = path || store.getSettings().obsidianVault
      if (target) void shell.openExternal(obsidianUri(target))
    })
    handle('obsidian:openChat', (sessionId: string) => {
      const file = vaultSync.notePath(sessionId) ?? vaultSync.writeChat(sessionId)
      if (file) void shell.openExternal(obsidianUri(file))
      return !!file
    })
    handle('obsidian:saveAll', () => {
      let n = 0
      for (const s of store.listSessions()) if (vaultSync.writeChat(s.id)) n++
      if (store.getSettings().obsidianSyncMemory) vaultSync.writeMemory()
      return n
    })

    // ---- images
    // VS Code's clipboard API holds text only, so an image is copied as a file you can paste elsewhere.
    handle('image:copy', async (sessionId: string, id: string) => {
      const data = store.loadImage(sessionId, id)
      if (!data) return false
      const ext = IMAGE_EXT[sniffImageType(data) ?? ''] ?? 'png'
      const dir = join(tmpdir(), 'localclaude-images')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `image-${id.slice(0, 8)}.${ext}`)
      writeFileSync(file, data)
      await vscode.env.clipboard.writeText(file)
      void vscode.window.showInformationMessage(`Copied the image's file path: ${file}`)
      return true
    })
    handle('image:save', async (sessionId: string, id: string): Promise<{ ok: boolean; path?: string }> => {
      const data = store.loadImage(sessionId, id)
      if (!data) return { ok: false }
      const ext = IMAGE_EXT[sniffImageType(data) ?? ''] ?? 'png'
      const file = await saveDialog('Save image', join(app.getPath('downloads'), `image-${id.slice(0, 8)}.${ext}`), [{ name: 'Image', extensions: [ext] }])
      if (!file) return { ok: false }
      writeFileSync(file, data)
      return { ok: true, path: file }
    })

    // ---- chat
    handle('chat:send', (p: SendPayload) => manager.send(this.withEditorContext(p)))
    handle('chat:interrupt', (id: string) => manager.interrupt(id))
    handle('chat:respond', (sessionId: string, requestId: string, d: PermissionDecision & { switchMode?: PermissionModeUI }) => manager.respond(sessionId, requestId, d))
    handle('chat:setMode', (id: string, mode: PermissionModeUI) => manager.setMode(id, mode))
    handle('chat:setModel', (id: string, model: string) => manager.setModel(id, model))
    handle('chat:setDirs', (id: string, dirs: string[]) => manager.setDirs(id, dirs))
    handle('models:list', () => manager.models)
    handle('chat:setStyle', (id: string, style: string) => manager.setStyle(id, style))
    handle('chat:rewindPreview', (id: string, messageId: string) => manager.rewindPreview(id, messageId))
    handle('chat:rewind', (id: string, req: RewindRequest) => manager.rewind(id, req))
    handle('mcp:test', (entry: McpServerEntry) => testMcpServer(entry, { cwd: store.getSettings().defaultCwd || workspaceCwd() || undefined }))
    handle('mcp:toggle', (id: string, name: string, enabled: boolean) => manager.toggleMcp(id, name, enabled))
    handle('mcp:reconnect', (id: string, name: string) => manager.reconnectMcp(id, name))
    handle('mcp:refresh', (id: string) => manager.refreshMcp(id))

    // ---- dialogs, files and shell
    handle('dialog:pickFolder', async (title?: string) => (await openDialog({ title: title ?? 'Choose a folder', folders: true }))[0] ?? null)
    handle('dialog:pickFiles', () => openDialog({ title: 'Attach files', many: true }))
    handle('files:readImages', (paths: string[]) => {
      const out: Attachment[] = []
      for (const p of paths) {
        const mt = IMAGE_TYPES[extname(p).toLowerCase()]
        if (!mt) continue
        if (statSync(p).size > 5 * 1024 * 1024) continue // API image limit
        out.push({ kind: 'image', mediaType: mt, base64: readFileSync(p).toString('base64'), name: basename(p) })
      }
      return out
    })
    // Drops: VS Code explorer items come as URIs; files from the OS have no path in a webview, so they're saved to a temp folder.
    handle('files:fromUris', (uris: string[]) =>
      uris.flatMap((u) => {
        try {
          const uri = vscode.Uri.parse(u, true)
          return uri.scheme === 'file' ? [uri.fsPath] : []
        } catch {
          return []
        }
      })
    )
    handle('files:saveDropped', (files: { name: string; base64: string }[]) => {
      const dir = join(tmpdir(), 'localclaude-drops', randomUUID())
      mkdirSync(dir, { recursive: true })
      return files.map((f) => {
        const file = join(dir, basename(f.name) || 'file')
        writeFileSync(file, Buffer.from(f.base64, 'base64'))
        return file
      })
    })
    handle('shell:openPath', async (p: string) => {
      // files open in the editor; folders and everything else with the OS
      if (existsSync(p) && !isDir(p)) {
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(p))
        return ''
      }
      if (isDir(p)) {
        shell.showItemInFolder(p)
        return ''
      }
      return shell.openPath(p)
    })
    handle('window:theme', () => undefined, true)
    handle('files:openInEditor', async (path: string) => {
      const uri = vscode.Uri.file(path)
      if (isDir(path)) await vscode.commands.executeCommand('revealInExplorer', uri)
      else await vscode.window.showTextDocument(uri, { preview: false })
    })
    handle('shell:openExternal', (url: string) => {
      if (/^https?:\/\//.test(url)) return shell.openExternal(url)
      return undefined
    })

    // ---- Remote Control (work from your phone while Claude runs here)
    handle('remote:state', () => remote.state)
    handle('remote:start', (opts: { cwd: string; name?: string; spawn: RemoteSpawn; permissionMode?: string }) => {
      log('info', `remote control: starting (${opts.spawn})`)
      return remote.start(opts)
    })
    handle('remote:stop', () => {
      log('info', 'remote control: stopped')
      remote.stop()
    })
    handle('remote:consent', (yes: boolean) => remote.consent(yes))
    handle('remote:trust', () => {
      log('info', 'remote control: trusted a folder in Claude Code')
      return remote.trustAndRetry()
    })

    // ---- git
    handle('git:status', (cwd: string): Promise<GitStatus | null> => gitStatus(cwd))
    handle('git:worktree', async (sessionId: string, name: string) => {
      const meta = store.getSession(sessionId)
      if (!meta) throw new Error('Unknown chat')
      if (meta.sdkSessionId) throw new Error('This chat has already started; start a new chat to use a new worktree.')
      const { path } = await createWorktree(meta.cwd, name)
      return manager.updateMeta(sessionId, { cwd: path })
    })
  }

  /** Tell Claude what's open in the editor when the setting is on (the file and the selection, not their contents). */
  private withEditorContext(p: SendPayload): SendPayload {
    if (!vscode.workspace.getConfiguration('localclaude').get<boolean>('includeEditorContext', true)) return p
    const meta = this.store.getSession(p.sessionId)
    const ctx = editorContext(meta?.cwd)
    return ctx ? { ...p, hiddenContext: [p.hiddenContext, ctx].filter(Boolean).join('\n\n') } : p
  }

  // ---------------------------------------------------------------- editor commands

  askAboutSelection(): void {
    const prompt = selectionPrompt()
    if (prompt) void this.compose({ text: prompt })
    else void vscode.window.showInformationMessage('Select some code first.')
  }

  addFileToChat(uri?: vscode.Uri, all?: vscode.Uri[]): void {
    const uris = all?.length ? all : uri ? [uri] : vscode.window.activeTextEditor ? [vscode.window.activeTextEditor.document.uri] : []
    const paths = uris.filter((u) => u.scheme === 'file').map((u) => u.fsPath)
    if (paths.length) void this.compose({ paths })
  }

  fixProblems(): void {
    const prompt = problemsPrompt()
    if (prompt) void this.compose({ text: prompt })
    else void vscode.window.showInformationMessage('There are no errors or warnings in this file.')
  }
}

let host: LocalClaudeHost | undefined

export function activate(context: vscode.ExtensionContext): void {
  const readBrowser = (): void => setBrowserPath(vscode.workspace.getConfiguration('localclaude').get<string>('browserPath', ''))
  readBrowser()
  host = new LocalClaudeHost(context)
  const h = host
  // start in the background (the OS keychain can be slow to answer); views wait for it
  h.start().catch((e) => {
    log('error', 'start-up failed:', e)
    void vscode.window.showErrorMessage(`LocalClaude could not start: ${e instanceof Error ? e.message : String(e)}`)
  })
  context.subscriptions.push(
    { dispose: () => h.dispose() },
    vscode.window.registerWebviewViewProvider(VIEW_ID, h, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('localclaude.browserPath')) readBrowser()
    }),
    vscode.commands.registerCommand('localclaude.focus', () => void h.reveal()),
    vscode.commands.registerCommand('localclaude.newChat', () => h.newChat()),
    vscode.commands.registerCommand('localclaude.openInEditor', () => void h.openInEditor()),
    vscode.commands.registerCommand('localclaude.askAboutSelection', () => h.askAboutSelection()),
    vscode.commands.registerCommand('localclaude.addFileToChat', (uri?: vscode.Uri, all?: vscode.Uri[]) => h.addFileToChat(uri, all)),
    vscode.commands.registerCommand('localclaude.fixProblems', () => h.fixProblems()),
    vscode.commands.registerCommand('localclaude.signIn', () => void h.reveal()),
    vscode.commands.registerCommand('localclaude.showLog', () => vscode.window.showTextDocument(vscode.Uri.file(logFile())))
  )
}

export function deactivate(): void {
  host?.dispose()
  host = undefined
}
