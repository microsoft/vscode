// Settings → MCP servers: add, edit, switch off and test the servers Claude can use, or edit them as JSON.
import { useEffect, useState } from 'react'
import type { AppSettings, McpServerEntry, McpTestResult } from '../../shared/types'
import { api } from '../api'

const PRESETS: Record<string, { label: string; entry: McpServerEntry }> = {
  playwright: {
    label: 'Playwright browser',
    entry: { type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'], enabled: true }
  },
  filesystem: {
    label: 'Filesystem',
    entry: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], enabled: true }
  }
}

/** Names LocalClaude's own servers use. */
const RESERVED = ['artifacts', 'memory', 'chats', 'knowledge', 'computer-use']

type Kind = 'stdio' | 'http' | 'sse'
const KIND_LABEL: Record<Kind, string> = { stdio: 'Local command', http: 'Remote (HTTP)', sse: 'Remote (SSE)' }

interface Draft {
  original: string | null
  name: string
  type: Kind
  command: string
  args: string
  env: string
  url: string
  headers: string
}

const toDraft = (name: string | null, e: McpServerEntry): Draft => ({
  original: name,
  name: name ?? '',
  type: e.type ?? 'stdio',
  command: e.command ?? '',
  args: (e.args ?? []).join('\n'),
  env: Object.entries(e.env ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n'),
  url: e.url ?? '',
  headers: Object.entries(e.headers ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
})

const lines = (s: string): string[] =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
const pairs = (s: string, sep: RegExp): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const l of lines(s)) {
    const m = sep.exec(l)
    if (m) out[l.slice(0, m.index).trim()] = l.slice(m.index + m[0].length).trim()
  }
  return out
}

/** The entry a form describes, or what's wrong with it. */
function fromDraft(d: Draft, existing: Record<string, McpServerEntry>): { name: string; entry: McpServerEntry } | { error: string } {
  const name = d.name.trim()
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return { error: 'Use letters, numbers, - and _ for the name.' }
  if (RESERVED.includes(name)) return { error: `“${name}” is used by LocalClaude itself. Pick another name.` }
  if (name !== d.original && existing[name]) return { error: `There’s already a server called “${name}”.` }
  const enabled = d.original ? existing[d.original]?.enabled : true
  if (d.type === 'stdio') {
    if (!d.command.trim()) return { error: 'Add the command that starts the server, like npx or python.' }
    const env = pairs(d.env, /=/)
    return { name, entry: { type: 'stdio', command: d.command.trim(), args: lines(d.args), ...(Object.keys(env).length ? { env } : {}), enabled } }
  }
  try {
    const u = new URL(d.url.trim())
    if (!/^https?:$/.test(u.protocol)) throw new Error()
  } catch {
    return { error: 'Add the server’s URL, starting with https://' }
  }
  const headers = pairs(d.headers, /:/)
  return { name, entry: { type: d.type, url: d.url.trim(), ...(Object.keys(headers).length ? { headers } : {}), enabled } }
}

const summary = (e: McpServerEntry): string => (e.type === 'http' || e.type === 'sse' ? (e.url ?? '') : [e.command, ...(e.args ?? [])].filter(Boolean).join(' '))

