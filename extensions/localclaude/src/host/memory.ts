// Memory: short facts Claude keeps across chats, like memory in the Claude app.
// Global memory applies to every chat; project memory only to chats in that project.
// Claude saves and forgets items with an in-process MCP tool; you can edit them in the app.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { MemoryItem, Project } from '../shared/types'
import type { SecureStore } from './store'

export const MEMORY_TOOLS = ['mcp__memory__remember', 'mcp__memory__forget']
export const MAX_MEMORY_ITEMS = 200
const MAX_TEXT = 500

type Store = Pick<SecureStore, 'getGlobalMemory' | 'setGlobalMemory' | 'getProject' | 'upsertProject'>

const newId = (): string => 'm' + randomBytes(3).toString('hex')
const norm = (t: string): string => t.toLowerCase().replace(/\s+/g, ' ').replace(/[.!\s]+$/, '').trim()

/** Memory for one scope: a project's, or global when projectId is undefined. */
export function getMemory(store: Store, projectId?: string): MemoryItem[] {
  return projectId ? (store.getProject(projectId)?.memory ?? []) : store.getGlobalMemory()
}

/** Replace a scope's memory. Returns the updated project for project scope. */
export function setMemory(store: Store, projectId: string | undefined, items: MemoryItem[]): Project | undefined {
  if (!projectId) {
    store.setGlobalMemory(items)
    return undefined
  }
  const p = store.getProject(projectId)
  if (!p) throw new Error('Unknown project')
  const next = { ...p, memory: items, updatedAt: Date.now() }
  store.upsertProject(next)
  return next
}

export function addMemory(
  store: Store,
  projectId: string | undefined,
  text: string,
  source: MemoryItem['source'],
  sessionId?: string
): { item?: MemoryItem; duplicate?: MemoryItem; full?: boolean } {
  const clean = text.trim().slice(0, MAX_TEXT)
  if (!clean) return {}
  const items = getMemory(store, projectId)
  const dup = items.find((m) => norm(m.text) === norm(clean))
  if (dup) return { duplicate: dup }
  if (items.length >= MAX_MEMORY_ITEMS) return { full: true }
  const item: MemoryItem = { id: newId(), text: clean, source, createdAt: Date.now(), sessionId }
  setMemory(store, projectId, [...items, item])
  return { item }
}

export function removeMemory(store: Store, projectId: string | undefined, id: string): boolean {
  const items = getMemory(store, projectId)
  if (!items.some((m) => m.id === id)) return false
  setMemory(store, projectId, items.filter((m) => m.id !== id))
  return true
}

export function editMemory(store: Store, projectId: string | undefined, id: string, text: string): boolean {
  const items = getMemory(store, projectId)
  const clean = text.trim().slice(0, MAX_TEXT)
  if (!clean || !items.some((m) => m.id === id)) return false
  setMemory(
    store,
    projectId,
    items.map((m) => (m.id === id ? { ...m, text: clean, updatedAt: Date.now() } : m))
  )
  return true
}

/** The <memory> block added to the system prompt. */
export function memoryPrompt(global: MemoryItem[], project?: { name: string; items: MemoryItem[] }): string {
  const list = (items: MemoryItem[]): string => (items.length ? items.map((m) => `- [${m.id}] ${m.text}`).join('\n') : '(empty)')
  const parts = [
    '<memory>',
    'Your persistent memory from earlier chats (ids in brackets). Use it when relevant, without mentioning it unless asked. Keep it accurate with the memory tools.',
    `<global>\n${list(global)}\n</global>`
  ]
  if (project) parts.push(`<project name="${project.name}">\n${list(project.items)}\n</project>`)
  parts.push('</memory>')
  return parts.join('\n')
}

const GUIDE = `You have a persistent memory that carries over to future chats; its current contents are in your system prompt under <memory>.
Use remember to save durable, useful facts: the user's preferences (tone, format, languages, tools), background about them or their work, and decisions or conventions for this project. Save when the user shares something that will matter later, or asks you to remember it. Each memory is one short, self-contained sentence.
Never save passwords, keys or tokens, and don't save sensitive personal details unless the user explicitly asks. Don't save things that only matter for the current task, and don't duplicate existing memories.
Use forget with a memory's id when the user asks you to forget something, or when a memory is outdated or wrong (then remember the corrected fact).`

export function createMemoryServer(ctx: { store: Store; sessionId: string; projectId?: string; onChange: (projectId: string | undefined) => void }) {
  const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] })
  const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true })
  return createSdkMcpServer({
    name: 'memory',
    version: '1.0.0',
    instructions: GUIDE,
    tools: [
      tool(
        'remember',
        'Save a fact to persistent memory for future chats. ' + GUIDE,
        {
          text: z.string().min(1).max(MAX_TEXT).describe('One short, self-contained sentence'),
          scope: z
            .enum(['project', 'global'])
            .optional()
            .describe('project: only chats in this project; global: every chat. Defaults to project when this chat is in a project.')
        },
        async (args) => {
          const projectId = args.scope === 'global' || !ctx.projectId ? undefined : ctx.projectId
          const r = addMemory(ctx.store, projectId, args.text, 'claude', ctx.sessionId)
          const where = projectId ? 'project memory' : 'global memory'
          if (r.duplicate) return ok(`Already in ${where} as [${r.duplicate.id}].`)
          if (r.full) return fail(`${where} is full (${MAX_MEMORY_ITEMS} items). Forget an outdated memory first.`)
          if (!r.item) return fail('Nothing to remember.')
          ctx.onChange(projectId)
          return ok(`Saved to ${where} as [${r.item.id}].`)
        },
        // Loaded up front (not behind tool search) so Claude can save a memory the moment it hears one.
        { alwaysLoad: true, searchHint: 'remember save memory preference fact', annotations: { title: 'Remember' } }
      ),
      tool(
        'forget',
        'Remove a memory by its id (shown in brackets in your memory).',
        { id: z.string() },
        async (args) => {
          for (const projectId of ctx.projectId ? [ctx.projectId, undefined] : [undefined]) {
            if (removeMemory(ctx.store, projectId, args.id)) {
              ctx.onChange(projectId)
              return ok(`Removed [${args.id}] from ${projectId ? 'project' : 'global'} memory.`)
            }
          }
          return fail(`No memory with id [${args.id}].`)
        },
        { alwaysLoad: true, searchHint: 'forget remove memory', annotations: { title: 'Forget' } }
      )
    ]
  })
}
