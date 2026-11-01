// Export chats, projects and everything else to Markdown (single chat) or a ZIP of
// Markdown files plus artifacts, images, knowledge files and memory. A backup JSON inside
// the ZIP lets you import it back into LocalClaude, on this machine or another one.
import { ARTIFACT_LABEL, artifactExt, artifactLang, estimateTokens, fenced, safeFileName } from '../shared/format'
import { editDiff, isArtifactTool, parsedInput, plural, short, stepText, summarize, type Step, type ToolPart } from '../shared/steps'
import type { Artifact, ChatMessage, ExportOptions, ImageRef, ImportResult, MemoryItem, Project, ProjectContextUsage, SessionMeta } from '../shared/types'
import { renderArtifactPage } from './artifacts'
import { IMAGE_EXT, referencedImages } from './images'
import { PROJECT_KNOWLEDGE_LIMIT_CHARS } from './limits'
import type { SecureStore } from './store'
import { transcriptIds } from './transcripts'
import { readZip, type ZipEntry } from './zip'

type Store = Pick<
  SecureStore,
  | 'listSessions'
  | 'getSession'
  | 'loadHistory'
  | 'loadArtifacts'
  | 'listProjects'
  | 'getProject'
  | 'loadProjectFiles'
  | 'getGlobalMemory'
  | 'loadImage'
>

const pad = (n: number): string => String(n).padStart(2, '0')
/** 2026-10-06 14:32 (local time) */
export function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const day = (ts: number): string => fmtTime(ts).slice(0, 10)
const textOf = (m: ChatMessage): string => m.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')
const quote = (s: string): string =>
  s
    .split('\n')
    .map((l) => (l ? '> ' + l : '>'))
    .join('\n')
const escHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const OUTPUT_LIMIT = 6000
const clip = (s: string): string => (s.length > OUTPUT_LIMIT ? s.slice(0, OUTPUT_LIMIT) + `\n… (${(s.length - OUTPUT_LIMIT).toLocaleString()} more characters)` : s)
/** Markdown link target that may contain spaces. */
const link = (text: string, path: string): string => `[${text.replace(/[[\]]/g, '')}](<${path}>)`

// ---------------------------------------------------------------- one chat → Markdown
interface ChatContext {
  project?: Project
  artifacts?: Artifact[]
  /** when set, artifacts live in separate files and the chat links to them instead of embedding them */
  artifactLink?: (a: Artifact) => string | undefined
  /** when set (in a ZIP), images are files next to the chat and shown inline */
  imageLink?: (img: ImageRef) => string | undefined
}

/** Images as Markdown, or null when they can't be linked (a single .md file has nowhere to put them). */
function imagesMarkdown(images: ImageRef[], ctx: ChatContext, alt: string): string | null {
  if (!ctx.imageLink) return null
  const links = images.map((img) => ctx.imageLink!(img)).filter((x): x is string => !!x)
  return links.length ? links.map((l) => `![${alt}](<${l}>)`).join('\n') : null
}

function details(summary: string, body: string): string {
  return `<details>\n<summary>${escHtml(summary)}</summary>\n\n${body.trim()}\n\n</details>`
}

