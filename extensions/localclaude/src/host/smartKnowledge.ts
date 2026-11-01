// Claude-powered knowledge search (optional, Settings → Tools → Knowledge). Instead of an embedding
// model, Claude itself helps find things in your knowledge, in three ways you can switch on separately:
//
//  1. Reranking: the keyword (BM25) search finds a few dozen candidate passages and a short Claude
//     request picks the ones that actually answer the question.
//  2. Research helper: a subagent that searches and reads the knowledge on the chat's behalf and
//     reports back with only what matters and where it came from, so long documents don't fill the
//     chat's context.
//  3. Passage context: when knowledge is indexed, Claude writes one line per passage saying where it
//     sits in its document and what it's about ("Reference manual › ADC › regular sequence register
//     ADC_SQR1"). The line is searched along with the passage, so a search finds it by words the
//     passage itself never uses. Written once per document, stored encrypted, reused after that.
//
// All of it runs on your Claude subscription through Claude Code, like the chats.
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { passages, type Hit, type KnowledgeDoc } from './knowledge'
import { resolveClaudeBinary, subscriptionEnv } from './claude'
import { log } from './log'
import { query } from './sdk'

/** One tool-free Claude request: returns the reply text, or null if it failed. */
export type Ask = (prompt: string, system: string) => Promise<string | null>

