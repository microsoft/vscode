// Knowledge Claude can search instead of carrying it all in every message: project files too big
// to include in full, folders linked to a project, and your Obsidian vault. Files are split into
// passages and ranked with BM25; linked folders are read live from disk (re-read when they change).
import { createSdkMcpServer, tool, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { safeFileName } from '../shared/format'
import { DOC_EXTENSIONS, extractFile } from './extract'

export const KNOWLEDGE_TOOLS = ['mcp__knowledge__search_knowledge', 'mcp__knowledge__read_knowledge', 'mcp__knowledge__list_knowledge']
export const NOTE_TOOL = 'mcp__knowledge__save_note'

export interface KnowledgeDoc {
  /** what Claude and you see: a file name, or the path inside a folder or vault */
  name: string
  /** where it comes from, e.g. "project files" or "Obsidian vault Notes" */
  source: string
  text: string
  /** linked files: where they are on disk */
  path?: string
}

// ---------------------------------------------------------------- words and passages
const STOP = new Set(
  'a an and are as at be but by for from has have he her his i if in into is it its me my no not of on or our she so than that the their them then there these they this to too us was we were what when where which who why will with you your'.split(' ')
)
/** Lower-case words (any language), minus very common English ones, with a light plural fold. */
export function tokenize(s: string): string[] {
  const out: string[] = []
  for (const w of s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (w.length < 2 || STOP.has(w)) continue
    out.push(w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
  }
  return out
}

export interface Passage {
  start: number
  end: number
  /** the Markdown heading or PDF page it falls under */
  heading: string
}

const PASSAGE = 1200
/** Split text into ~1200-character passages on paragraph boundaries, remembering headings and pages. */
export function passages(text: string): Passage[] {
  const out: Passage[] = []
  let heading = ''
  let cur: Passage | null = null
  const re = /[^\n]*(?:\n(?!\s*\n)[^\n]*)*/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] === '' && re.lastIndex >= text.length) break
    if (m[0] === '') {
      re.lastIndex++
      continue
    }
    // a paragraph after a blank line starts at that line's newline
    const lead = m[0].length - m[0].trimStart().length
    const para = m[0].slice(lead)
    const start = m.index + lead
    if (!para) continue
    const h = /^(#{1,6})\s+(.+)$/m.exec(para)?.[2] ?? /^\[Page (\d+)\]/.exec(para)?.[0]
    if (h) {
      // a new section starts a new passage
      if (cur) out.push(cur)
      cur = null
      heading = h.trim()
    }
    for (let s = start; s < start + para.length; s += PASSAGE) {
      const e = Math.min(start + para.length, s + PASSAGE)
      if (cur && e - cur.start > PASSAGE) {
        out.push(cur)
        cur = null
      }
      if (!cur) cur = { start: s, end: e, heading }
      else cur.end = e
    }
  }
  if (cur) out.push(cur)
  return out
}

// ---------------------------------------------------------------- the index
export interface Hit {
  doc: KnowledgeDoc
  passage: Passage
  score: number
}

/** BM25 over the passages of a set of documents. */
export class KnowledgeIndex {
  readonly docs: KnowledgeDoc[]
  private items: { doc: number; p: Passage; len: number }[] = []
  private postings = new Map<string, [number, number][]>()
  private nameTerms: Set<string>[] = []
  private avg = 1

