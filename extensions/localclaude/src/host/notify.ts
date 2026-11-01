// Desktop notifications for when Claude finishes or needs you while you're in another window.
import type { AgentEvent } from '../shared/types'

const short = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** The notification an event deserves, if any (pure, so it can be tested). */
export function notificationFor(e: AgentEvent, ctx: { chatTitle?: string; lastReply?: string }): { sessionId: string; title: string; body: string } | null {
  const chat = ctx.chatTitle || 'LocalClaude'
  if (e.type === 'turn-done') {
    if (e.isError) return { sessionId: e.sessionId, title: chat, body: 'Claude stopped with an error.' }
    return { sessionId: e.sessionId, title: chat, body: ctx.lastReply ? short(ctx.lastReply, 160) : 'Claude finished.' }
  }
  if (e.type === 'permission') {
    const r = e.request
    const what =
      r.toolName === 'AskUserQuestion'
        ? 'Claude has a question for you.'
        : r.toolName === 'ExitPlanMode'
          ? 'Claude has a plan ready for you to review.'
          : r.title ?? `Claude wants to use ${r.displayName ?? r.toolName}.`
    return { sessionId: r.sessionId, title: `${chat}: needs you`, body: short(what, 160) }
  }
  return null
}