/** Ask Claude through Claude Code with no tools and no session, like the chat titles. */
export function claudeAsk(model: () => string, timeoutMs = 90_000): Ask {
  return async (prompt, system) => {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), timeoutMs)
    try {
      const q = query({
        prompt,
        options: {
          model: model() || 'haiku',
          tools: [],
          maxTurns: 1,
          persistSession: false,
          settingSources: [],
          cwd: tmpdir(),
          env: subscriptionEnv(),
          pathToClaudeCodeExecutable: resolveClaudeBinary(),
          systemPrompt: system,
          settings: { autoMemoryEnabled: false, enableArtifact: false },
          abortController: abort
        }
      })
      let out: string | null = null
      for await (const m of q) if (m.type === 'result' && m.subtype === 'success' && !m.is_error) out = m.result ?? ''
      return out
    } catch (e) {
      log('warn', 'knowledge helper request failed:', e)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

// ---------------------------------------------------------------- 1. reranking

const RERANK_CHARS = 600

const RERANK_SYSTEM =
  'You pick the passages that help answer a question. Reply with a JSON array of passage numbers, most useful first, and nothing else. Reply [] when none of them help.'

/** Pull the first JSON array of numbers out of a reply. */
export function parseIdList(reply: string | null): number[] | null {
  const m = reply ? /\[[\d\s,]*\]/.exec(reply) : null
  if (!m) return null
  try {
    const ids = JSON.parse(m[0]) as unknown
    return Array.isArray(ids) ? ids.filter((n): n is number => Number.isInteger(n)) : null
  } catch {
    return null
  }
}

/**
 * Claude's choice from the keyword search's candidates: the passages that answer `question`,
 * best first, at most `limit`. Null when Claude couldn't answer (the caller keeps the keyword order).
 */
export async function rerankHits(ask: Ask, question: string, candidates: Hit[], limit: number): Promise<Hit[] | null> {
  if (candidates.length <= 1) return candidates
  const list = candidates
    .map((h, i) => {
      const text = h.doc.text.slice(h.passage.start, h.passage.end).replace(/\s+/g, ' ').trim()
      const where = [h.doc.name, h.passage.heading].filter(Boolean).join(' › ')
      return `<passage n="${i + 1}" from="${where.replace(/"/g, "'")}">\n${text.length > RERANK_CHARS ? text.slice(0, RERANK_CHARS) + '…' : text}\n</passage>`
    })
    .join('\n')
  const prompt = `<question>\n${question}\n</question>\n\n${list}\n\nWhich passages help answer the question? At most ${limit}, as a JSON array of their numbers, best first.`
  const ids = parseIdList(await ask(prompt, RERANK_SYSTEM))
  if (!ids) return null
  const seen = new Set<number>()
  const out: Hit[] = []
  for (const n of ids) {
    const h = candidates[n - 1]
    if (h && !seen.has(n)) {
      seen.add(n)
      out.push(h)
    }
    if (out.length >= limit) break
  }
  return out
}

// ---------------------------------------------------------------- 2. the research helper

export const RESEARCH_AGENT_NAME = 'knowledge-researcher'

/** The research helper: reads through the knowledge for the chat and reports what it found, with sources. */
export function researchAgent(tools: string[]) {
  return {
    description:
      "Researches the user's knowledge (project files, linked folders, notes, datasheets, manuals) and reports back with the facts that answer a question and exactly where each came from. Use it for questions that need several passages or long documents. Brief it with the full question and what you already know.",
    prompt: [
      "You research the user's knowledge to answer one question for another Claude, who will answer the user from your report.",
      '',
      '1. Search with search_knowledge, several times with different wording: the names, numbers and terms the documents are likely to use (register and bit names, function names, part numbers, section titles), and synonyms. Pass your question as `question` too.',
      '2. Read the promising files around the passages you found with read_knowledge, enough to be sure: tables, the rest of a section, the next page.',
      '3. Reply with a short report: the facts that answer the question, each with its source (file › section or [Page n]). Copy exact values as written: register and bit names, addresses, numbers, units, limits, code. Say clearly what you could not find, and anything that disagrees between sources.',
      '',
      "Don't answer from general knowledge where the documents should say it; the point is what the user's documents say. Keep the report under about 400 words unless the question needs a longer table or listing."
    ].join('\n'),
    tools,
    model: 'inherit' as const,
    omitClaudeMd: true,
    maxTurns: 20
  }
}

// ---------------------------------------------------------------- 3. passage context

/** Where written contexts are kept (encrypted by the store), by document fingerprint. */
export interface ContextCache {
  loadKnowledgeContext(key: string): string[] | null
  saveKnowledgeContext(key: string, contexts: string[]): void
}

export interface ContextStatus {
  /** documents waiting or being worked on */
  queuedDocs: number
  /** passages written in this run, and how many the queued documents have in all */
  done: number
  total: number
  running: boolean
  lastError?: string
}

/** Passages per Claude request, documents written at the same time, and the largest document handled. */
const BATCH = 20
const PARALLEL = 2
const MAX_PASSAGES = 3000
const CONTEXT_CHARS = 1000
/** After a failure, a document waits this long before it's tried again. */
const RETRY_MS = 30 * 60_000

const CONTEXT_SYSTEM =
  'You write search context for passages of a document. For each passage, write one sentence of at most 30 words that says where it sits in the document and what it is about: the part or section, the component, peripheral, register, function or topic, and other words someone might search for it with. Reply with a JSON object mapping each passage number to its sentence, and nothing else.'

/** A document's fingerprint: its text and how it's split into passages (so a change of either writes it again). */
export function contextKey(doc: KnowledgeDoc): string {
  return createHash('sha256').update('ctx1\0' + doc.name + '\0' + doc.text).digest('hex').slice(0, 40)
}

/** The document's outline: its headings and pages, so Claude knows where a passage sits. */
function outline(doc: KnowledgeDoc): string {
  const heads: string[] = []
  for (const m of doc.text.matchAll(/^(#{1,4})\s+(.+)$/gm)) heads.push('  '.repeat(m[1].length - 1) + m[2].trim())
  if (heads.length < 3) {
    // PDFs: the first line of each page usually names the section
    for (const m of doc.text.matchAll(/^\[Page (\d+)\]\n(.{3,80})/gm)) heads.push(`p${m[1]}: ${m[2].trim()}`)
  }
  const lines = heads.slice(0, 120)
  return lines.join('\n') + (heads.length > lines.length ? `\n… ${heads.length - lines.length} more` : '')
}

/** Parse {"1": "...", "2": "..."} (tolerating text around it). */
export function parseContexts(reply: string | null): Record<string, string> | null {
  const m = reply ? /\{[\s\S]*\}/.exec(reply) : null
  if (!m) return null
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string') out[k] = v.replace(/\s+/g, ' ').trim().slice(0, 300)
    return out
  } catch {
    return null
  }
}

/**
 * Writes passage contexts in the background, one document at a time (two at once), and keeps
 * them in the encrypted cache. Searches use whatever is ready; `onReady` lets the knowledge
 * service rebuild an index when a document's contexts arrive.
 */
export class ContextWriter {
  private memo = new Map<string, string[] | null>()
  private queue: { key: string; doc: KnowledgeDoc }[] = []
  private queued = new Set<string>()
  private active = 0
  private failedAt = new Map<string, number>()
  private st: ContextStatus = { queuedDocs: 0, done: 0, total: 0, running: false }

  constructor(
    private cache: ContextCache,
    private ask: Ask,
    private onReady: () => void,
    private onStatus: (s: ContextStatus) => void = () => {}
  ) {}

  /** Contexts for this document's passages, if they've been written. */
  get(doc: KnowledgeDoc): string[] | undefined {
    const key = contextKey(doc)
    if (!this.memo.has(key)) this.memo.set(key, this.cache.loadKnowledgeContext(key))
    return this.memo.get(key) ?? undefined
  }

  /** Queue the documents that don't have contexts yet. */
  want(docs: KnowledgeDoc[]): void {
    for (const doc of docs) {
      if (!doc.text.trim() || this.get(doc)) continue
      const key = contextKey(doc)
      if (this.queued.has(key) || Date.now() - (this.failedAt.get(key) ?? 0) < RETRY_MS) continue
      const n = passages(doc.text).length
      if (n > MAX_PASSAGES) {
        log('info', `passage context: ${doc.name} has ${n} passages, more than ${MAX_PASSAGES}; searched without context`)
        continue
      }
      this.queued.add(key)
      this.queue.push({ key, doc })
      this.st.total += n
    }
    this.pump()
  }

  status(): ContextStatus {
    return { ...this.st, queuedDocs: this.queued.size, running: this.active > 0 }
  }

  /** Stop (the setting was switched off): what's written so far is kept. */
  stop(): void {
    this.queue = []
    this.queued.clear()
    this.st = { queuedDocs: 0, done: 0, total: 0, running: this.active > 0 }
    this.onStatus(this.status())
  }

  private pump(): void {
    while (this.active < PARALLEL && this.queue.length) {
      const job = this.queue.shift()!
      this.active++
      void this.write(job.key, job.doc).finally(() => {
        this.active--
        this.queued.delete(job.key)
        if (!this.queued.size) this.st = { queuedDocs: 0, done: 0, total: 0, running: false, lastError: this.st.lastError }
        this.onStatus(this.status())
        this.pump()
      })
    }
    this.onStatus(this.status())
  }

  private async write(key: string, doc: KnowledgeDoc): Promise<void> {
    const ps = passages(doc.text)
    const out: string[] = new Array(ps.length).fill('')
    const head = `<document name="${doc.name.replace(/"/g, "'")}" source="${doc.source.replace(/"/g, "'")}">\n<outline>\n${outline(doc) || '(no headings)'}\n</outline>\n</document>`
    for (let i = 0; i < ps.length; i += BATCH) {
      // stopped while writing: leave it for next time
      if (!this.queued.has(key)) return
      const batch = ps.slice(i, i + BATCH)
      const body = batch
        .map((p, j) => {
          const text = doc.text.slice(p.start, p.end).trim()
          return `<passage n="${j + 1}"${p.heading ? ` under="${p.heading.replace(/"/g, "'")}"` : ''}>\n${text.length > CONTEXT_CHARS ? text.slice(0, CONTEXT_CHARS) + '…' : text}\n</passage>`
        })
        .join('\n')
      const got = parseContexts(await this.ask(`${head}\n\n${body}\n\nWrite the context sentence for each of the ${batch.length} passages.`, CONTEXT_SYSTEM))
      if (!got) {
        this.failedAt.set(key, Date.now())
        this.st.lastError = `Claude didn't write contexts for ${doc.name}; it is searched without them for now.`
        log('warn', `passage context: no usable reply for ${doc.name} (passages ${i + 1}-${i + batch.length})`)
        return
      }
      batch.forEach((_, j) => (out[i + j] = got[String(j + 1)] ?? ''))
      this.st.done += batch.length
      this.onStatus(this.status())
    }
    this.cache.saveKnowledgeContext(key, out)
    this.memo.set(key, out)
    this.st.lastError = undefined
    log('info', `passage context: wrote ${ps.length} for ${doc.name}`)
    this.onReady()
  }
}
