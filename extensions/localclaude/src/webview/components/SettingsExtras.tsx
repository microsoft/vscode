import { useEffect, useState } from 'react'
import { BUILTIN_STYLES } from '../../shared/styles'
import type { AppSettings, PlanUsage, ResponseStyle } from '../../shared/types'
import { api } from '../api'
import { Icon } from './Icon'

type OnChange = (p: Partial<AppSettings>) => Promise<void>

/** Default style for new chats, plus your own styles. */
export function StylesEditor({ settings, onChange }: { settings: AppSettings; onChange: OnChange }) {
  const [editing, setEditing] = useState<ResponseStyle | null>(null)
  const custom = settings.customStyles
  const save = async (st: ResponseStyle): Promise<void> => {
    const exists = custom.some((c) => c.id === st.id)
    await onChange({ customStyles: exists ? custom.map((c) => (c.id === st.id ? st : c)) : [...custom, st] })
    setEditing(null)
  }
  return (
    <div className="field">
      <label>Response styles</label>
      <p className="muted small">How Claude writes its replies. Pick a style per chat from the pen button under the reply box.</p>
      <div className="row gap">
        <span className="small">Default for chats</span>
        <select className="select" value={settings.defaultStyle || 'default'} onChange={(e) => void onChange({ defaultStyle: e.target.value === 'default' ? '' : e.target.value })}>
          <option value="default">Normal (Claude Code)</option>
          {[...BUILTIN_STYLES, ...custom].map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {custom.length > 0 && (
        <ul className="style-list">
          {custom.map((s) => (
            <li key={s.id}>
              <span className="grow">
                <b>{s.name}</b> <span className="muted small">{s.description}</span>
              </span>
              <button className="icon-btn" title="Edit" onClick={() => setEditing(s)}>
                <Icon name="edit" size={14} />
              </button>
              <button
                className="icon-btn"
                title="Delete"
                onClick={() =>
                  confirm(`Delete the style "${s.name}"?`) &&
                  void onChange({ customStyles: custom.filter((c) => c.id !== s.id), defaultStyle: settings.defaultStyle === s.id ? '' : settings.defaultStyle })
                }
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <div className="style-form">
          <input className="input" placeholder="Name, e.g. “Bullet points”" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <input
            className="input"
            placeholder="Short description (optional)"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />
          <textarea
            className="input"
            rows={4}
            placeholder="How should Claude write? e.g. “Answer in bullet points, no more than 5, plain words.”"
            value={editing.prompt}
            onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
          />
          <div className="row gap end">
            <button className="btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!editing.name.trim() || !editing.prompt.trim()} onClick={() => void save({ ...editing, name: editing.name.trim(), prompt: editing.prompt.trim() })}>
              Save style
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" onClick={() => setEditing({ id: 'custom-' + Date.now().toString(36), name: '', description: '', prompt: '' })}>
          <Icon name="plus" size={14} /> New style
        </button>
      )}
    </div>
  )
}

/** Inside VS Code, its own keyboard shortcuts open LocalClaude: "LocalClaude: Focus" and "Ask LocalClaude About Selection". */
export function ShortcutField(_props: { settings: AppSettings; onChange: OnChange }) {
  return (
    <div className="field">
      <label>Keyboard shortcuts</label>
      <p className="muted small">
        Ctrl+Alt+Space opens LocalClaude, and Ctrl+Alt+K asks about the code you've selected (Cmd instead of Ctrl on a Mac). Change them in VS Code's
        Keyboard Shortcuts: search for “LocalClaude”.
      </p>
    </div>
  )
}

function until(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.max(0, Math.round((t - Date.now()) / 60000))
  const rel = mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${Math.round(mins / 1440)} days`
  const abs = new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return `Resets in ${rel} (${abs})`
}

/** Your plan's usage limits, like the Claude app's Usage page. */
export function UsagePanel() {
  const [usage, setUsage] = useState<PlanUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async (): Promise<void> => {
    setLoading(true)
    setUsage(await api.usage())
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])
  return (
    <div className="usage">
      <div className="row gap">
        <p className="muted small grow">
          Your Claude plan’s limits, shared with the Claude app and Claude Code{usage?.subscription ? ` (${usage.subscription} plan)` : ''}.
        </p>
        <button className="btn ghost" disabled={loading} onClick={() => void load()}>
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>
      {!usage && <div className="muted small">Checking your usage…</div>}
      {usage && !usage.available && (
        <div className="notice small">{usage.error ? `Couldn’t read usage: ${usage.error}` : 'Usage limits aren’t available for this sign-in.'}</div>
      )}
      {usage?.windows.map((w) => {
        const pct = Math.max(0, Math.min(100, w.utilization ?? 0))
        return (
          <div key={w.key} className="usage-row">
            <div className="row">
              <span className="grow">{w.label}</span>
              <span className={'small' + (pct >= 90 ? ' danger-text' : pct >= 70 ? ' warn-text' : ' muted')}>{w.utilization === null ? '—' : `${Math.round(pct)}% used`}</span>
            </div>
            <div className="usage-bar">
              <span className={pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : ''} style={{ width: `${pct}%` }} />
            </div>
            <div className="muted small">{until(w.resetsAt)}</div>
          </div>
        )
      })}
      {usage?.extra && (
        <div className="usage-row">
          <div className="row">
            <span className="grow">Extra usage</span>
            <span className="muted small">{usage.extra.enabled ? 'On' : 'Off'}</span>
          </div>
          {usage.extra.enabled && usage.extra.limit !== null && (
            <div className="muted small">
              {usage.extra.used ?? 0} of {usage.extra.limit} {usage.extra.currency ?? ''} used this month
            </div>
          )}
        </div>
      )}
      {usage && <div className="muted small">Updated {new Date(usage.fetchedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>}
    </div>
  )
}
