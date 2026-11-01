// Your Obsidian vault as LocalClaude's knowledge store: Claude searches your notes (see knowledge.ts),
// can write notes, and your chats and memory are kept as notes in the vault (in LocalClaude/ by default).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { safeFileName } from '../shared/format'
import type { AppSettings, Artifact, ChatMessage, ImageRef, MemoryItem, ObsidianVault, Project, SessionMeta } from '../shared/types'
import { chatMarkdown, fmtTime } from './exporter'
import { IMAGE_EXT } from './images'
import { log } from './log'
import type { SecureStore } from './store'

/** Where Obsidian lists its vaults. */
export function obsidianConfigPath(): string {
  if (process.env.LOCALCLAUDE_OBSIDIAN_CONFIG) return process.env.LOCALCLAUDE_OBSIDIAN_CONFIG
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'obsidian', 'obsidian.json')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'obsidian', 'obsidian.json')
}

/** The vaults Obsidian knows on this computer, most recently used first. */
export function detectVaults(configPath = obsidianConfigPath()): ObsidianVault[] {
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as { vaults?: Record<string, { path?: string; ts?: number; open?: boolean }> }
    return Object.values(cfg.vaults ?? {})
      .filter((v): v is { path: string; ts?: number; open?: boolean } => typeof v?.path === 'string' && existsSync(v.path))
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .map((v) => ({ path: v.path, name: basename(v.path), open: !!v.open }))
  } catch {
    return []
  }
}

/** The linked vault's folder, when Obsidian is switched on and the folder is there. */
export function activeVault(s: Pick<AppSettings, 'obsidianEnabled' | 'obsidianVault'>): string | null {
  return s.obsidianEnabled && s.obsidianVault && existsSync(s.obsidianVault) ? s.obsidianVault : null
}

/** Opens a note (or the vault, for its folder) in Obsidian. */
export function obsidianUri(path: string): string {
  return 'obsidian://open?path=' + encodeURIComponent(path)
}

/** The folder inside the vault that LocalClaude writes to (never outside the vault). */
export function appFolder(vault: string, folder: string): string {
  const parts = folder.split(/[\\/]+/).filter((p) => p && p !== '.' && p !== '..').map((p) => safeFileName(p, 60))
  const dir = resolve(vault, ...(parts.length ? parts : ['LocalClaude']))
  return dir === resolve(vault) || dir.startsWith(resolve(vault) + sep) ? dir : resolve(vault, 'LocalClaude')
}

const yamlString = (s: string): string => JSON.stringify(s)

/** A chat as an Obsidian note: properties (frontmatter) and the conversation. */
export function chatNote(meta: SessionMeta, history: ChatMessage[], ctx: { project?: Project; artifacts?: Artifact[]; imageLink?: (img: ImageRef) => string | undefined }): string {
  const props = [
    '---',
    `title: ${yamlString(meta.title)}`,
    `created: ${fmtTime(meta.createdAt)}`,
    `updated: ${fmtTime(meta.updatedAt)}`,
    ctx.project ? `project: ${yamlString(ctx.project.name)}` : '',
    meta.model ? `model: ${yamlString(meta.model)}` : '',
    'tags: [localclaude, chat]',
    `localclaude_id: ${meta.id}`,
    '---'
  ].filter(Boolean)
  const body = chatMarkdown(meta, history, { tools: 'summary', thinking: false, artifacts: 'latest', knowledge: false, backup: false }, { project: ctx.project, artifacts: ctx.artifacts, imageLink: ctx.imageLink })
  return props.join('\n') + '\n\n' + body
}

/** The memory note: what Claude remembers, everywhere and per project. */
export function memoryNote(global: MemoryItem[], projects: Project[]): string {
  const out = ['---', 'tags: [localclaude, memory]', `updated: ${fmtTime(Date.now())}`, '---', '', '# Memory', '']
  out.push('_What Claude remembers in LocalClaude, kept in sync from the app. Edit memory in LocalClaude: changes made here are replaced._', '')
  out.push('## Everywhere', '')
  out.push(...(global.length ? global.map((m) => `- ${m.text}`) : ['_Nothing yet._']), '')
  for (const p of projects.filter((x) => x.memory?.length)) out.push(`## ${p.name}`, '', ...p.memory!.map((m) => `- ${m.text}`), '')
  return out.join('\n').trimEnd() + '\n'
}

