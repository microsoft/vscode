// Encrypted, machine-bound local storage.
//
// Two layers protect everything this app saves (settings, MCP config, chat history,
// images, artifacts, projects and their knowledge files):
//   1. AES-256-GCM with a key derived (scrypt) from this machine's OS machine id.
//      Copy the data folder to another PC and it cannot be decrypted there.
//   2. Electron safeStorage on top (Windows DPAPI / Linux libsecret keyring),
//      which also ties the data to your OS user account.
import { app, safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readMachineId } from './machineId'
import { AppSettings, Artifact, ChatMessage, DEFAULT_SETTINGS, LockStatus, MemoryItem, Project, SessionMeta } from '../shared/types'

interface Vault {
  version: 1
  machineHash: string
  settings: AppSettings
  sessions: SessionMeta[]
  projects?: Project[]
  /** global memory (project memory lives on each project) */
  memory?: MemoryItem[]
  /** automatic backups: the password, and how the last one went */
  backup?: BackupState
  /** chats kept as notes in the Obsidian vault: chat id -> note path inside the vault */
  notes?: Record<string, string>
}

export interface BackupState {
  password?: string
  lastAt?: number
  lastFile?: string
  lastSize?: number
  lastError?: string
}

const MAGIC = Buffer.from('LCV1')

export class SecureStore {
  private dir = join(app.getPath('userData'), 'vault')
  private vaultFile = join(this.dir, 'vault.bin')
  private saltFile = join(this.dir, 'salt.bin')
  private sessionsDir = join(this.dir, 'sessions')
  private artifactsDir = join(this.dir, 'artifacts')
  private projectsDir = join(this.dir, 'projects')
  private imagesDir = join(this.dir, 'images')
  private key!: Buffer
  private machineHash!: string
  private vault!: Vault
  lock: LockStatus = { ok: false, encryptionBackend: 'unknown', machineIdShort: '' }

  open(): LockStatus {
    for (const d of [this.sessionsDir, this.artifactsDir, this.projectsDir]) mkdirSync(d, { recursive: true })
    let rawId: string
    try {
      rawId = readMachineId()
    } catch (e) {
      this.lock = { ok: false, reason: `Could not read machine id: ${String(e)}`, encryptionBackend: 'none', machineIdShort: '' }
      return this.lock
    }
    this.machineHash = createHash('sha256').update('localclaude:' + rawId).digest('hex')

    let salt: Buffer
    if (existsSync(this.saltFile)) salt = readFileSync(this.saltFile)
    else {
      salt = randomBytes(32)
      writeFileSync(this.saltFile, salt)
    }
    this.key = scryptSync(rawId, salt, 32)

    const backend =
      process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function'
        ? safeStorage.getSelectedStorageBackend()
        : safeStorage.isEncryptionAvailable()
          ? process.platform === 'win32'
            ? 'dpapi'
            : 'os'
          : 'none'

    this.lock = { ok: true, encryptionBackend: backend, machineIdShort: this.machineHash.slice(0, 12) }

    if (!existsSync(this.vaultFile)) {
      this.vault = { version: 1, machineHash: this.machineHash, settings: { ...DEFAULT_SETTINGS, defaultCwd: app.getPath('home') }, sessions: [] }
      this.saveVault()
      return this.lock
    }

    try {
      const v = JSON.parse(this.decrypt(readFileSync(this.vaultFile))) as Vault
      if (v.machineHash !== this.machineHash) throw new Error('machine mismatch')
      v.settings = { ...DEFAULT_SETTINGS, ...v.settings }
      this.vault = v
      this.countArtifactsOnce()
    } catch {
      this.lock = {
        ...this.lock,
        ok: false,
        reason:
          'This app data was created on a different machine or OS user account, so it cannot be opened here. You can reset to start fresh on this machine (the old data stays unreadable).'
      }
    }
    return this.lock
  }

  /** Wipe all app data and start fresh, bound to this machine. */
  reset(): LockStatus {
    rmSync(this.dir, { recursive: true, force: true })
    return this.open()
  }