function stepBody(step: ToolPart, byParent: Map<string, ChatMessage[]>, opts: ExportOptions, ctx: ChatContext): string {
  const input = parsedInput(step)
  const result = stripAnsi(step.result ?? '')
  const out: string[] = []
  const diff = editDiff(step, input)
  if (diff) {
    if (input.file_path) out.push(`\`${String(input.file_path)}\``)
    out.push(fenced(diff.lines.map((l) => (l.kind === 'gap' ? '…' : (l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' ') + l.text)).join('\n'), 'diff'))
    if (step.isError && result) out.push(fenced(clip(result), 'text'))
    return out.join('\n\n')
  }
  switch (step.name) {
    case 'Bash':
    case 'PowerShell':
      out.push(fenced(`${step.name === 'Bash' ? '$' : 'PS>'} ${String(input.command ?? '')}`, step.name === 'Bash' ? 'bash' : 'powershell'))
      out.push(result.trim() ? fenced(clip(result), 'text') : '_(no output)_')
      break
    case 'TodoWrite':
      for (const t of (input.todos as { content?: string; status?: string }[]) ?? []) out.push(`- [${t.status === 'completed' ? 'x' : ' '}] ${t.content ?? ''}`)
      break
    case 'Agent':
    case 'Task': {
      out.push(`**Task:** ${short(input.prompt ?? input.description, 600)}`)
      const subs = byParent.get(step.toolUseId) ?? []
      const subSteps = subs.flatMap((m) => m.parts.filter((p): p is ToolPart => p.kind === 'tool'))
      if (subSteps.length) out.push(`_${summarize(subSteps)}_`)
      if (result.trim()) out.push(quote(clip(result.trim())))
      break
    }
    default:
      if (Object.keys(input).length) out.push(fenced(JSON.stringify(input, null, 2), 'json'))
      if (result.trim()) out.push(fenced(clip(result), 'text'))
  }
  const shots = step.images?.length ? imagesMarkdown(step.images, ctx, 'screenshot') : null
  if (shots) out.push(shots)
  if (opts.tools === 'full' && step.isError && !out.length) out.push(fenced(clip(result), 'text'))
  return out.join('\n\n')
}

function stepsMarkdown(steps: Step[], opts: ExportOptions, byParent: Map<string, ChatMessage[]>, ctx: ChatContext): string {
  const out: string[] = []
  const tools = steps.filter((s): s is ToolPart => s.kind === 'tool')
  if (opts.thinking) {
    const thought = steps
      .map((s) => (s.kind === 'thinking' ? s.text.trim() : ''))
      .filter(Boolean)
      .join('\n\n')
    if (thought) out.push(details('Thinking', thought))
  }
  if (!tools.length || opts.tools === 'none') return out.join('\n\n')
  if (opts.tools === 'summary') {
    const failed = tools.filter((t) => t.isError).length
    out.push(`> _${summarize(tools)}${failed ? ` · ${plural(failed, 'step')} failed` : ''}_`)
  } else {
    for (const t of tools) out.push(details(stepText(t).title + (t.isError ? ' (failed)' : ''), stepBody(t, byParent, opts, ctx) || '_(no details)_'))
  }
  return out.join('\n\n')
}

function artifactMention(part: ToolPart, ctx: ChatContext): string {
  const input = parsedInput(part)
  const a = (ctx.artifacts ?? []).find((x) => x.id === String(input.id ?? ''))
  const title = a?.title ?? String(input.title ?? 'Artifact')
  const verb = part.name.endsWith('update_artifact') ? 'Updated artifact' : 'Created artifact'
  if (part.isError) return `> _${verb} failed: ${title}_`
  const target = a && ctx.artifactLink?.(a)
  const label = a ? ` · ${ARTIFACT_LABEL[a.type]}` : ''
  const where = !target && a ? ' (see Artifacts below)' : ''
  return `> 📄 **${verb}:** ${target ? link(title, target) : title}${label}${where}`
}

function artifactSection(a: Artifact, which: ExportOptions['artifacts']): string {
  const versions = which === 'all' ? a.versions.map((v, i) => ({ v, i })) : [{ v: a.versions[a.versions.length - 1], i: a.versions.length - 1 }]
  const out = [`### ${a.title}`, '', `_${ARTIFACT_LABEL[a.type]} · ${plural(a.versions.length, 'version')} · updated ${fmtTime(a.updatedAt)}_`, '']
  for (const { v, i } of versions) {
    if (which === 'all') out.push(`#### Version ${i + 1} · ${fmtTime(v.ts)}`, '')
    out.push(fenced(v.content, artifactLang(a)), '')
  }
  return out.join('\n')
}