/** Whether a note in the vault is this chat's (its properties carry the chat's id). */
function isNoteOf(file: string, sessionId: string): boolean {
  try {
    return readFileSync(file, 'utf8').slice(0, 4000).includes(`\nlocalclaude_id: ${sessionId}\n`)
  } catch {
    return false
  }
}

function writeIfChanged(file: string, text: string): boolean {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  return true
}

type SyncStore = Pick<SecureStore, 'getSession' | 'loadHistory' | 'loadArtifacts' | 'loadImage' | 'getProject' | 'listProjects' | 'getGlobalMemory' | 'getNotePath' | 'setNotePath'>

/** Keeps chats and memory as notes in the vault, a moment after they change. */
export class VaultSync {
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private store: SyncStore,
    private settings: () => AppSettings,
    private delayMs = 1500
  ) {}

  private vault(): string | null {
    return activeVault(this.settings())
  }

  private later(key: string, fn: () => void): void {
    clearTimeout(this.timers.get(key))
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key)
        try {
          fn()
        } catch (e) {
          // the vault may be offline or read-only: it's tried again next time
          log('warn', 'saving to the Obsidian vault failed:', e)
        }
      }, this.delayMs)
    )
  }

  chatChanged(sessionId: string): void {
    if (this.settings().obsidianSyncChats && this.vault()) this.later('chat:' + sessionId, () => this.writeChat(sessionId))
  }

  memoryChanged(): void {
    if (this.settings().obsidianSyncMemory && this.vault()) this.later('memory', () => this.writeMemory())
  }

  /** Write (or update) a chat's note now. Returns its path. */
  writeChat(sessionId: string): string | null {
    const vault = this.vault()
    const meta = this.store.getSession(sessionId)
    if (!vault || !meta) return null
    const history = this.store.loadHistory(sessionId)
    if (!history.some((m) => m.role === 'user')) return null
    const dir = join(appFolder(vault, this.settings().obsidianFolder), 'Chats')
    const name = safeFileName(`${fmtTime(meta.createdAt).slice(0, 10)} ${meta.title}`, 120)
    // two chats with the same title on the same day each keep their own note: "… (2).md"
    let want = join(dir, name + '.md')
    for (let n = 2; existsSync(want) && !isNoteOf(want, sessionId); n++) want = join(dir, `${name} (${n}).md`)
    // renamed chats rename their note; a note moved or deleted in Obsidian is written again where it belongs
    const known = this.store.getNotePath(sessionId)
    let file = known ? resolve(vault, known) : want
    if (file !== want && existsSync(file) && !existsSync(want)) {
      mkdirSync(dir, { recursive: true })
      renameSync(file, want)
    }
    file = want
    const imageLink = (img: ImageRef): string | undefined => {
      const name = `${img.id}.${IMAGE_EXT[img.mediaType] ?? 'png'}`
      const target = join(dir, 'attachments', name)
      if (!existsSync(target)) {
        const data = this.store.loadImage(sessionId, img.id)
        if (!data) return undefined
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, data)
      }
      return 'attachments/' + name
    }
    const project = meta.projectId ? this.store.getProject(meta.projectId) : undefined
    writeIfChanged(file, chatNote(meta, history, { project, artifacts: this.store.loadArtifacts(sessionId), imageLink }))
    const rel = relative(vault, file).split(sep).join('/')
    if (rel !== known) this.store.setNotePath(sessionId, rel)
    return file
  }

  writeMemory(): string | null {
    const vault = this.vault()
    if (!vault) return null
    const file = join(appFolder(vault, this.settings().obsidianFolder), 'Memory.md')
    writeIfChanged(file, memoryNote(this.store.getGlobalMemory(), this.store.listProjects()))
    return file
  }

  /** The note of a chat, if it has one in the linked vault. */
  notePath(sessionId: string): string | null {
    const vault = this.vault()
    const rel = this.store.getNotePath(sessionId)
    if (!vault || !rel) return null
    const file = resolve(vault, rel)
    return existsSync(file) ? file : null
  }
}