  // ---------- crypto ----------
  private encrypt(plain: string | Buffer): Buffer {
    const iv = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', this.key, iv)
    const body = Buffer.concat([typeof plain === 'string' ? c.update(plain, 'utf8') : c.update(plain), c.final()])
    let out = Buffer.concat([MAGIC, iv, c.getAuthTag(), body])
    if (safeStorage.isEncryptionAvailable()) {
      out = Buffer.concat([Buffer.from('S'), safeStorage.encryptString(out.toString('base64'))])
    } else {
      out = Buffer.concat([Buffer.from('P'), out])
    }
    return out
  }

  private decrypt(buf: Buffer): string {
    return this.decryptBytes(buf).toString('utf8')
  }

  private decryptBytes(buf: Buffer): Buffer {
    let inner: Buffer
    const tag = buf.subarray(0, 1).toString()
    if (tag === 'S') inner = Buffer.from(safeStorage.decryptString(buf.subarray(1)), 'base64')
    else if (tag === 'P') inner = buf.subarray(1)
    else throw new Error('bad vault')
    if (!inner.subarray(0, 4).equals(MAGIC)) throw new Error('bad magic')
    const iv = inner.subarray(4, 16)
    const authTag = inner.subarray(16, 32)
    const d = createDecipheriv('aes-256-gcm', this.key, iv)
    d.setAuthTag(authTag)
    return Buffer.concat([d.update(inner.subarray(32)), d.final()])
  }

  private atomicWrite(file: string, data: Buffer): void {
    const tmp = file + '.tmp'
    writeFileSync(tmp, data)
    renameSync(tmp, file)
  }

  private saveVault(): void {
    this.atomicWrite(this.vaultFile, this.encrypt(JSON.stringify(this.vault)))
  }

  // ---------- settings ----------
  getSettings(): AppSettings {
    return this.vault.settings
  }
  setSettings(s: Partial<AppSettings>): AppSettings {
    this.vault.settings = { ...this.vault.settings, ...s }
    this.saveVault()
    return this.vault.settings
  }

  // ---------- sessions ----------
  listSessions(): SessionMeta[] {
    return [...this.vault.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  }
  getSession(id: string): SessionMeta | undefined {
    return this.vault.sessions.find((s) => s.id === id)
  }
  /** Save many chats with one vault write (used by import). */
  upsertSessions(list: SessionMeta[]): void {
    for (const meta of list) {
      const i = this.vault.sessions.findIndex((s) => s.id === meta.id)
      if (i >= 0) this.vault.sessions[i] = meta
      else this.vault.sessions.push(meta)
    }
    this.saveVault()
  }
  upsertSession(meta: SessionMeta): void {
    const i = this.vault.sessions.findIndex((s) => s.id === meta.id)
    if (i >= 0) this.vault.sessions[i] = meta
    else this.vault.sessions.push(meta)
    this.saveVault()
  }
  deleteSession(id: string): void {
    this.vault.sessions = this.vault.sessions.filter((s) => s.id !== id)
    this.saveVault()
    rmSync(this.historyFile(id), { force: true })
    rmSync(this.artifactsFile(id), { force: true })
    rmSync(this.imageDir(id), { recursive: true, force: true })
  }

  private historyFile(id: string): string {
    return join(this.sessionsDir, id.replace(/[^a-zA-Z0-9-]/g, '') + '.bin')
  }
  loadHistory(id: string): ChatMessage[] {
    const f = this.historyFile(id)
    if (!existsSync(f)) return []
    try {
      return JSON.parse(this.decrypt(readFileSync(f))) as ChatMessage[]
    } catch {
      return []
    }
  }
  saveHistory(id: string, messages: ChatMessage[]): void {
    this.atomicWrite(this.historyFile(id), this.encrypt(JSON.stringify(messages)))
  }

  // ---------- images (one encrypted file each, in a folder per chat) ----------
  private imageDir(sessionId: string): string {
    return join(this.imagesDir, sessionId.replace(/[^a-zA-Z0-9-]/g, ''))
  }
  private imageFile(sessionId: string, id: string): string {
    return join(this.imageDir(sessionId), id.replace(/[^a-zA-Z0-9-]/g, '') + '.bin')
  }
  saveImage(sessionId: string, id: string, data: Buffer): void {
    mkdirSync(this.imageDir(sessionId), { recursive: true })
    this.atomicWrite(this.imageFile(sessionId, id), this.encrypt(data))
  }
  loadImage(sessionId: string, id: string): Buffer | null {
    const f = this.imageFile(sessionId, id)
    if (!existsSync(f)) return null
    try {
      return this.decryptBytes(readFileSync(f))
    } catch {
      return null
    }
  }
  /** Delete a chat's images that its history no longer points to (after rewinds and edits). */
  pruneImages(sessionId: string, keep: Set<string>): number {
    const dir = this.imageDir(sessionId)
    if (!existsSync(dir)) return 0
    let n = 0
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.bin') || keep.has(f.slice(0, -4))) continue
      rmSync(join(dir, f), { force: true })
      n++
    }
    return n
  }