  constructor(docs: KnowledgeDoc[]) {
    this.docs = docs
    let total = 0
    docs.forEach((d, di) => {
      this.nameTerms.push(new Set(tokenize(d.name.replace(/\.[^.]+$/, ''))))
      const ps = passages(d.text)
      // a file with no text still has a name to find it by
      if (!ps.length) ps.push({ start: 0, end: 0, heading: '' })
      for (const p of ps) {
        const idx = this.items.length
        const tf = new Map<string, number>()
        // the file's name counts as part of its first passage
        const words = tokenize(d.text.slice(p.start, p.end) + ' ' + p.heading + (p === ps[0] ? ' ' + d.name.replace(/\.[^./]+$/, '') : ''))
        for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1)
        for (const [w, n] of tf) {
          let list = this.postings.get(w)
          if (!list) this.postings.set(w, (list = []))
          list.push([idx, n])
        }
        this.items.push({ doc: di, p, len: words.length })
        total += words.length
      }
    })
    this.avg = Math.max(1, total / Math.max(1, this.items.length))
  }

  get size(): number {
    return this.items.length
  }

  search(query: string, limit = 8): Hit[] {
    const phrases = [...query.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase().trim()).filter(Boolean)
    const terms = [...new Set(tokenize(query))]
    if (!terms.length) return []
    const N = this.items.length
    const scores = new Map<number, number>()
    for (const t of terms) {
      const list = this.postings.get(t)
      if (!list) continue
      const idf = Math.log(1 + (N - list.length + 0.5) / (list.length + 0.5))
      for (const [i, tf] of list) {
        const len = this.items[i].len
        const s = (idf * (tf * 2.2)) / (tf + 1.2 * (0.25 + (0.75 * len) / this.avg))
        scores.set(i, (scores.get(i) ?? 0) + s + (this.nameTerms[this.items[i].doc].has(t) ? idf * 0.5 : 0))
      }
    }
    const hits: Hit[] = []
    for (const [i, score] of scores) {
      const it = this.items[i]
      const doc = this.docs[it.doc]
      const text = phrases.length ? doc.text.slice(it.p.start, it.p.end).toLowerCase() : ''
      hits.push({ doc, passage: it.p, score: score + phrases.filter((p) => text.includes(p)).length * 5 })
    }
    hits.sort((a, b) => b.score - a.score)
    // at most three passages from one file, so one long file doesn't crowd out the rest
    const perDoc = new Map<KnowledgeDoc, number>()
    return hits
      .filter((h) => {
        const n = (perDoc.get(h.doc) ?? 0) + 1
        perDoc.set(h.doc, n)
        return n <= 3
      })
      .slice(0, limit)
  }
}

// ---------------------------------------------------------------- linked folders (read live)
export const FOLDER_EXTENSIONS = ['.md', '.markdown', '.txt', '.text', '.csv', '.org', '.rst', ...DOC_EXTENSIONS]
const MAX_FOLDER_FILES = 5000
const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', '.trash', '.venv', '__pycache__'])

interface CachedFile {
  mtimeMs: number
  size: number
  text: string | null
}

/** Files under a folder that can be knowledge (hidden folders and dependencies skipped). */
export function listFolder(root: string, max = MAX_FOLDER_FILES): { files: string[]; more: boolean } {
  const files: string[] = []
  const walk = (dir: string): void => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (files.length > max) return
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) walk(join(dir, e.name))
      } else if (e.isFile() && FOLDER_EXTENSIONS.includes(extname(e.name).toLowerCase())) files.push(join(dir, e.name))
    }
  }
  walk(root)
  return { files: files.slice(0, max), more: files.length > max }
}

/** Keeps each source's index, rebuilding a folder's only when its files change. */
export class KnowledgeService {
  private files = new Map<string, CachedFile>()
  private indexes = new Map<string, { sig: string; index: KnowledgeIndex; checkedAt: number; more: boolean }>()

