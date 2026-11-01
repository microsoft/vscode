// Settings → Backups: password-protected copies of everything, now or on a schedule.
import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, BackupResult, BackupStatus } from '../../shared/types'
import { api } from '../api'
import { PasswordDialog } from './PasswordDialog'

const size = (n?: number): string => (!n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const when = (ts: number): string => {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return (today ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function BackupsPanel(props: { settings: AppSettings; onChange: (p: Partial<AppSettings>) => Promise<void>; onRestore: () => void }) {
  const s = props.settings
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [ask, setAsk] = useState<'saveAs' | 'password' | null>(null)
  const [note, setNote] = useState<{ text: string; path?: string; error?: boolean } | null>(null)
  const refresh = useCallback(() => void api.backupStatus().then(setStatus), [])
  useEffect(refresh, [refresh])
  const close = useCallback(() => setAsk(null), [])

  const done = (r: BackupResult, what: string): void => {
    if (r.canceled) return
    setNote(r.ok ? { text: `${what} ${size(r.size)}.`, path: r.path } : { text: r.error ?? 'The backup failed.', error: true })
    refresh()
  }

  return (
    <>
      <h2>Backups</h2>
      <p className="muted small">
        A backup holds everything: chats with their images, projects with their files and instructions, memory and artifacts, protected with a
        password you choose. LocalClaude’s own data only opens on this machine; a backup opens on any computer with LocalClaude and the password.
      </p>
      <div className="row gap">
        <button className="btn" onClick={() => setAsk('saveAs')}>
          Back up now…
        </button>
        <button className="btn ghost" onClick={props.onRestore}>
          Restore from a backup…
        </button>
      </div>
      {note && (
        <p className={'small backup-note ' + (note.error ? 'danger-text' : 'ok-text')}>
          {note.text}{' '}
          {note.path && (
            <a href="#" onClick={(e) => (e.preventDefault(), void api.revealFile(note.path!))}>
              Show in folder
            </a>
          )}
        </p>
      )}

      <label className="toggle">
        <input
          type="checkbox"
          checked={s.autoBackup}
          onChange={(e) => {
            if (e.target.checked && !status?.hasPassword) setAsk('password')
            void props.onChange({ autoBackup: e.target.checked })
          }}
        />
        <span>
          <b>Back up automatically</b>
          <span className="muted small">
            A new backup every day or week while LocalClaude is open; the oldest are removed. Pick a OneDrive, Dropbox or USB folder to keep a copy off
            this computer.
          </span>
        </span>
      </label>

      {s.autoBackup && status && (
        <div className="backup-auto">
          <div className="field">
            <label>Folder</label>
            <div className="row gap">
              <input className="input grow mono" value={s.backupDir || status.defaultDir} readOnly />
              <button
                className="btn"
                onClick={async () => {
                  const p = await api.pickFolder('Folder for backups')
                  if (p) await props.onChange({ backupDir: p })
                }}
              >
                Change
              </button>
            </div>
          </div>
          <div className="row gap backup-schedule">
            <div className="field">
              <label>How often</label>
              <select className="select" value={s.backupEvery} onChange={(e) => void props.onChange({ backupEvery: e.target.value as AppSettings['backupEvery'] })}>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
              </select>
            </div>
            <div className="field">
              <label>Keep</label>
              <select className="select" value={s.backupKeep} onChange={(e) => void props.onChange({ backupKeep: Number(e.target.value) })}>
                {[3, 7, 14, 30].map((n) => (
                  <option key={n} value={n}>
                    The latest {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Password</label>
            <div className="row gap">
              <span className={'small grow ' + (status.hasPassword ? 'muted' : 'danger-text')}>
                {status.hasPassword ? 'Saved, encrypted on this machine. You need it to restore a backup.' : 'Not set yet: automatic backups need a password.'}
              </span>
              <button className="btn" onClick={() => setAsk('password')}>
                {status.hasPassword ? 'Change password' : 'Set password'}
              </button>
            </div>
          </div>
          <div className="field">
            <label>Last automatic backup</label>
            <div className="row gap">
              <span className="small grow backup-last">{status.lastAt ? `${when(status.lastAt)} · ${size(status.lastSize)}` : 'None yet'}</span>
              {status.lastFile && (
                <button className="btn ghost" onClick={() => void api.revealFile(status.lastFile!)}>
                  Show in folder
                </button>
              )}
              <button className="btn" disabled={!status.hasPassword || status.running} onClick={async () => done(await api.backupNow(), 'Backed up,')}>
                Back up to folder now
              </button>
            </div>
            {status.lastError && <div className="danger-text small">The last backup failed: {status.lastError}</div>}
          </div>
        </div>
      )}

      {ask === 'saveAs' && (
        <PasswordDialog
          title="Back up everything"
          body="Choose a password for this backup. You’ll need it to restore, and it can’t be recovered if you forget it."
          confirm
          submitLabel="Choose where to save…"
          onCancel={close}
          onSubmit={async (password) => {
            const r = await api.backupSaveAs(password)
            if (!r.ok && !r.canceled) return r.error ?? 'The backup failed.'
            setAsk(null)
            done(r, 'Saved the backup,')
            return null
          }}
        />
      )}
      {ask === 'password' && (
        <PasswordDialog
          title={status?.hasPassword ? 'Change the backup password' : 'Set a backup password'}
          body="Automatic backups are protected with this password. It’s saved encrypted on this machine; you’ll need it to restore on another computer. Earlier backups keep their old password."
          confirm
          submitLabel="Save password"
          onCancel={close}
          onSubmit={async (password) => {
            setStatus(await api.setBackupPassword(password))
            setAsk(null)
            return null
          }}
        />
      )}
    </>
  )
}