  // ---------- notes in the Obsidian vault ----------
  getNotePath(sessionId: string): string | undefined {
    return this.vault.notes?.[sessionId]
  }
  setNotePath(sessionId: string, rel: string | undefined): void {
    const notes = { ...this.vault.notes }
    if (rel) notes[sessionId] = rel
    else delete notes[sessionId]
    this.vault.notes = notes
    this.saveVault()
  }

  // ---------- backups ----------
  getBackupState(): BackupState {
    return this.vault.backup ?? {}
  }
  setBackupState(patch: Partial<BackupState>): void {
    this.vault.backup = { ...this.vault.backup, ...patch }
    this.saveVault()
  }

  // ---------- memory ----------
  getGlobalMemory(): MemoryItem[] {
    return this.vault.memory ?? []
  }
  setGlobalMemory(items: MemoryItem[]): void {
    this.vault.memory = items
    this.saveVault()
  }

  /** Chats saved before artifact counts existed get theirs once, for the sidebar icon. */
  private countArtifactsOnce(): void {
    let changed = false
    for (const s of this.vault.sessions) {
      if (s.artifactCount !== undefined) continue
      s.artifactCount = existsSync(this.artifactsFile(s.id)) ? this.loadArtifacts(s.id).length : 0
      changed = true
    }
    if (changed) this.saveVault()
  }

  // ---------- artifacts (one encrypted file per chat) ----------
  private artifactsFile(sessionId: string): string {
    return join(this.artifactsDir, sessionId.replace(/[^a-zA-Z0-9-]/g, '') + '.bin')
  }
  loadArtifacts(sessionId: string): Artifact[] {
    return this.readJson<Artifact[]>(this.artifactsFile(sessionId), [])
  }
  saveArtifacts(sessionId: string, artifacts: Artifact[]): void {
    this.atomicWrite(this.artifactsFile(sessionId), this.encrypt(JSON.stringify(artifacts)))
  }

  // ---------- projects ----------
  listProjects(): Project[] {
    return [...(this.vault.projects ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)
  }
  getProject(id: string): Project | undefined {
    return this.vault.projects?.find((p) => p.id === id)
  }
  upsertProject(p: Project): void {
    const list = (this.vault.projects ??= [])
    const i = list.findIndex((x) => x.id === p.id)
    if (i >= 0) list[i] = p
    else list.push(p)
    this.saveVault()
  }
  deleteProject(id: string): void {
    this.vault.projects = (this.vault.projects ?? []).filter((p) => p.id !== id)
    // its chats stay, they just leave the project
    for (const s of this.vault.sessions) if (s.projectId === id) delete s.projectId
    this.saveVault()
    rmSync(this.projectFilesFile(id), { force: true })
  }
  /** Contents of a project's knowledge files, keyed by file id (kept apart from the vault: they can be large). */
  private projectFilesFile(id: string): string {
    return join(this.projectsDir, id.replace(/[^a-zA-Z0-9-]/g, '') + '.bin')
  }
  loadProjectFiles(id: string): Record<string, string> {
    return this.readJson<Record<string, string>>(this.projectFilesFile(id), {})
  }
  saveProjectFiles(id: string, files: Record<string, string>): void {
    this.atomicWrite(this.projectFilesFile(id), this.encrypt(JSON.stringify(files)))
  }

  private readJson<T>(file: string, fallback: T): T {
    if (!existsSync(file)) return fallback
    try {
      return JSON.parse(this.decrypt(readFileSync(file))) as T
    } catch {
      return fallback
    }
  }

  countHistoryFiles(): number {
    return readdirSync(this.sessionsDir).length
  }
}
