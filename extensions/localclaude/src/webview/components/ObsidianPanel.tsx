// Settings → Obsidian: link a vault so Claude can use your notes, write notes, and keep your
// chats and memory as notes.
import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, ObsidianVault, VaultStatus } from '../../shared/types'
import { api } from '../api'

const name = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export function ObsidianPanel({ settings: s, onChange }: { settings: AppSettings; onChange: (p: Partial<AppSettings>) => Promise<void> }) {
  const [vaults, setVaults] = useState<ObsidianVault[]>([])
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [folder, setFolder] = useState(s.obsidianFolder)
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => void api.obsidianVaults().then(setVaults), [])
  useEffect(() => setFolder(s.obsidianFolder), [s.obsidianFolder])
  const refresh = useCallback(() => {
    setStatus(null)
    void api.obsidianStatus().then(setStatus)
  }, [])
  useEffect(refresh, [s.obsidianVault, s.obsidianEnabled, refresh])
  const appFolder = s.obsidianFolder || 'LocalClaude'

  return (
    <>
      <h2>Obsidian</h2>
      <p className="muted small">
        Link your Obsidian vault and it becomes LocalClaude’s knowledge store: Claude can search and read your notes in any chat and save new ones,
        and your chats and memory are kept as notes you can browse, link and search in Obsidian. It all stays in your vault on this computer.
      </p>

      <label className="toggle obsidian-master">
        <input type="checkbox" checked={s.obsidianEnabled} onChange={(e) => void onChange({ obsidianEnabled: e.target.checked })} />
        <span>
          <b>Use your Obsidian vault</b>
          <span className="muted small">
            Off: Claude doesn’t search or write notes, and chats and memory aren’t saved to the vault. Your vault link and the choices below are kept for
            when you turn it back on.
          </span>
        </span>
      </label>

      <fieldset className="obsidian-options" disabled={!s.obsidianEnabled}>
        {!s.obsidianVault ? (
          <div className="field">
            <label>Link a vault</label>
            {vaults.length > 0 ? (
              <div className="vault-list">
                {vaults.map((v) => (
                  <button key={v.path} className="vault-option" onClick={() => void onChange({ obsidianVault: v.path })}>
                    <span className="vault-text">
                      <b>{v.name}</b>
                      <span className="muted small mono">{v.path}</span>
                    </span>
                    {v.open && <span className="muted small">open in Obsidian</span>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small">No Obsidian vaults found on this computer. Choose your vault’s folder, or any folder of Markdown notes.</p>
            )}
            <div className="row gap">
              <button
                className="btn"
                onClick={async () => {
                  const p = await api.pickFolder('Choose your Obsidian vault (or a folder of notes)')
                  if (p) await onChange({ obsidianVault: p })
                }}
              >
                Choose a folder…
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Vault</label>
              <div className="row gap">
                <span className="grow vault-text">
                  <b>{name(s.obsidianVault)}</b>
                  <span className="muted small mono">{s.obsidianVault}</span>
                </span>
                <button className="btn ghost" onClick={() => void api.openInObsidian()}>
                  Open in Obsidian
                </button>
                <button className="btn ghost" onClick={() => void onChange({ obsidianVault: '' })}>
                  Unlink
                </button>
              </div>
              <div className="small vault-status">
                {status === null ? (
                  <span className="muted">Reading your notes…</span>
                ) : status.off ? (
                  <span className="muted">Switched off: LocalClaude isn’t using this vault right now.</span>
                ) : status.missing ? (
                  <span className="danger-text">This folder isn’t there any more (moved, or on a drive that isn’t connected).</span>
                ) : (
                  <span className="muted">
                    {(status.files ?? 0).toLocaleString()} notes and documents searchable{status.more ? ' (the first 5,000)' : ''}.{' '}
                    <a href="#" onClick={(e) => (e.preventDefault(), refresh())}>
                      Refresh
                    </a>
                  </span>
                )}
              </div>
            </div>

            <label className="toggle">
              <input type="checkbox" checked={s.obsidianSearch} onChange={(e) => void onChange({ obsidianSearch: e.target.checked })} />
              <span>
                <b>Claude can search and read your notes</b>
                <span className="muted small">In every chat. Notes, PDFs and Office files in the vault are searched; hidden folders like .obsidian are skipped.</span>
              </span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={s.obsidianWrite} onChange={(e) => void onChange({ obsidianWrite: e.target.checked })} />
              <span>
                <b>Claude can write notes</b>
                <span className="muted small">
                  When you ask Claude to write something down, it saves a note in {appFolder}/Notes. It never changes your other notes.
                </span>
              </span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={s.obsidianSyncChats} onChange={(e) => void onChange({ obsidianSyncChats: e.target.checked })} />
              <span>
                <b>Keep chats as notes</b>
                <span className="muted small">
                  Each chat is saved in {appFolder}/Chats, with its images, and updated after every reply. Deleting a chat in LocalClaude keeps its note.
                </span>
              </span>
            </label>
            {s.obsidianSyncChats && (
              <div className="row gap vault-saveall">
                <button
                  className="btn ghost"
                  onClick={async () => {
                    const n = await api.saveAllToVault()
                    setSaved(`Saved ${n} chat${n === 1 ? '' : 's'} to the vault.`)
                  }}
                >
                  Save all chats now
                </button>
                {saved && <span className="ok-text small">{saved}</span>}
              </div>
            )}
            <label className="toggle">
              <input type="checkbox" checked={s.obsidianSyncMemory} onChange={(e) => void onChange({ obsidianSyncMemory: e.target.checked })} />
              <span>
                <b>Keep memory as a note</b>
                <span className="muted small">{appFolder}/Memory.md lists what Claude remembers, everywhere and per project, updated when it changes.</span>
              </span>
            </label>
            <div className="field">
              <label>LocalClaude’s folder in the vault</label>
              <input
                className="input mono"
                value={folder}
                placeholder="LocalClaude"
                onChange={(e) => setFolder(e.target.value)}
                onBlur={() => folder !== s.obsidianFolder && void onChange({ obsidianFolder: folder.trim() || 'LocalClaude' })}
              />
            </div>
          </>
        )}
      </fieldset>
    </>
  )
}
