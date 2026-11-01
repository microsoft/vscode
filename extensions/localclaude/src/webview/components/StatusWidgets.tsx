import { useEffect, useRef, useState, type RefObject } from 'react'
import type { ContextUsage, McpStatus } from '../../shared/types'
import { api } from '../api'
import { Spark } from './Spark'

const fmtK = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n))

/** Ring showing how full the context window is, like Claude Code's context indicator. */
export function ContextRing({ usage }: { usage?: ContextUsage }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickAway(ref, () => setOpen(false))
  if (!usage) return null
  const pct = Math.max(0, Math.min(100, usage.percentage))
  const r = 7
  const c = 2 * Math.PI * r
  const level = pct >= 85 ? 'danger' : pct >= 65 ? 'warn' : ''
  const used = usage.categories.filter((x) => x.kind === 'used' && x.tokens > 0).sort((a, b) => b.tokens - a.tokens)
  return (
    <div className="ctx-wrap" ref={ref}>
      <button
        className={'ctx-ring ' + level}
        onClick={() => setOpen(!open)}
        title={`Context: ${pct}% used (${fmtK(usage.totalTokens)} / ${fmtK(usage.maxTokens)} tokens)`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <circle cx="9" cy="9" r={r} className="ctx-track" />
          <circle cx="9" cy="9" r={r} className="ctx-fill" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 9 9)" />
        </svg>
        {pct >= 65 && <span className="ctx-label">{pct}%</span>}
      </button>
      {open && (
        <div className="pop ctx-pop">
          <div className="pop-title">
            Context window <span className="muted">{pct}% used</span>
          </div>
          <div className="muted small">
            {fmtK(usage.totalTokens)} of {fmtK(usage.maxTokens)} tokens. Claude Code compacts the conversation automatically when it fills up; type{' '}
            <code>/compact</code> to do it now.
          </div>
          <div className="ctx-bar">
            {used.map((x) => (
              <span key={x.name} style={{ width: `${(x.tokens / usage.maxTokens) * 100}%` }} className="ctx-seg" title={`${x.name}: ${fmtK(x.tokens)}`} />
            ))}
          </div>
          <ul className="ctx-list">
            {used.map((x) => (
              <li key={x.name}>
                <span>{x.name}</span>
                <span className="muted">{fmtK(x.tokens)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Live MCP server list with on/off switches and reconnect, like Claude Code's /mcp. */
export function McpButton({ sessionId, servers, onOpenSettings }: { sessionId: string; servers?: McpStatus[]; onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useClickAway(ref, () => setOpen(false))
  useEffect(() => {
    if (open) void api.refreshMcp(sessionId)
  }, [open, sessionId])
  if (!servers?.length) return null
  const ok = servers.filter((s) => s.status === 'connected').length
  const bad = servers.some((s) => s.status === 'failed' || s.status === 'needs-auth')
  const act = async (name: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(name)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="mcp-wrap" ref={ref}>
      <button className={'link-btn' + (bad ? ' warn-text' : '')} onClick={() => setOpen(!open)}>
        MCP {ok}/{servers.length}
      </button>
      {open && (
        <div className="pop mcp-pop">
          <div className="pop-title">MCP servers</div>
          {servers.map((s) => (
            <div key={s.name} className="mcp-row">
              <span className={'dot ' + (s.status === 'connected' ? 'ok' : s.status === 'pending' ? 'running' : s.status === 'disabled' ? 'off' : 'error')} />
              <span className="mcp-name" title={s.error}>
                {s.name}
                <span className="muted small">
                  {' '}
                  {s.status.replace('-', ' ')}
                  {s.toolCount ? ` · ${s.toolCount} tools` : ''}
                </span>
              </span>
              {(s.status === 'failed' || s.status === 'needs-auth') && (
                <button className="icon-btn" disabled={busy === s.name} onClick={() => void act(s.name, () => api.reconnectMcp(sessionId, s.name))}>
                  Reconnect
                </button>
              )}
              <label className="switch" title={s.status === 'disabled' ? 'Turn on' : 'Turn off'}>
                <input
                  type="checkbox"
                  checked={s.status !== 'disabled'}
                  disabled={busy === s.name}
                  onChange={(e) => void act(s.name, () => api.toggleMcp(sessionId, s.name, e.target.checked))}
                />
                <span />
              </label>
            </div>
          ))}
          <button className="link-btn" onClick={onOpenSettings}>
            Edit servers in Settings →
          </button>
        </div>
      )}
    </div>
  )
}

function useClickAway(ref: RefObject<HTMLElement | null>, fn: () => void): void {
  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) fn()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, fn])
}

const VERBS = [
  'Clauding',
  'Pondering',
  'Noodling',
  'Percolating',
  'Cogitating',
  'Brewing',
  'Tinkering',
  'Mulling',
  'Synthesizing',
  'Crafting',
  'Musing',
  'Puzzling',
  'Wrangling',
  'Conjuring',
  'Simmering'
]

/** The Claude app's working indicator: the animated spark, with a status word and timer. */
export function Working({ since, starting }: { since?: number; starting: boolean }) {
  const [, setTick] = useState(0)
  const [verb] = useState(() => VERBS[Math.floor(Math.random() * VERBS.length)])
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0
  return (
    <div className="working">
      <Spark size={22} animate className="working-spark" />
      <span className="working-verb shimmer">{starting ? 'Starting Claude Code' : verb}…</span>
      <span className="muted small">
        {secs}s · Esc to stop
      </span>
    </div>
  )
}