/** One chat as a Markdown document. */
export function chatMarkdown(meta: SessionMeta, history: ChatMessage[], opts: ExportOptions, ctx: ChatContext = {}): string {
  const byParent = new Map<string, ChatMessage[]>()
  const top: ChatMessage[] = []
  for (const m of history) {
    if (m.parentToolUseId) byParent.set(m.parentToolUseId, [...(byParent.get(m.parentToolUseId) ?? []), m])
    else top.push(m)
  }
  const out: string[] = [`# ${meta.title}`, '']
  const facts = [
    ctx.project ? `**Project:** ${ctx.project.name}` : '',
    `**Started:** ${fmtTime(meta.createdAt)}`,
    `**Last active:** ${fmtTime(meta.updatedAt)}`,
    `**Folder:** \`${meta.cwd}\``,
    `**Your messages:** ${top.filter((m) => m.role === 'user').length}`,
    meta.model ? `**Model:** ${meta.model}` : ''
  ].filter(Boolean)
  out.push(facts.join('  \n'), '', `_Exported from LocalClaude on ${fmtTime(Date.now())}._`, '', '---', '')

  let inClaude = false
  let pending: Step[] = []
  const flush = (): void => {
    if (!pending.length) return
    const md = stepsMarkdown(pending, opts, byParent, ctx)
    if (md) out.push(md, '')
    pending = []
  }
  for (const m of top) {
    if (m.role === 'user') {
      flush()
      inClaude = false
      out.push('## You', '', `<sub>${fmtTime(m.ts)}</sub>`, '')
      const t = textOf(m).trim()
      if (t) out.push(t, '')
      const shown = m.imageRefs?.length ? imagesMarkdown(m.imageRefs, ctx, 'image') : null
      if (shown) out.push(shown, '')
      else if (m.images) out.push(`_(${plural(m.images, 'image')} attached)_`, '')
      continue
    }
    if (m.role === 'system' || m.role === 'error') {
      flush()
      out.push(m.role === 'error' ? quote(`**Error:** ${textOf(m).trim()}`) : `_${textOf(m).trim()}_`, '')
      continue
    }
    if (!inClaude) {
      out.push('## Claude', '')
      inClaude = true
    }
    if (m.id.startsWith('cmd-') || m.id.startsWith('res-')) {
      flush()
      out.push(fenced(stripAnsi(textOf(m)).trim(), 'text'), '')
      continue
    }
    for (const p of m.parts) {
      if (p.kind === 'text') {
        if (p.text.trim()) {
          flush()
          out.push(p.text.trim(), '')
        }
      } else if (p.kind === 'tool' && isArtifactTool(p.name)) {
        flush()
        out.push(artifactMention(p, ctx), '')
      } else pending.push(p)
    }
  }
  flush()

  const artifacts = ctx.artifacts ?? []
  if (opts.artifacts !== 'none' && artifacts.length) {
    out.push('---', '', '## Artifacts', '')
    // In a ZIP the artifacts are files next to the chat; in a single Markdown file they're embedded.
    if (ctx.artifactLink)
      for (const a of artifacts) {
        const target = ctx.artifactLink(a)
        out.push(`- ${target ? link(a.title, target) : a.title} · ${ARTIFACT_LABEL[a.type]} · ${plural(a.versions.length, 'version')}`)
      }
    else for (const a of artifacts) out.push(artifactSection(a, opts.artifacts))
  }
  return out.join('\n').trimEnd() + '\n'
}

/** The earlier messages of an imported chat, sent to Claude once as context. */
export function importedContext(meta: SessionMeta, history: ChatMessage[]): string {
  const LIMIT = 120_000
  let md = chatMarkdown(meta, history, { tools: 'summary', thinking: false, artifacts: 'none', knowledge: false, backup: false })
  if (md.length > LIMIT) md = '… (earlier messages omitted)\n\n' + md.slice(-LIMIT)
  return (
    "This chat was restored from a LocalClaude export, so its earlier messages aren't in your context. Here they are for reference; continue the conversation from there.\n" +
    `<previous_conversation>\n${md}\n</previous_conversation>`
  )
}

// ---------------------------------------------------------------- ZIP exports
interface Built {
  name: string
  entries: ZipEntry[]
  stats: { chats: number; artifacts: number; files: number }
}