  /** A linked folder's notes and documents. */
  async folder(root: string, label: string): Promise<{ index: KnowledgeIndex; more: boolean }> {
    const key = 'folder:' + resolve(root)
    const cached = this.indexes.get(key)
    // don't re-scan on every search
    if (cached && Date.now() - cached.checkedAt < 15_000) return cached
    const { files, more } = listFolder(root)
    const parts: string[] = []
    const docs: KnowledgeDoc[] = []
    for (const path of files) {
      let st: import('node:fs').Stats
      try {
        st = statSync(path)
      } catch {
        continue
      }
      let f = this.files.get(path)
      if (!f || f.mtimeMs !== st.mtimeMs || f.size !== st.size) {
        let text: string | null = null
        try {
          text = await extractFile(path)
        } catch {
          /* unreadable files are left out */
        }
        f = { mtimeMs: st.mtimeMs, size: st.size, text }
        this.files.set(path, f)
      }
      parts.push(`${path}:${f.mtimeMs}:${f.size}`)
      if (f.text) docs.push({ name: relative(root, path).split(sep).join('/'), source: label, text: f.text, path })
    }
    const sig = parts.join('|')
    if (cached && cached.sig === sig) {
      cached.checkedAt = Date.now()
      return cached
    }
    const entry = { sig, index: new KnowledgeIndex(docs), checkedAt: Date.now(), more }
    this.indexes.set(key, entry)
    return entry
  }

  /** A project's stored knowledge files. */
  project(id: string, version: number, files: { id: string; name: string }[], contents: () => Record<string, string>): KnowledgeIndex {
    const key = 'project:' + id
    const sig = String(version)
    const cached = this.indexes.get(key)
    if (cached && cached.sig === sig) return cached.index
    const text = contents()
    const index = new KnowledgeIndex(files.map((f) => ({ name: f.name, source: 'project files', text: text[f.id] ?? '' })))
    this.indexes.set(key, { sig, index, checkedAt: Date.now(), more: false })
    return index
  }

  /** Forget a folder's index (after Claude writes a note there, or when it's unlinked). */
  invalidate(root: string): void {
    this.indexes.delete('folder:' + resolve(root))
  }
}

// ---------------------------------------------------------------- the tools Claude uses
export interface NoteTarget {
  /** the vault folder */
  root: string
  /** LocalClaude's folder inside it */
  folder: string
}

const fmtHit = (h: Hit, n: number): string => {
  const text = h.doc.text.slice(h.passage.start, h.passage.end).replace(/\s+/g, ' ').trim()
  const where = h.passage.heading ? ` › ${h.passage.heading}` : ''
  return `[${n}] ${h.doc.name}${where} (${h.doc.source}; chars ${h.passage.start}-${h.passage.end})\n${text.length > 700 ? text.slice(0, 700) + '…' : text}`
}

