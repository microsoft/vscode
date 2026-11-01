import { useEffect, useState } from 'react'
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions, type ExportResult, type ExportScope, type Project, type SessionMeta } from '../../shared/types'
import { api } from '../api'
import { Icon } from './Icon'

const OPTIONS_KEY = 'export.options'
function loadOptions(): ExportOptions {
  try {
    return { ...DEFAULT_EXPORT_OPTIONS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_EXPORT_OPTIONS
  }
}

function Choice<T extends string>(props: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="choice">
      {props.options.map((o) => (
        <button key={o.value} className={'choice-item' + (o.value === props.value ? ' on' : '')} onClick={() => props.onChange(o.value)} title={o.hint}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Export one chat (Markdown), a project or everything (ZIP of Markdown, artifacts, knowledge and memory). */
export function ExportDialog(props: {
  scope: ExportScope
  sessionId?: string
  /** chats you selected in the sidebar */
  sessionIds?: string[]
  projectId?: string
  sessions: SessionMeta[]
  projects: Project[]
  onClose: () => void
}) {
  const chat = props.sessions.find((s) => s.id === props.sessionId)
  const project = props.projects.find((p) => p.id === (props.projectId ?? chat?.projectId))
  const [scope, setScope] = useState<ExportScope>(props.scope)
  const [opts, setOpts] = useState<ExportOptions>(loadOptions)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        props.onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [props])

  const set = (patch: Partial<ExportOptions>): void => {
    const next = { ...opts, ...patch }
    setOpts(next)
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(next))
    } catch {
      /* per-viewer convenience only */
    }
  }

  const chatsIn = (pid?: string): number => props.sessions.filter((s) => s.projectId === pid).length
  const picked = props.sessionIds ?? []
  const scopes: { value: ExportScope; label: string; hint: string }[] = [
    ...(picked.length ? [{ value: 'chats' as const, label: 'Selected chats', hint: `${picked.length} chat${picked.length === 1 ? '' : 's'}, as a ZIP` }] : []),
    ...(chat ? [{ value: 'chat' as const, label: 'This chat', hint: `“${chat.title}” as one Markdown file` }] : []),
    ...(project ? [{ value: 'project' as const, label: 'This project', hint: `“${project.name}”: ${chatsIn(project.id)} chats, knowledge and memory, as a ZIP` }] : []),
    { value: 'all', label: 'Everything', hint: `All ${props.sessions.length} chats and ${props.projects.length} projects, as a ZIP` }
  ]

  const run = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    const r = await api.exportData({ scope, sessionId: chat?.id, sessionIds: picked, projectId: project?.id, options: opts })
    setBusy(false)
    if (!r.canceled) setResult(r)
  }

  const what = (r: ExportResult): string => {
    const parts = [`${r.chats} chat${r.chats === 1 ? '' : 's'}`]
    if (r.artifacts) parts.push(`${r.artifacts} artifact${r.artifacts === 1 ? '' : 's'}`)
    if (r.files) parts.push(`${r.files} knowledge file${r.files === 1 ? '' : 's'}`)
    return parts.join(', ')
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog-card export-dialog">
        <div className="dialog-head">
          <Icon name="download" size={18} />
          <span className="dialog-title">Export</span>
          <span className="grow" />
          <button className="icon-btn" onClick={props.onClose} title="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="export-scopes">
          {scopes.map((s) => (
            <button key={s.value} className={'option' + (scope === s.value ? ' selected' : '')} onClick={() => setScope(s.value)}>
              <span className="option-label">{s.label}</span>
              <span className="muted small">{s.hint}</span>
            </button>
          ))}
        </div>

        <div className="export-opts">
          <div className="export-row">
            <span>Claude’s tool use</span>
            <Choice
              value={opts.tools}
              onChange={(tools) => set({ tools })}
              options={[
                { value: 'none', label: 'Leave out' },
                { value: 'summary', label: 'Summary', hint: '“Read 2 files, ran a command…”' },
                { value: 'full', label: 'Full detail', hint: 'Commands, outputs, diffs and inputs' }
              ]}
            />
          </div>
          <div className="export-row">
            <span>Artifacts</span>
            <Choice
              value={opts.artifacts}
              onChange={(artifacts) => set({ artifacts })}
              options={[
                { value: 'none', label: 'Leave out' },
                { value: 'latest', label: 'Latest version' },
                { value: 'all', label: 'Every version' }
              ]}
            />
          </div>
          <label className="toggle">
            <input type="checkbox" checked={opts.thinking} onChange={(e) => set({ thinking: e.target.checked })} />
            <span>Include Claude’s thinking</span>
          </label>
          {scope !== 'chat' && (
            <>
              <label className="toggle">
                <input type="checkbox" checked={opts.knowledge} onChange={(e) => set({ knowledge: e.target.checked })} />
                <span>
                  Include project instructions, knowledge files and memory
                  <span className="muted small">Plus each project’s context summary in its README</span>
                </span>
              </label>
              <label className="toggle">
                <input type="checkbox" checked={opts.backup} onChange={(e) => set({ backup: e.target.checked })} />
                <span>
                  Include a backup to import later
                  <span className="muted small">
                    Adds localclaude-backup.json with everything{scope === 'all' ? ' (including memory)' : ''}, so you can restore it here or on another computer.
                  </span>
                </span>
              </label>
            </>
          )}
        </div>

        <div className="muted small export-note">
          Exports are not encrypted. Anyone with the file can read these chats{scope !== 'chat' ? ', knowledge files and memory' : ''}.
        </div>

        {result?.ok && result.path && (
          <div className="notice export-done">
            <Icon name="check" size={15} /> Exported {what(result)}.
            <button className="link-btn" onClick={() => void api.revealFile(result.path!)}>
              Show in folder
            </button>
          </div>
        )}
        {result && !result.ok && <div className="notice error">{result.error ?? 'Export failed.'}</div>}

        <div className="row gap end">
          <button className="btn ghost" onClick={props.onClose}>
            {result?.ok ? 'Done' : 'Cancel'}
          </button>
          <button className="btn primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Exporting…' : scope === 'chat' ? 'Export Markdown…' : 'Export ZIP…'}
          </button>
        </div>
      </div>
    </div>
  )
}