function ServerForm({ draft, existing, onSave, onCancel }: { draft: Draft; existing: Record<string, McpServerEntry>; onSave: (name: string, entry: McpServerEntry) => void; onCancel: () => void }) {
  const [d, setD] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<McpTestResult | 'testing' | null>(null)
  const set = (patch: Partial<Draft>): void => setD((x) => ({ ...x, ...patch }))
  const built = (): { name: string; entry: McpServerEntry } | null => {
    const r = fromDraft(d, existing)
    if ('error' in r) {
      setError(r.error)
      return null
    }
    setError(null)
    return r
  }
  return (
    <div className="mcp-form">
      <div className="row gap">
        <div className="field grow">
          <label>Name</label>
          <input className="input mono" name="name" placeholder="weather" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Type</label>
          <select className="select" name="type" value={d.type} onChange={(e) => set({ type: e.target.value as Kind })}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {d.type === 'stdio' ? (
        <>
          <div className="field">
            <label>Command</label>
            <input className="input mono" name="command" placeholder="npx" value={d.command} onChange={(e) => set({ command: e.target.value })} />
          </div>
          <div className="field">
            <label>
              Arguments <span className="muted small">one per line</span>
            </label>
            <textarea className="input mono" name="args" rows={3} placeholder={'-y\n@playwright/mcp@latest'} value={d.args} onChange={(e) => set({ args: e.target.value })} spellCheck={false} />
          </div>
          <div className="field">
            <label>
              Environment variables <span className="muted small">KEY=value, one per line</span>
            </label>
            <textarea className="input mono" name="env" rows={2} placeholder="API_TOKEN=…" value={d.env} onChange={(e) => set({ env: e.target.value })} spellCheck={false} />
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label>URL</label>
            <input className="input mono" name="url" placeholder="https://example.com/mcp" value={d.url} onChange={(e) => set({ url: e.target.value })} />
          </div>
          <div className="field">
            <label>
              Headers <span className="muted small">Name: value, one per line</span>
            </label>
            <textarea className="input mono" name="headers" rows={2} placeholder="Authorization: Bearer …" value={d.headers} onChange={(e) => set({ headers: e.target.value })} spellCheck={false} />
          </div>
        </>
      )}
      {error && <div className="danger-text small">{error}</div>}
      {test && <TestResult result={test} />}
      <div className="row gap end">
        <button
          className="btn ghost"
          disabled={test === 'testing'}
          onClick={async () => {
            const b = built()
            if (!b) return
            setTest('testing')
            setTest(await api.testMcpServer(b.entry))
          }}
        >
          Test
        </button>
        <span className="grow" />
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            const b = built()
            if (b) onSave(b.name, b.entry)
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

function TestResult({ result }: { result: McpTestResult | 'testing' }) {
  if (result === 'testing') return <div className="mcp-test muted small">Connecting…</div>
  if (!result.ok) return <pre className="mcp-test danger-text small">{result.error}</pre>
  const tools = result.tools ?? []
  return (
    <div className="mcp-test ok-text small">
      Connected{result.server ? ` to ${result.server}` : ''} · {tools.length} tool{tools.length === 1 ? '' : 's'}
      {tools.length > 0 && <span className="muted">: {tools.slice(0, 12).join(', ') + (tools.length > 12 ? ', …' : '')}</span>}
    </div>
  )
}

function JsonEditor({ settings, onChange }: { settings: AppSettings; onChange: (p: Partial<AppSettings>) => Promise<void> }) {
  const [json, setJson] = useState(JSON.stringify(settings.mcpServers, null, 2))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => setJson(JSON.stringify(settings.mcpServers, null, 2)), [settings.mcpServers])
  return (
    <div className="field">
      <p className="muted small">
        Same format as Claude Code's <code>mcpServers</code>: <code>{'{ "name": { "command": "npx", "args": [...] } }'}</code> for local servers, or{' '}
        <code>{'{ "type": "http", "url": "https://…" }'}</code> for remote ones. Add <code>"enabled": false</code> to switch one off.
      </p>
      <textarea className="input code" rows={12} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
      {error && <div className="danger-text small">{error}</div>}
      <div className="row gap">
        <button
          className="btn"
          onClick={async () => {
            try {
              const parsed = JSON.parse(json || '{}')
              if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Must be an object of { "name": { ...server } }')
              await onChange({ mcpServers: parsed })
              setError(null)
              setSaved(true)
              setTimeout(() => setSaved(false), 1500)
            } catch (e) {
              setError(String(e instanceof Error ? e.message : e))
            }
          }}
        >
          {saved ? 'Saved ✓' : 'Save JSON'}
        </button>
      </div>
    </div>
  )
}

export function McpManager({ settings, onChange }: { settings: AppSettings; onChange: (p: Partial<AppSettings>) => Promise<void> }) {
  const servers = settings.mcpServers
  const [draft, setDraft] = useState<Draft | null>(null)
  const [results, setResults] = useState<Record<string, McpTestResult | 'testing'>>({})
  const [json, setJson] = useState(false)
  const save = (next: Record<string, McpServerEntry>): Promise<void> => onChange({ mcpServers: next })
  const names = Object.keys(servers)

  return (
    <div className="field mcp-manager">
      <label>MCP servers (this app only)</label>
      <p className="muted small">
        Connect Claude to other tools and data. Servers in your <code>~/.claude.json</code> also load when “user settings” is on.
      </p>
      {json ? (
        <JsonEditor settings={settings} onChange={onChange} />
      ) : (
        <>
          {names.length > 0 && (
            <div className="mcp-list">
              {names.map((name) => {
                const e = servers[name]
                const on = e.enabled !== false
                const r = results[name]
                return (
                  <div key={name} className={'mcp-server' + (on ? '' : ' off')}>
                    <div className="mcp-server-main">
                      <label className="mcp-switch" title={on ? 'On (click to switch off)' : 'Off (click to switch on)'}>
                        <input type="checkbox" checked={on} onChange={() => void save({ ...servers, [name]: { ...e, enabled: !on } })} />
                      </label>
                      <span className="mcp-server-name mono">{name}</span>
                      <span className="mcp-kind muted small">{KIND_LABEL[e.type ?? 'stdio']}</span>
                      <span className="mcp-summary muted small mono" title={summary(e)}>
                        {summary(e)}
                      </span>
                      <button
                        className="btn ghost small"
                        title="Test: connect and list its tools"
                        disabled={r === 'testing'}
                        onClick={async () => {
                          setResults((x) => ({ ...x, [name]: 'testing' }))
                          const res = await api.testMcpServer(e)
                          setResults((x) => ({ ...x, [name]: res }))
                        }}
                      >
                        Test
                      </button>
                      <button className="btn ghost small" onClick={() => setDraft(toDraft(name, e))}>
                        Edit
                      </button>
                      <button
                        className="btn ghost small danger-text"
                        onClick={() => {
                          if (!confirm(`Remove the “${name}” server?`)) return
                          const next = { ...servers }
                          delete next[name]
                          void save(next)
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    {r && <TestResult result={r} />}
                  </div>
                )
              })}
            </div>
          )}
          {draft ? (
            <ServerForm
              key={draft.original ?? 'new'}
              draft={draft}
              existing={servers}
              onCancel={() => setDraft(null)}
              onSave={(name, entry) => {
                const next = { ...servers }
                if (draft.original && draft.original !== name) delete next[draft.original]
                next[name] = entry
                void save(next)
                setDraft(null)
                setResults((x) => {
                  const y = { ...x }
                  delete y[name]
                  return y
                })
              }}
            />
          ) : (
            <div className="row gap mcp-add">
              <button className="btn" onClick={() => setDraft(toDraft(null, { type: 'stdio' }))}>
                ＋ Add a server
              </button>
              {Object.entries(PRESETS)
                .filter(([key]) => !servers[key])
                .map(([key, p]) => (
                  <button key={key} className="btn ghost" title={summary(p.entry)} onClick={() => void save({ ...servers, [key]: p.entry })}>
                    ＋ {p.label}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      <div className="row gap">
        <button className="link-btn small" onClick={() => setJson(!json)}>
          {json ? 'Back to the list' : 'Edit as JSON'}
        </button>
      </div>
    </div>
  )
}
