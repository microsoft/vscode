// Pure chat-history reducer shared by main (authoritative copy that gets saved)
// and renderer (live view). Keeping one implementation means both stay in sync.
import { AgentEvent, ChatMessage, ContentPart } from './types'

function updateMessage(history: ChatMessage[], id: string, fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].id === id) {
      const next = history.slice()
      next[i] = fn(history[i])
      return next
    }
  }
  return history
}

function setPart(m: ChatMessage, index: number, fn: (p: ContentPart | undefined) => ContentPart): ChatMessage {
  const parts = m.parts.slice()
  while (parts.length < index) parts.push({ kind: 'text', text: '' })
  parts[index] = fn(parts[index])
  return { ...m, parts }
}

export function applyEvent(history: ChatMessage[], e: AgentEvent): ChatMessage[] {
  switch (e.type) {
    case 'message-start':
      if (history.some((m) => m.id === e.message.id)) return history
      return [...history, e.message]

    case 'text-delta':
      return updateMessage(history, e.messageId, (m) =>
        setPart(m, e.partIndex, (p) => ({ kind: 'text', text: (p && p.kind === 'text' ? p.text : '') + e.text }))
      )

    case 'thinking-delta':
      return updateMessage(history, e.messageId, (m) =>
        setPart(m, e.partIndex, (p) => ({ kind: 'thinking', text: (p && p.kind === 'thinking' ? p.text : '') + e.text }))
      )

    case 'tool-start':
      return updateMessage(history, e.messageId, (m) =>
        setPart(m, e.partIndex, () => ({ kind: 'tool', toolUseId: e.toolUseId, name: e.name, input: {}, inputJsonPartial: '', done: false }))
      )

    case 'tool-input-delta':
      return updateMessage(history, e.messageId, (m) =>
        setPart(m, e.partIndex, (p) =>
          p && p.kind === 'tool' ? { ...p, inputJsonPartial: (p.inputJsonPartial ?? '') + e.json } : (p as ContentPart)
        )
      )

    case 'message-final': {
      const idx = history.findIndex((m) => m.id === e.message.id)
      if (idx < 0) return [...history, e.message]
      // keep any tool results that already arrived
      const old = history[idx]
      const parts = e.message.parts.map((p) => {
        if (p.kind !== 'tool') return p
        const prev = old.parts.find((q) => q.kind === 'tool' && q.toolUseId === p.toolUseId)
        return prev && prev.kind === 'tool' && prev.result !== undefined
          ? { ...p, result: prev.result, isError: prev.isError, patch: prev.patch, images: prev.images, done: true }
          : p
      })
      const next = history.slice()
      next[idx] = { ...e.message, parts }
      return next
    }

    case 'tool-result': {
      for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i]
        const pi = m.parts.findIndex((p) => p.kind === 'tool' && p.toolUseId === e.toolUseId)
        if (pi >= 0) {
          const next = history.slice()
          const parts = m.parts.slice()
          parts[pi] = { ...(parts[pi] as Extract<ContentPart, { kind: 'tool' }>), result: e.result, isError: e.isError, patch: e.patch, done: true, ...(e.images && { images: e.images }) }
          next[i] = { ...m, parts }
          return next
        }
      }
      return history
    }

    case 'error':
      return [
        ...history,
        { id: 'err-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), role: 'error', parts: [{ kind: 'text', text: e.text }], ts: Date.now() }
      ]

    case 'history-reset':
      return e.history

    case 'turn-done':
      // Mark any tool calls still pending as finished so spinners stop.
      return history.map((m) =>
        m.parts.some((p) => p.kind === 'tool' && !p.done)
          ? { ...m, parts: m.parts.map((p) => (p.kind === 'tool' && !p.done ? { ...p, done: true } : p)) }
          : m
      )

    default:
      return history
  }
}

/** Stringify a tool_result content (string | blocks[]) for display. */
export function toolResultToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b: { type?: string; text?: string }) => (b?.type === 'text' ? b.text : b?.type === 'image' ? '[image]' : JSON.stringify(b)))
      .join('\n')
  }
  if (content == null) return ''
  return JSON.stringify(content, null, 2)
}
