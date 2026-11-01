// Full-text search over your chats: for the sidebar, and as a tool Claude uses to look up
// earlier conversations (like the Claude app's "search and reference chats").
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { ChatMessage, ChatSearchHit, SessionMeta } from '../shared/types'
import { chatMarkdown } from './exporter'
import type { SecureStore } from './store'

export const CHAT_TOOLS = ['mcp__chats__search_chats', 'mcp__chats__read_chat']

interface Doc {
  updatedAt: number
  text: string
  lower: string
}

type Store = Pick<SecureStore, 'listSessions' | 'loadHistory' | 'getSession'>

/** The searchable text of a chat: your messages and Claude's replies (not tool output). */
export function chatText(history: ChatMessage[]): string {
  const out: string[] = []
  for (const m of history) {
    if (m.parentToolUseId || (m.role !== 'user' && m.role !== 'assistant')) continue
    for (const p of m.parts) if (p.kind === 'text' && p.text.trim()) out.push(p.text.trim())
  }
  return out.join('\n\n')
}

/** Words to match: lower-case, at least 2 characters; "quoted phrases" stay together. */
export function terms(query: string): string[] {
  const out: string[] = []
  for (const m of query.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) {
    const t = (m[1] ?? m[2]).trim()
    if (t.length >= 2) out.push(t)
  }
  return out
}

/** ~160 characters of context around the first match, on one line. */
export function snippet(text: string, lower: string, ts: string[]): string {
  let at = -1
  for (const t of ts) {
    const i = lower.indexOf(t)
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  if (at < 0) return text.slice(0, 160).replace(/\s+/g, ' ').trim()
  const start = Math.max(0, at - 60)
  const end = Math.min(text.length, at + 100)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')
}

export class ChatIndex {
  private docs = new Map<string, Doc>()

  constructor(
    private store: Store,
    /** a chat's in-memory history if it's open (fresher than what's saved) */
    private live: (id: string) => ChatMessage[] | undefined
  ) {}

  private doc(meta: SessionMeta): Doc {
    const cached = this.docs.get(meta.id)
    if (cached && cached.updatedAt === meta.updatedAt) return cached
    const text = chatText(this.live(meta.id) ?? this.store.loadHistory(meta.id))
    const d = { updatedAt: meta.updatedAt, text, lower: text.toLowerCase() }
    this.docs.set(meta.id, d)
    return d
  }

  forget(id: string): void {
    this.docs.delete(id)
  }

  /** Chats containing every term, best first: title matches, then number of matches, then recency. */
  search(query: string, opts: { limit?: number; projectId?: string | null; excludeId?: string } = {}): ChatSearchHit[] {
    const ts = terms(query)
    if (!ts.length) return []
    const hits: (ChatSearchHit & { score: number })[] = []
    for (const meta of this.store.listSessions()) {
      if (meta.id === opts.excludeId) continue
      if (opts.projectId !== undefined && (meta.projectId ?? null) !== opts.projectId) continue
      const d = this.doc(meta)
      const title = meta.title.toLowerCase()
      let matches = 0
      let all = true
      for (const t of ts) {
        let n = 0
        for (let i = d.lower.indexOf(t); i >= 0; i = d.lower.indexOf(t, i + t.length)) n++
        if (!n && !title.includes(t)) {
          all = false
          break
        }
        matches += n
      }
      if (!all) continue
      const inTitle = ts.every((t) => title.includes(t))
      hits.push({
        sessionId: meta.id,
        title: meta.title,
        projectId: meta.projectId,
        updatedAt: meta.updatedAt,
        snippet: snippet(d.text, d.lower, ts),
        matches,
        score: (inTitle ? 1000 : 0) + matches
      })
    }
    hits.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    return hits.slice(0, opts.limit ?? 30).map(({ score: _score, ...h }) => h)
  }
}

const GUIDE = `You can search the user's earlier LocalClaude chats and read one. Use this when the user refers to a past conversation ("like we discussed", "the script from last week") or when earlier context would clearly help. Search with a few distinctive words; then read the most relevant chat. Mention briefly which chat you're drawing on.`

export function createChatsServer(ctx: { index: ChatIndex; store: Store; sessionId: string; projectId?: string }) {
  const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] })
  return createSdkMcpServer({
    name: 'chats',
    version: '1.0.0',
    instructions: GUIDE,
    tools: [
      tool(
        'search_chats',
        'Search the user’s earlier chats for words or a "quoted phrase". ' + GUIDE,
        {
          query: z.string().min(1),
          scope: z.enum(['project', 'all']).optional().describe('project: only chats in this chat’s project (the default inside a project); all: every chat'),
          limit: z.number().int().min(1).max(20).optional()
        },
        async (args) => {
          const projectId = args.scope === 'all' || !ctx.projectId ? undefined : ctx.projectId
          const hits = ctx.index.search(args.query, { limit: args.limit ?? 8, projectId, excludeId: ctx.sessionId })
          if (!hits.length) return ok(`No earlier chats match "${args.query}".`)
          return ok(hits.map((h) => `[${h.sessionId}] ${h.title} · ${new Date(h.updatedAt).toISOString().slice(0, 10)}\n  ${h.snippet}`).join('\n'))
        },
        { alwaysLoad: true, searchHint: 'search past previous earlier chats conversations history', annotations: { title: 'Search chats', readOnlyHint: true } }
      ),
      tool(
        'read_chat',
        'Read one of the user’s earlier chats (by the id from search_chats) as Markdown.',
        { id: z.string(), max_chars: z.number().int().min(1000).max(100000).optional() },
        async (args) => {
          const meta = ctx.store.getSession(args.id)
          if (!meta || meta.id === ctx.sessionId) return { ...ok(`No chat with id ${args.id}.`), isError: true }
          const md = chatMarkdown(meta, ctx.store.loadHistory(meta.id), { tools: 'summary', thinking: false, artifacts: 'none', knowledge: false, backup: false })
          const max = args.max_chars ?? 30000
          return ok(md.length > max ? md.slice(0, max) + `\n\n… (${md.length - max} more characters; ask with a larger max_chars to see more)` : md)
        },
        { alwaysLoad: true, annotations: { title: 'Read chat', readOnlyHint: true } }
      )
    ]
  })
}