export function createKnowledgeServer(ctx: {
  /** the indexes this chat can search */
  indexes: () => Promise<KnowledgeIndex[]>
  /** what the sources are, for Claude's instructions */
  describe: string
  /** where save_note writes (when you let Claude write notes) */
  notes?: NoteTarget
  onNoteSaved?: (path: string) => void
}) {
  const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] })
  const fail = (text: string) => ({ ...ok(text), isError: true })
  const allDocs = async (): Promise<KnowledgeDoc[]> => (await ctx.indexes()).flatMap((i) => i.docs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: SdkMcpToolDefinition<any>[] = [
    tool(
      'search_knowledge',
      `Search ${ctx.describe} for passages about something. Use a few distinctive words (or a "quoted phrase"). Returns the best passages with their file; read more of a file with read_knowledge.`,
      { query: z.string().min(1), limit: z.number().int().min(1).max(20).optional() },
      async (args) => {
        const hits = (await ctx.indexes())
          .flatMap((i) => i.search(args.query, args.limit ?? 8))
          .sort((a, b) => b.score - a.score)
          .slice(0, args.limit ?? 8)
        if (!hits.length) return ok(`Nothing matches "${args.query}". Try other words, or list_knowledge to see what's there.`)
        return ok(hits.map((h, i) => fmtHit(h, i + 1)).join('\n\n'))
      },
      { alwaysLoad: true, searchHint: 'search notes documents files knowledge vault obsidian project', annotations: { title: 'Search knowledge', readOnlyHint: true } }
    ),
    tool(
      'read_knowledge',
      'Read a knowledge file (by the name search_knowledge or list_knowledge showed), from `offset` characters for up to `max_chars`.',
      { name: z.string(), offset: z.number().int().min(0).optional(), max_chars: z.number().int().min(500).max(100_000).optional() },
      async (args) => {
        const docs = await allDocs()
        const want = args.name.trim().toLowerCase()
        const doc =
          docs.find((d) => d.name.toLowerCase() === want) ??
          docs.find((d) => d.name.toLowerCase() === want + '.md') ??
          docs.find((d) => d.name.toLowerCase().endsWith('/' + want) || d.name.toLowerCase().endsWith('/' + want + '.md'))
        if (!doc) return fail(`No knowledge file named "${args.name}". Use list_knowledge to see the names.`)
        const from = Math.min(args.offset ?? 0, doc.text.length)
        const max = args.max_chars ?? 20_000
        const part = doc.text.slice(from, from + max)
        const rest = doc.text.length - from - part.length
        return ok(`${doc.name} (${doc.source}; chars ${from}-${from + part.length} of ${doc.text.length})\n\n${part}${rest > 0 ? `\n\n… ${rest} more characters: read on with offset ${from + part.length}` : ''}`)
      },
      { alwaysLoad: true, annotations: { title: 'Read knowledge', readOnlyHint: true } }
    ),
    tool(
      'list_knowledge',
      'List the knowledge files (optionally only those whose path contains `filter`).',
      { filter: z.string().optional() },
      async (args) => {
        const f = args.filter?.toLowerCase()
        const docs = (await allDocs()).filter((d) => !f || d.name.toLowerCase().includes(f))
        if (!docs.length) return ok('No knowledge files' + (f ? ` matching "${args.filter}"` : '') + '.')
        const shown = docs.slice(0, 300).map((d) => `- ${d.name} (${d.source}, ${d.text.length.toLocaleString()} chars)`)
        return ok(shown.join('\n') + (docs.length > 300 ? `\n… and ${docs.length - 300} more (use a filter)` : ''))
      },
      { alwaysLoad: true, annotations: { title: 'List knowledge', readOnlyHint: true } }
    )
  ]
  if (ctx.notes) {
    const notes = ctx.notes
    tools.push(
      tool(
        'save_note',
        `Save a Markdown note into the user's Obsidian vault (in ${notes.folder}/Notes). Use it when the user asks you to write something down, or to keep a summary, plan or reference for later. Use [[wikilinks]] to link other notes. Existing notes are only changed with append: true.`,
        { title: z.string().min(1).max(120), content: z.string().min(1), subfolder: z.string().optional().describe('folder inside Notes, e.g. "Recipes"'), append: z.boolean().optional() },
        async (args) => {
          const base = resolve(notes.root, notes.folder, 'Notes')
          const dir = resolve(base, ...(args.subfolder ?? '').split(/[\\/]+/).filter(Boolean).map((p) => safeFileName(p, 60)))
          if (dir !== base && !dir.startsWith(base + sep)) return fail('That folder is outside the notes folder.')
          const file = join(dir, safeFileName(args.title, 120) + '.md')
          const exists = existsSync(file)
          if (exists && !args.append) return fail(`A note called "${basename(file)}" already exists. Pass append: true to add to it, or pick another title.`)
          mkdirSync(dir, { recursive: true })
          const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
          const body = exists
            ? readFileSync(file, 'utf8').replace(/\s*$/, '') + `\n\n---\n_Added by Claude, ${stamp}_\n\n${args.content.trim()}\n`
            : `---\ncreated: ${stamp}\nsource: LocalClaude\n---\n\n${args.content.trim()}\n`
          writeFileSync(file, body)
          ctx.onNoteSaved?.(file)
          return ok(`${exists ? 'Added to' : 'Saved'} ${relative(notes.root, file).split(sep).join('/')} in the vault.`)
        },
        { alwaysLoad: true, annotations: { title: 'Save note', readOnlyHint: false, destructiveHint: false } }
      )
    )
  }
  return createSdkMcpServer({
    name: 'knowledge',
    version: '1.0.0',
    instructions: `Search ${ctx.describe} with search_knowledge before answering questions they might cover, and say which file an answer comes from.`,
    tools
  })
}