class Bundle {
  entries: ZipEntry[] = []
  stats = { chats: 0, artifacts: 0, files: 0 }
  private used = new Set<string>()
  /** Add a file, renaming "x.md" to "x (2).md" if the path is taken. Returns the path used. */
  add(path: string, data: string | Buffer): string {
    let p = path
    for (let n = 2; this.used.has(p.toLowerCase()); n++) p = path.replace(/(\.[^./]+)?$/, (ext) => ` (${n})${ext}`)
    this.used.add(p.toLowerCase())
    this.entries.push({ name: p, data })
    return p
  }
}

/** Relative path from a file in `fromDir` to `to` (both inside the archive). */
function rel(fromDir: string, to: string): string {
  const a = fromDir.split('/').filter(Boolean)
  const b = to.split('/').filter(Boolean)
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}

interface ChatEntry {
  meta: SessionMeta
  path: string
  artifacts: { a: Artifact; path: string }[]
}

function addChat(bundle: Bundle, store: Store, meta: SessionMeta, base: string, opts: ExportOptions, project?: Project): ChatEntry {
  const history = store.loadHistory(meta.id)
  const artifacts = opts.artifacts === 'none' ? [] : store.loadArtifacts(meta.id)
  const chatName = safeFileName(`${day(meta.createdAt)} ${meta.title}`)
  const files: { a: Artifact; path: string }[] = []
  for (const a of artifacts) {
    const dir = `${base}artifacts/${chatName}/`
    const name = safeFileName(a.title)
    const ext = artifactExt(a)
    const latest = a.versions[a.versions.length - 1]
    const path = bundle.add(`${dir}${name}.${ext}`, latest.content)
    if (opts.artifacts === 'all' && a.versions.length > 1)
      a.versions.slice(0, -1).forEach((v, i) => bundle.add(`${dir}versions/${name} (v${i + 1}).${ext}`, v.content))
    // React apps and diagrams also get a page that opens in any browser.
    if (a.type === 'react' || a.type === 'mermaid') bundle.add(`${dir}${name}.preview.html`, renderArtifactPage(a.type, latest.content))
    files.push({ a, path })
    bundle.stats.artifacts++
  }
  const chatDir = `${base}chats/`
  const path = bundle.add(`${chatDir}${chatName}.md`, '')
  const artifactLink = (a: Artifact): string | undefined => {
    const f = files.find((x) => x.a.id === a.id)
    return f ? rel(chatDir, f.path) : undefined
  }
  // images are added the first time something links to them
  const images = new Map<string, string | undefined>()
  const imageFile = (img: ImageRef): string | undefined => {
    if (!images.has(img.id)) {
      const data = store.loadImage(meta.id, img.id)
      images.set(img.id, data ? bundle.add(`${base}images/${img.id}.${IMAGE_EXT[img.mediaType] ?? 'png'}`, data) : undefined)
    }
    return images.get(img.id)
  }
  const imageLink = (img: ImageRef): string | undefined => {
    const f = imageFile(img)
    return f ? rel(chatDir, f) : undefined
  }
  bundle.entries[bundle.entries.findIndex((e) => e.name === path)].data = chatMarkdown(meta, history, opts, { project, artifacts, artifactLink, imageLink })
  // a backup restores every image, including screenshots the Markdown leaves out
  if (opts.backup) for (const img of referencedImages(history)) imageFile(img)
  bundle.stats.chats++
  return { meta, path, artifacts: files }
}

function memoryMarkdown(items: MemoryItem[], heading: string): string {
  const out = [`# ${heading}`, '']
  if (!items.length) out.push('_Nothing saved yet._')
  for (const m of items) out.push(`- ${m.text} _(${m.source === 'claude' ? 'saved by Claude' : 'added by you'}, ${day(m.createdAt)})_`)
  return out.join('\n') + '\n'
}

/** How much of Claude's context a project's instructions, knowledge and memory take (approximate). */
export function projectContext(project: Project, files: Record<string, string>): ProjectContextUsage {
  const knowledgeChars = project.files.reduce((n, f) => n + (files[f.id]?.length ?? 0), 0)
  const instructions = estimateTokens(project.instructions.length + project.description.length)
  // too much to send in full: only the list of files goes along, and Claude searches them
  const searched = knowledgeChars > PROJECT_KNOWLEDGE_LIMIT_CHARS
  const knowledge = estimateTokens(searched ? project.files.reduce((n, f) => n + f.name.length + 40, 0) : knowledgeChars)
  const memory = estimateTokens((project.memory ?? []).reduce((n, m) => n + m.text.length + 12, 0))
  return { instructions, knowledge, memory, total: instructions + knowledge + memory, searched }
}

