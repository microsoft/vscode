import { useEffect, useRef, useState } from 'react'
import type { AppSettings, AuthStatus, LockStatus, MemoryItem } from '../../shared/types'
import { api } from '../api'
import { REPLY_FONTS, UI_FONTS } from '../fonts'
import { BackupsPanel } from './Backups'
import { McpManager } from './McpManager'
import { MemoryList } from './Memory'
import { ObsidianPanel } from './ObsidianPanel'
import { ShortcutField, StylesEditor, UsagePanel } from './SettingsExtras'
import { SmartKnowledgeSettings } from './SmartKnowledge'

const TABS: [string, string][] = [
  ['general', 'General'],
  ['tools', 'Tools & computer'],
  ['memory', 'Memory & data'],
  ['obsidian', 'Obsidian'],
  ['backups', 'Backups'],
  ['usage', 'Usage'],
  ['account', 'Account & privacy'],
  ['about', 'About']
]

export function SettingsDialog(props: {
  tab: string
  settings: AppSettings
  auth: AuthStatus
  onTab: (t: string) => void
  onChange: (p: Partial<AppSettings>) => Promise<void>
  onClose: () => void
  onLogout: () => Promise<void>
  globalMemory: MemoryItem[]
  onGlobalMemory: (items: MemoryItem[]) => void
  onExportAll: () => void
  onImport: () => void
}) {
  const s = props.settings
  const [lock, setLock] = useState<LockStatus | null>(null)
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.appInfo>> | null>(null)
  const [prompt, setPrompt] = useState(s.appendSystemPrompt)
  const [userName, setUserName] = useState(s.userName ?? '')
  // the name is saved when you leave the field, or when Settings closes while you're typing
  const saveName = (value: string): void => {
    if (value.trim() !== (s.userName ?? '')) void props.onChange({ userName: value.trim() })
  }
  const pendingName = useRef<string | null>(null)
  const onChangeSetting = useRef(props.onChange)
  onChangeSetting.current = props.onChange
  useEffect(
    () => () => {
      if (pendingName.current !== null) void onChangeSetting.current({ userName: pendingName.current.trim() })
    },
    []
  )

  useEffect(() => {
    void api.lockStatus().then(setLock)
    void api.appInfo().then(setInfo)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal">
        <nav className="modal-nav">
          <div className="modal-heading">Settings</div>
          {TABS.map(([k, label]) => (
            <button key={k} className={'nav-item' + (props.tab === k ? ' active' : '')} onClick={() => props.onTab(k)}>
              {label}
            </button>
          ))}
        </nav>
        <section className="modal-body">
          <button className="icon-btn close" onClick={props.onClose} aria-label="Close">
            ✕
          </button>

          {props.tab === 'general' && (
            <>
              <h2>General</h2>
              <div className="field">
                <label>What should Claude call you?</label>
                <input
                  className="input"
                  name="userName"
                  placeholder={props.auth.email?.split('@')[0] ?? 'Your name'}
                  value={userName}
                  onChange={(e) => {
                    setUserName(e.target.value)
                    pendingName.current = e.target.value
                  }}
                  onBlur={(e) => {
                    pendingName.current = null
                    saveName(e.target.value)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <p className="muted small">Shown at the bottom of the sidebar, and Claude knows it in your chats.</p>
              </div>
              <div className="field">
                <label>Default working folder for new chats</label>
                <div className="row gap">
                  <input className="input grow mono" value={s.defaultCwd} readOnly />
                  <button
                    className="btn"
                    onClick={async () => {
                      const p = await api.pickFolder('Default working folder')
                      if (p) await props.onChange({ defaultCwd: p })
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Default permission mode</label>
                <select
                  className="select"
                  value={s.defaultPermissionMode}
                  onChange={(e) => void props.onChange({ defaultPermissionMode: e.target.value as AppSettings['defaultPermissionMode'] })}
                >
                  <option value="default">Ask permissions</option>
                  <option value="acceptEdits">Auto-accept edits</option>
                  <option value="plan">Plan mode</option>
                  <option value="auto">Auto (a classifier approves actions)</option>
                  <option value="bypassPermissions">Full access (no prompts)</option>
                </select>
              </div>
              <div className="field">
                <label>Default model</label>
                <select className="select" value={s.defaultModel} onChange={(e) => void props.onChange({ defaultModel: e.target.value })}>
                  <option value="">Claude Code default</option>
                  <option value="opus">Opus</option>
                  <option value="sonnet">Sonnet</option>
                  <option value="haiku">Haiku</option>
                </select>
              </div>
              <div className="field">
                <label>Effort</label>
                <select className="select" value={s.effort} onChange={(e) => void props.onChange({ effort: e.target.value as AppSettings['effort'] })}>
                  <option value="">Model default</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">Extra high</option>
                  <option value="max">Max</option>
                </select>
              </div>
              <div className="field">
                <label>Theme</label>
                <select className="select" value={s.theme} onChange={(e) => void props.onChange({ theme: e.target.value as AppSettings['theme'] })}>
                  <option value="system">Match system</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div className="field">
                <label>Fonts</label>
                <div className="font-grid">
                  <span className="muted small">Claude's replies</span>
                  <select className="select" value={s.replyFont} onChange={(e) => void props.onChange({ replyFont: e.target.value as AppSettings['replyFont'] })}>
                    {REPLY_FONTS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <span className="muted small">Interface and your messages</span>
                  <select className="select" value={s.uiFont} onChange={(e) => void props.onChange({ uiFont: e.target.value as AppSettings['uiFont'] })}>
                    {UI_FONTS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="font-preview">
                  <div className="font-preview-user">Can you explain what this function does?</div>
                  <div className="font-preview-reply">
                    It reads the config file, checks each entry, and returns the <b>first valid server</b> it finds, or <i>null</i> if none match.
                  </div>
                </div>
              </div>
              <div className="field">
                <label>Personal instructions</label>
                <p className="muted small">Added to every chat, like custom instructions in the Claude app.</p>
                <textarea
                  className="input"
                  rows={4}
                  value={prompt}
                  placeholder="e.g. Keep answers concise and show code in C where it makes sense."
                  onChange={(e) => setPrompt(e.target.value)}
                  onBlur={() => prompt !== s.appendSystemPrompt && void props.onChange({ appendSystemPrompt: prompt })}
                />
              </div>
              <StylesEditor settings={s} onChange={props.onChange} />
              <label className="toggle">
                <input type="checkbox" checked={s.notifications} onChange={(e) => void props.onChange({ notifications: e.target.checked })} />
                <span>
                  <b>Notify me when Claude finishes or needs me</b>
                  <span className="muted small">A desktop notification while you’re in another window. Click it to jump to the chat.</span>
                </span>
              </label>
              <label className="toggle">
                <input type="checkbox" checked={s.autoTitles} onChange={(e) => void props.onChange({ autoTitles: e.target.checked })} />
                <span>
                  <b>Name new chats automatically</b>
                  <span className="muted small">After the first reply, a short title is written for the chat (one small Haiku request on your plan).</span>
                </span>
              </label>
              <ShortcutField settings={s} onChange={props.onChange} />
            </>
          )}

          {props.tab === 'usage' && (
            <>
              <h2>Usage</h2>
              <UsagePanel />
            </>
          )}

          {props.tab === 'tools' && (
            <>
              <h2>Tools, browser & computer</h2>
              <label className="toggle">
                <input type="checkbox" checked={s.chromeIntegration} onChange={(e) => void props.onChange({ chromeIntegration: e.target.checked })} />
                <span>
                  <b>Use my Chrome browser</b>
                  <span className="muted small">
                    Lets Claude browse in your real Chrome with your sign-ins, through the Claude in Chrome extension (install it from the Chrome Web Store
                    and sign in with the same account).
                  </span>
                </span>
              </label>
              <div className="toggle">
                <span>
                  <b>Computer use</b>
                  <span className="muted small">
                    Not available inside VS Code. Claude would be able to click and type in VS Code itself, including its own permission prompts.
                    Use the LocalClaude desktop app when you need Claude to operate other apps.
                  </span>
                </span>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={s.loadUserSettings} onChange={(e) => void props.onChange({ loadUserSettings: e.target.checked })} />
                <span>
                  <b>Load my Claude Code user settings</b>
                  <span className="muted small">
                    Your <code>~/.claude</code> CLAUDE.md, skills, slash commands, plugins, hooks and MCP servers.
                  </span>
                </span>
              </label>
              <label className="toggle">
                <input type="checkbox" checked={s.loadProjectSettings} onChange={(e) => void props.onChange({ loadProjectSettings: e.target.checked })} />
                <span>
                  <b>Load project settings</b>
                  <span className="muted small">
                    The working folder's <code>CLAUDE.md</code> and <code>.claude/</code> skills, commands and settings.
                  </span>
                </span>
              </label>
              <McpManager settings={s} onChange={props.onChange} />
              <p className="muted small">Changes apply to each chat the next time you send a message.</p>
            </>
          )}

          {props.tab === 'memory' && (
            <>
              <h2>Memory & data</h2>
              <label className="toggle">
                <input type="checkbox" checked={s.memory} onChange={(e) => void props.onChange({ memory: e.target.checked })} />
                <span>
                  <b>Let Claude remember things across chats</b>
                  <span className="muted small">
                    Claude saves useful facts, like your preferences or a project’s decisions, and sees them in later chats. Memory in a project stays in that
                    project. You can edit or delete anything below or on a project’s page. Stored encrypted on this machine.
                  </span>
                </span>
              </label>
              <div className="field">
                <label>
                  Memory across all chats{' '}
                  <span className="muted small">
                    {props.globalMemory.length} item{props.globalMemory.length === 1 ? '' : 's'}
                  </span>
                </label>
                <MemoryList
                  items={props.globalMemory}
                  projectId={null}
                  enabled={s.memory}
                  onEnable={() => void props.onChange({ memory: true })}
                  onChange={(items) => props.onGlobalMemory(items)}
                />
              </div>
              <label className="toggle">
                <input type="checkbox" checked={s.chatSearch} onChange={(e) => void props.onChange({ chatSearch: e.target.checked })} />
                <span>
                  <b>Let Claude search your past chats</b>
                  <span className="muted small">
                    When you mention an earlier conversation, Claude can look it up and read it. In a project it searches that project’s chats.
                    Everything stays on this machine.
                  </span>
                </span>
              </label>
              <SmartKnowledgeSettings settings={s} onChange={props.onChange} />
              <label className="toggle">
                <input type="checkbox" checked={s.artifacts} onChange={(e) => void props.onChange({ artifacts: e.target.checked })} />
                <span>
                  <b>Artifacts</b>
                  <span className="muted small">Claude can make web pages, apps, diagrams and documents that open in a side panel, with version history.</span>
                </span>
              </label>
              <div className="field">
                <label>Export & import</label>
                <p className="muted small">
                  Export every chat as Markdown, with artifacts, project knowledge files, instructions and memory, in one ZIP. Include the backup to
                  import it again here or on another computer, since LocalClaude’s own data only opens on this machine.
                </p>
                <div className="row gap">
                  <button className="btn" onClick={props.onExportAll}>
                    Export all chats…
                  </button>
                  <button className="btn ghost" onClick={props.onImport}>
                    Import an export or backup…
                  </button>
                </div>
                <p className="muted small">
                  Single chats and projects can be exported from their ⋯ menus too (Ctrl+Shift+E). For password-protected and automatic backups, see Backups.
                </p>
              </div>
            </>
          )}

          {props.tab === 'obsidian' && <ObsidianPanel settings={s} onChange={props.onChange} />}
          {props.tab === 'backups' && <BackupsPanel settings={s} onChange={props.onChange} onRestore={props.onImport} />}

          {props.tab === 'account' && (
            <>
              <h2>Account & privacy</h2>
              <div className="field">
                <label>Claude account</label>
                <div className="kv">
                  <span>Email</span>
                  <span>{props.auth.email ?? '—'}</span>
                  <span>Plan</span>
                  <span>{props.auth.subscriptionType ?? 'Claude subscription'}</span>
                  <span>Sign-in</span>
                  <span>{props.auth.authMethod ?? '—'}</span>
                </div>
                {props.auth.usingApiKeyEnv && (
                  <p className="notice">API-key or cloud-provider variables (like ANTHROPIC_API_KEY) are set in your environment. LocalClaude ignores them so only your subscription is used.</p>
                )}
                <button className="btn danger" onClick={() => void props.onLogout()}>
                  Sign out
                </button>
                <p className="muted small">Signing out also signs out Claude Code in your terminal, since they share one login.</p>
              </div>
              <div className="field">
                <label>This machine only</label>
                <p className="muted small">
                  Chats, settings and MCP config are stored encrypted on this PC with a key derived from this machine's ID
                  {lock?.encryptionBackend && lock.encryptionBackend !== 'none' ? ` plus your OS keychain (${lock.encryptionBackend})` : ''}. Copying the
                  data folder to another computer won't open. Nothing syncs to claude.ai, so your account on other devices can't see these chats.
                </p>
                <div className="kv">
                  <span>Machine</span>
                  <span className="mono">{lock?.machineIdShort}</span>
                  <span>Keychain</span>
                  <span>{lock?.encryptionBackend}</span>
                </div>
                {lock?.encryptionBackend === 'basic_text' && (
                  <p className="notice">
                    No desktop keyring was found, so only the machine-bound layer is active. Install gnome-keyring or KWallet for the extra layer.
                  </p>
                )}
              </div>
            </>
          )}

          {props.tab === 'about' && (
            <>
              <h2>About</h2>
              <div className="kv">
                <span>LocalClaude</span>
                <span>{info?.version}</span>
                <span>Platform</span>
                <span>
                  {info?.platform} {info?.arch}
                </span>
                <span>Editor</span>
                <span>{info?.electron}</span>
                <span>Claude Code binary</span>
                <span className="mono small">{info?.claudeBinary ?? 'not found'}</span>
                <span>App data</span>
                <span className="mono small">
                  <a href="#" onClick={(e) => (e.preventDefault(), info && void api.openPath(info.userData))}>
                    {info?.userData}
                  </a>
                </span>
                <span>Log</span>
                <span className="mono small">
                  <a href="#" title="Show the log file (what happened, not what you wrote)" onClick={(e) => (e.preventDefault(), void api.revealLog())}>
                    {info?.logFile}
                  </a>
                </span>
              </div>
              <p className="muted small">
                Personal app built on the Claude Agent SDK, for your own use with your own Claude subscription.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
