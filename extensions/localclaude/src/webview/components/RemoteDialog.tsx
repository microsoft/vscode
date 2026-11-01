// Remote Control: keep working from the Claude mobile app or claude.ai/code while Claude Code runs
// here. This is Claude Code's own Remote Control server; LocalClaude starts it for a folder,
// asks you what Claude Code would ask in a terminal, and shows the link (and a QR code) to open.
import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, RemoteSpawn, RemoteState } from '../../shared/types'
import { api } from '../api'
import { Icon } from './Icon'

const SPAWN: { value: RemoteSpawn; label: string; hint: string }[] = [
  { value: 'same-dir', label: 'In this folder', hint: 'Sessions you start from your phone work here' },
  { value: 'worktree', label: 'Each in its own git worktree', hint: 'Every new session gets its own branch and folder' },
  { value: 'session', label: 'One session', hint: 'Stops when that session ends' }
]
const PERMISSIONS = [
  { value: '', label: 'Ask before acting' },
  { value: 'acceptEdits', label: 'Accept edits, ask for commands' },
  { value: 'plan', label: 'Plan first' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Full access (no questions)' }
]

const name = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

function Qr({ url }: { url: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(url)
    q.make()
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  }, [url])
  return <div className="remote-qr" role="img" aria-label="QR code for the session link" dangerouslySetInnerHTML={{ __html: svg }} />
}

export function RemoteDialog(props: { cwd: string; state: RemoteState; settings: AppSettings; onSettings: (p: Partial<AppSettings>) => Promise<void>; onClose: () => void }) {
  const s = props.state
  const live = s.status !== 'off' && s.status !== 'error'
  // a running server is for its own folder; otherwise this chat's folder
  const [folder, setFolder] = useState(live && s.cwd ? s.cwd : props.cwd)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (live && s.cwd) setFolder(s.cwd)
  }, [live, s.cwd])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      props.onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [props])

  const start = (): void =>
    void api.remoteStart({ cwd: folder, name: name(folder), spawn: props.settings.remoteSpawn, permissionMode: props.settings.remotePermissionMode || undefined })

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog-card remote-dialog" role="dialog" aria-label="Remote Control">
        <div className="dialog-head">
          <Icon name="phone" size={18} />
          <span className="dialog-title">Remote Control</span>
          <span className={'remote-pill ' + s.status}>{STATUS[s.status]}</span>
          <span className="grow" />
          <button className="icon-btn" onClick={props.onClose} title="Close (Esc)">
            <Icon name="x" size={16} />
          </button>
        </div>
        <p className="muted small">
          Keep working from your phone or another computer. Claude Code runs here, in the folder below; you use it from the Code tab of the Claude
          mobile app or claude.ai/code, signed in to the same account. Your chats here aren’t shared; sessions you start there run in this folder.
        </p>

        <div className="field">
          <label>Folder</label>
          <div className="row gap">
            <input className="input grow mono" readOnly value={folder} title={folder} />
            <button
              className="btn"
              disabled={live}
              onClick={async () => {
                const d = await api.pickFolder('Folder for Remote Control')
                if (d) setFolder(d)
              }}
            >
              Change
            </button>
          </div>
        </div>
        <div className="row gap remote-options">
          <div className="field grow">
            <label>Sessions from your phone</label>
            <select className="select" disabled={live} value={props.settings.remoteSpawn} onChange={(e) => void props.onSettings({ remoteSpawn: e.target.value as RemoteSpawn })}>
              {SPAWN.map((o) => (
                <option key={o.value} value={o.value} title={o.hint}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label>Permissions</label>
            <select className="select" disabled={live} value={props.settings.remotePermissionMode} onChange={(e) => void props.onSettings({ remotePermissionMode: e.target.value })}>
              {PERMISSIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {s.status === 'consent' && (
          <div className="remote-box">
            <b>Turn on Remote Control?</b>
            <span className="muted small">
              Take your work with you and pick up where you left off on any device. The session keeps running on this computer; your other devices act
              as a remote control. Claude Code asks this once.
            </span>
            <div className="row gap end">
              <button className="btn ghost" onClick={() => void api.remoteConsent(false)}>
                Not now
              </button>
              <button className="btn primary" onClick={() => void api.remoteConsent(true)}>
                Turn on
              </button>
            </div>
          </div>
        )}
        {s.status === 'untrusted' && (
          <div className="remote-box">
            <b>Trust this folder in Claude Code?</b>
            <span className="muted small">
              Claude Code only serves folders you’ve trusted. This is the same as answering yes to its “Do you trust the files in this folder?” prompt
              in a terminal: Claude can then read, edit and run things in {name(s.cwd ?? folder)}.
            </span>
            <div className="row gap end">
              <button className="btn primary" onClick={() => void api.remoteTrust()}>
                Trust and start
              </button>
            </div>
          </div>
        )}
        {s.status === 'connected' && (
          <div className="remote-box remote-connected">
            <div className="remote-where">
              <Icon name="check" size={16} /> Connected{s.where ? ` · ${s.where}` : ''}
            </div>
            {s.url ? (
              <div className="remote-link-row">
                <Qr url={s.url} />
                <div className="remote-link-text">
                  <span className="small">Scan with your phone, or open the Code tab in the Claude app: the session is there.</span>
                  <span className="mono small remote-url">{s.url}</span>
                  <div className="row gap">
                    <button className="btn small" onClick={() => void api.openExternal(s.url!)}>
                      Open in browser
                    </button>
                    <button
                      className="btn ghost small"
                      onClick={() => {
                        void navigator.clipboard.writeText(s.url!)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1200)
                      }}
                    >
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <span className="small muted">Open the Code tab in the Claude mobile app or claude.ai/code: the session is there.</span>
            )}
            {s.problem && <span className="small danger-text">A session stopped with an error: {s.problem}</span>}
          </div>
        )}
        {s.status === 'error' && <div className="notice error small">{s.error ?? 'Remote Control stopped.'}</div>}

        <div className="row gap end">
          {s.log.length > 0 && (
            <details className="remote-log grow">
              <summary className="small muted">What Claude Code printed</summary>
              <pre className="mono small">{s.log.join('\n')}</pre>
            </details>
          )}
          {live ? (
            <button className="btn danger" onClick={() => void api.remoteStop()}>
              Stop Remote Control
            </button>
          ) : (
            <button className="btn primary" onClick={start}>
              {s.status === 'error' ? 'Try again' : 'Start Remote Control'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const STATUS: Record<RemoteState['status'], string> = {
  off: 'Off',
  starting: 'Starting…',
  consent: 'Waiting for you',
  untrusted: 'Waiting for you',
  connecting: 'Connecting…',
  connected: 'On',
  error: 'Stopped'
}