function addProject(bundle: Bundle, store: Store, project: Project, base: string, opts: ExportOptions): void {
  const files = store.loadProjectFiles(project.id)
  const sessions = store.listSessions().filter((s) => s.projectId === project.id)
  const knowledge: { name: string; path: string; size: number }[] = []
  if (opts.knowledge) {
    for (const f of project.files) knowledge.push({ name: f.name, size: f.size, path: bundle.add(`${base}knowledge/${safeFileName(f.name, 120)}`, files[f.id] ?? '') })
    bundle.stats.files += knowledge.length
    if (project.instructions.trim()) bundle.add(`${base}instructions.md`, `# ${project.name}: instructions\n\n${project.instructions.trim()}\n`)
    bundle.add(`${base}memory.md`, memoryMarkdown(project.memory ?? [], `${project.name}: memory`))
  }
  const chats = sessions.map((s) => addChat(bundle, store, s, base, opts, project))

  const ctx = projectContext(project, files)
  const out = [`# ${project.name}`, '']
  if (project.description.trim()) out.push(project.description.trim(), '')
  out.push(`_Exported from LocalClaude on ${fmtTime(Date.now())}._`, '')
  out.push(
    '## Context',
    '',
    `Sent with every chat in this project: about **${ctx.total.toLocaleString()} tokens** (${Math.round((ctx.total / 200_000) * 100)}% of a 200K context window).`,
    '',
    `- Instructions: ~${ctx.instructions.toLocaleString()} tokens`,
    `- Knowledge: ${plural(project.files.length, 'file')}, ~${ctx.knowledge.toLocaleString()} tokens${ctx.searched ? ' (too large to send in full: Claude searches it)' : ''}`,
    `- Memory: ${plural((project.memory ?? []).length, 'item')}, ~${ctx.memory.toLocaleString()} tokens`,
    ''
  )
  if (project.cwd) out.push(`**Working folder:** \`${project.cwd}\``, '')
  if (opts.knowledge) {
    out.push('## Instructions', '', project.instructions.trim() || '_None._', '')
    out.push('## Memory', '')
    if (!(project.memory ?? []).length) out.push('_Nothing saved yet._', '')
    for (const m of project.memory ?? []) out.push(`- ${m.text}`)
    out.push('', '## Knowledge files', '')
    if (!knowledge.length) out.push('_None._')
    for (const k of knowledge) out.push(`- ${link(k.name, rel(base, k.path))} · ${(k.size / 1024).toFixed(1)} KB`)
    out.push('')
  }
  out.push('## Chats', '')
  if (!chats.length) out.push('_No chats yet._')
  for (const c of chats) out.push(`- ${link(c.meta.title, rel(base, c.path))} · last active ${day(c.meta.updatedAt)}`)
  const arts = chats.flatMap((c) => c.artifacts.map((x) => ({ ...x, chat: c.meta.title })))
  if (arts.length) {
    out.push('', '## Artifacts', '')
    for (const x of arts) out.push(`- ${link(x.a.title, rel(base, x.path))} · ${ARTIFACT_LABEL[x.a.type]} · from “${x.chat}”`)
  }
  bundle.add(`${base}README.md`, out.join('\n') + '\n')
}

export function buildProjectExport(store: Store, project: Project, opts: ExportOptions): Built {
  const bundle = new Bundle()
  const root = `${safeFileName(project.name)}/`
  addProject(bundle, store, project, root, opts)
  if (opts.backup) bundle.add(`${root}localclaude-backup.json`, JSON.stringify(buildBackup(store, { projectId: project.id })))
  return { name: `${safeFileName(project.name)} ${day(Date.now())}`, entries: bundle.entries, stats: bundle.stats }
}

export function buildFullExport(store: Store, opts: ExportOptions): Built {
  const bundle = new Bundle()
  const name = `LocalClaude export ${day(Date.now())}`
  const root = `${name}/`
  const projects = store.listProjects()
  const loose = store.listSessions().filter((s) => !s.projectId || !projects.some((p) => p.id === s.projectId))
  const projectDirs = projects.map((p) => {
    const dir = `${root}projects/${safeFileName(p.name)}/`
    addProject(bundle, store, p, dir, opts)
    return { p, readme: `${dir}README.md` }
  })
  const chats = loose.map((s) => addChat(bundle, store, s, root, opts))
  const memory = store.getGlobalMemory()
  bundle.add(`${root}memory.md`, memoryMarkdown(memory, 'Memory'))

  const out = [`# ${name}`, '', `_Everything in LocalClaude on ${fmtTime(Date.now())}: ${plural(bundle.stats.chats, 'chat')}, ${plural(projects.length, 'project')}, ${plural(bundle.stats.artifacts, 'artifact')}._`, '']
  out.push('## Memory', '', `${plural(memory.length, 'item')}: see ${link('memory.md', 'memory.md')}.`, '')
  out.push('## Projects', '')
  if (!projects.length) out.push('_None._')
  for (const d of projectDirs) out.push(`- ${link(d.p.name, rel(root, d.readme))}${d.p.description ? ` · ${short(d.p.description, 100)}` : ''}`)
  out.push('', '## Chats (not in a project)', '')
  if (!chats.length) out.push('_None._')
  for (const c of chats) out.push(`- ${link(c.meta.title, rel(root, c.path))} · last active ${day(c.meta.updatedAt)}`)
  if (opts.backup) out.push('', '---', '', '`localclaude-backup.json` holds everything in this export so you can import it back into LocalClaude (Settings → Memory & data → Import).')
  bundle.add(`${root}README.md`, out.join('\n') + '\n')
  if (opts.backup) bundle.add(`${root}localclaude-backup.json`, JSON.stringify(buildBackup(store, {})))
  return { name, entries: bundle.entries, stats: bundle.stats }
}

/** Chats you selected, as a ZIP (with a backup of just those chats). */
export function buildChatsExport(store: Store, ids: string[], opts: ExportOptions): Built {
  const bundle = new Bundle()
  const name = `LocalClaude chats ${day(Date.now())}`
  const root = `${name}/`
  const metas = ids.map((id) => store.getSession(id)).filter((m): m is SessionMeta => !!m)
  const chats = metas.map((m) => addChat(bundle, store, m, root, opts, m.projectId ? store.getProject(m.projectId) : undefined))
  const out = [`# ${name}`, '', `_${plural(chats.length, 'chat')} exported from LocalClaude on ${fmtTime(Date.now())}._`, '']
  for (const c of chats) out.push(`- ${link(c.meta.title, rel(root, c.path))} · last active ${day(c.meta.updatedAt)}`)
  bundle.add(`${root}README.md`, out.join('\n') + '\n')
  if (opts.backup) bundle.add(`${root}localclaude-backup.json`, JSON.stringify(buildBackup(store, { sessionIds: metas.map((m) => m.id) })))
  return { name, entries: bundle.entries, stats: bundle.stats }
}

// ---------------------------------------------------------------- backup & import
export interface Backup {
  format: 'localclaude-backup'
  version: 1
  exportedAt: string
  memory: MemoryItem[]
  projects: { project: Project; files: Record<string, string> }[]
  sessions: { meta: SessionMeta; history: ChatMessage[]; artifacts: Artifact[] }[]
}

/** Everything needed to restore chats, projects and memory (a whole app, one project, or some chats). */
export function buildBackup(store: Store, scope: { projectId?: string; sessionIds?: string[] }): Backup {
  const projects = scope.sessionIds ? [] : store.listProjects().filter((p) => !scope.projectId || p.id === scope.projectId)
  const sessions = store.listSessions().filter((s) => (!scope.projectId || s.projectId === scope.projectId) && (!scope.sessionIds || scope.sessionIds.includes(s.id)))
  return {
    format: 'localclaude-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    memory: scope.projectId || scope.sessionIds ? [] : store.getGlobalMemory(),
    projects: projects.map((project) => ({ project, files: store.loadProjectFiles(project.id) })),
    sessions: sessions.map((meta) => ({ meta, history: store.loadHistory(meta.id), artifacts: store.loadArtifacts(meta.id) }))
  }
}

/** Read a backup from an export ZIP (or a bare backup JSON file), with the chat images the ZIP carries. */
export function readBackup(buf: Buffer): { backup: Backup; images: Map<string, Buffer> } {
  const images = new Map<string, Buffer>()
  let json: string
  if (buf.subarray(0, 2).toString() === 'PK') {
    const entries = readZip(buf)
    const entry = entries.find((e) => e.name.endsWith('localclaude-backup.json'))
    if (!entry) throw new Error('This ZIP has no localclaude-backup.json. Export again with "Include a backup to import later" turned on.')
    json = entry.data.toString('utf8')
    for (const e of entries) {
      const m = /(?:^|\/)images\/([0-9a-f-]{36})\.(?:png|jpg|gif|webp)$/i.exec(e.name)
      if (m) images.set(m[1].toLowerCase(), e.data)
    }
  } else json = buf.toString('utf8')
  const b = JSON.parse(json) as Backup
  if (b?.format !== 'localclaude-backup' || !Array.isArray(b.sessions)) throw new Error('This file is not a LocalClaude export.')
  return { backup: b, images }
}

export const parseBackup = (buf: Buffer): Backup => readBackup(buf).backup

type ImportStore = Pick<
  SecureStore,
  | 'getSession'
  | 'upsertSessions'
  | 'saveHistory'
  | 'saveArtifacts'
  | 'saveImage'
  | 'getProject'
  | 'upsertProject'
  | 'saveProjectFiles'
  | 'getGlobalMemory'
  | 'setGlobalMemory'
>

/** Add what's in a backup. Nothing is overwritten: items that already exist here are skipped. */
export function importBackup(store: ImportStore, b: Backup, transcripts: Set<string> = transcriptIds(), images: Map<string, Buffer> = new Map()): ImportResult {
  const r: ImportResult = { ok: true, chats: 0, projects: 0, artifacts: 0, memory: 0, skipped: 0, withoutTranscript: 0 }
  for (const { project, files } of b.projects ?? []) {
    if (!project?.id || store.getProject(project.id)) {
      r.skipped++
      continue
    }
    store.upsertProject(project)
    store.saveProjectFiles(project.id, files ?? {})
    r.projects++
  }
  const memory = store.getGlobalMemory()
  const have = new Set(memory.map((m) => m.id))
  const add = (b.memory ?? []).filter((m) => m?.id && m.text && !have.has(m.id))
  if (add.length) {
    store.setGlobalMemory([...memory, ...add])
    r.memory = add.length
  }
  const metas: SessionMeta[] = []
  for (const s of b.sessions ?? []) {
    if (!s?.meta?.id || store.getSession(s.meta.id)) {
      r.skipped++
      continue
    }
    const meta: SessionMeta = { ...s.meta }
    let history = Array.isArray(s.history) ? s.history : []
    if (meta.projectId && !store.getProject(meta.projectId)) delete meta.projectId
    if (!meta.sdkSessionId || !transcripts.has(meta.sdkSessionId)) {
      // No Claude Code transcript here: the chat continues with its old messages sent as context.
      delete meta.sdkSessionId
      delete meta.tip
      delete meta.resumeAt
      if (history.length) {
        meta.imported = true
        r.withoutTranscript++
      }
      history = history.map((m) => (m.role === 'user' ? { ...m, uuid: undefined, forkAt: undefined } : m))
    }
    const artifacts = Array.isArray(s.artifacts) ? s.artifacts : []
    meta.artifactCount = artifacts.length
    store.saveHistory(meta.id, history)
    for (const img of referencedImages(history)) {
      const data = images.get(img.id)
      if (data) store.saveImage(meta.id, img.id, data)
    }
    if (artifacts.length) store.saveArtifacts(meta.id, artifacts)
    r.artifacts += artifacts.length
    metas.push(meta)
    r.chats++
  }
  if (metas.length) store.upsertSessions(metas)
  return r
}
