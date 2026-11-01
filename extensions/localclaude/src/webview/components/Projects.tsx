import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { ARTIFACT_LABEL } from '../../shared/format'
import type { MemoryItem, Project, ProjectArtifactRef, ProjectContextUsage, SessionMeta } from '../../shared/types'
import { api } from '../api'
import { droppedChats, isChatDrag } from '../dnd'
import { artifactIcon } from './ArtifactPanel'
import { Icon } from './Icon'
import { MemoryList } from './Memory'
import { Menu, type MenuEntry } from './Menu'

export const ago = (ts: number): string => {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(ts).toLocaleDateString()
}
const kb = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const folderName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p
const tokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))
/** Context window the project's share is measured against. */
const CONTEXT_WINDOW = 200_000

export function TitleBar({ left, children }: { left: ReactNode; children?: ReactNode }) {
  return (
    <header className="titlebar">
      {left}
      {children}
      <div className="grow" />
      <div className="wco-space" />
    </header>
  )
}

/** All projects, like the Claude app's Projects page. Pinned projects come first. */
export function ProjectsView(props: {
  projects: Project[]
  sessions: SessionMeta[]
  headerLeft: ReactNode
  onOpen: (id: string) => void
  onCreated: (p: Project) => void
  onPin: (id: string, pinned: boolean) => void
  onExport: (id: string) => void
  onDeleted: (id: string) => void
  /** chats dragged onto a project */
  onDropChats: (projectId: string, ids: string[]) => void
}) {
  const [creating, setCreating] = useState(false)
  const [folder, setFolder] = useState('')
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<'activity' | 'name'>('activity')
  const shown = props.projects
    .filter((p) => !filter.trim() || (p.name + ' ' + p.description).toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt))

  const create = async (): Promise<void> => {
    if (!name.trim()) return
    const p = await api.createProject({ name, description: desc, cwd: folder || undefined })
    setCreating(false)
    setName('')
    setDesc('')
    setFolder('')
    props.onCreated(p)
  }

  return (
    <div className="page">
      <TitleBar left={props.headerLeft} />
      <div className="page-scroll">
        <div className="page-inner">
          <div className="page-head">
            <h1>Projects</h1>
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={15} /> New project
            </button>
          </div>
          {creating && (
            <div className="project-form">
              <label className="small">What are you working on?</label>
              <input className="input" autoFocus placeholder="Name your project" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
              <label className="small">What are you trying to achieve?</label>
              <textarea className="input" rows={3} placeholder="Describe your project, goals, subject, etc." value={desc} onChange={(e) => setDesc(e.target.value)} />
              <label className="small">Folder to work in (optional)</label>
              <div className="row gap">
                <input className="input grow mono project-folder-input" readOnly placeholder="Your default folder" value={folder} title={folder} />
                <button
                  className="btn"
                  onClick={async () => {
                    const d = await api.pickFolder('Folder for this project')
                    if (!d) return
                    setFolder(d)
                    if (!name.trim()) setName(folderName(d))
                  }}
                >
                  Choose…
                </button>
              </div>
              <div className="row gap end">
                <button className="btn ghost" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button className="btn primary" disabled={!name.trim()} onClick={() => void create()}>
                  Create project
                </button>
              </div>
            </div>
          )}
          {props.projects.length > 0 && (
            <div className="row gap">
              <div className="side-search page-search grow">
                <Icon name="search" size={15} />
                <input placeholder="Search projects…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <Menu
                align="right"
                title="Sort"
                trigger={
                  <span className="sort-trigger small">
                    Sort: {sort === 'activity' ? 'Activity' : 'Name'} <Icon name="chevronDown" size={12} />
                  </span>
                }
                entries={[
                  { key: 'activity', label: 'Recent activity', checked: sort === 'activity', onSelect: () => setSort('activity') },
                  { key: 'name', label: 'Name', checked: sort === 'name', onSelect: () => setSort('name') }
                ]}
              />
            </div>
          )}
          <div className="project-grid">
            {shown.map((p) => {
              const chats = props.sessions.filter((s) => s.projectId === p.id).length
              return (
                <div
                  key={p.id}
                  className={'project-card' + (dropOn === p.id ? ' drop-target' : '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => props.onOpen(p.id)}
                  onKeyDown={(e) => e.key === 'Enter' && props.onOpen(p.id)}
                  onDragOver={(e) => {
                    if (!isChatDrag(e)) return
                    e.preventDefault()
                    setDropOn(p.id)
                  }}
                  onDragLeave={() => setDropOn((d) => (d === p.id ? null : d))}
                  onDrop={(e) => {
                    const ids = droppedChats(e)
                    setDropOn(null)
                    if (ids?.length) props.onDropChats(p.id, ids)
                  }}
                >
                  <div className="project-card-top">
                    <span className="project-card-name">{p.name}</span>
                    {p.pinned && (
                      <span className="muted" title="Pinned">
                        <Icon name="pin" size={14} />
                      </span>
                    )}
                    <div className="card-menu" onClick={(e) => e.stopPropagation()}>
                      <Menu
                        align="right"
                        title="Project options"
                        trigger={<span className="more-dots">⋯</span>}
                        entries={[
                          { key: 'pin', label: p.pinned ? 'Unpin from sidebar' : 'Pin to sidebar', onSelect: () => props.onPin(p.id, !p.pinned) },
                          { key: 'export', label: 'Export project…', onSelect: () => props.onExport(p.id) },
                          'divider',
                          {
                            key: 'delete',
                            label: 'Delete project',
                            danger: true,
                            onSelect: () => {
                              if (confirm(`Delete the project "${p.name}"? Its chats are kept and just leave the project.`)) void api.deleteProject(p.id).then(() => props.onDeleted(p.id))
                            }
                          }
                        ]}
                      />
                    </div>
                  </div>
                  {p.description && <span className="project-card-desc">{p.description}</span>}
                  <span className="muted small">
                    {chats} chat{chats === 1 ? '' : 's'}
                    {p.files.length ? ` · ${p.files.length} file${p.files.length === 1 ? '' : 's'}` : ''}
                    {p.memory?.length ? ` · ${p.memory.length} memor${p.memory.length === 1 ? 'y' : 'ies'}` : ''} · updated {ago(p.updatedAt)}
                  </span>
                </div>
              )
            })}
          </div>
          {!props.projects.length && !creating && (
            <div className="empty-projects muted">
              Projects keep related chats together with shared instructions, knowledge files and memory, so Claude has the context every time.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** How much of Claude's context the project's instructions, knowledge and memory take. */
function ContextCard({ usage }: { usage: ProjectContextUsage | null }) {
  if (!usage) return null
  const pct = (n: number): number => Math.min(100, (n / CONTEXT_WINDOW) * 100)
  const total = Math.round(pct(usage.total))
  return (
    <div className="side-card">
      <div className="side-card-head">
        <span>Context</span>
        <span className="muted small">{total < 1 && usage.total > 0 ? '<1' : total}% of context</span>
      </div>
      <div className="context-bar" title={`About ${usage.total.toLocaleString()} tokens of a ${tokens(CONTEXT_WINDOW)}-token context window`}>
        <span className="seg instr" style={{ width: `${pct(usage.instructions)}%` }} />
        <span className="seg know" style={{ width: `${pct(usage.knowledge)}%` }} />
        <span className="seg mem" style={{ width: `${pct(usage.memory)}%` }} />
      </div>
      <div className="context-legend small">
        <span>
          <i className="instr" /> Instructions {tokens(usage.instructions)}
        </span>
        <span>
          <i className="know" /> Knowledge {tokens(usage.knowledge)}
        </span>
        <span>
          <i className="mem" /> Memory {tokens(usage.memory)}
        </span>
      </div>
      <div className="muted small">
        About {usage.total.toLocaleString()} tokens are sent with every message in this project
        {usage.searched ? '. The knowledge files are too large to send in full, so Claude searches them when needed' : ''}.
      </div>
    </div>
  )
}

/** One project: start a chat, see its chats and artifacts, edit instructions, knowledge, memory and folder. */
export function ProjectView(props: {
  project: Project
  sessions: SessionMeta[]
  headerLeft: ReactNode
  defaultCwd: string
  memoryEnabled: boolean
  onEnableMemory: () => void
  onBack: () => void
  onChanged: (p: Project) => void
  onDeleted: () => void
  onOpenChat: (id: string) => void
  onOpenArtifact: (sessionId: string, artifactId: string) => void
  onStartChat: (text: string) => void
  onExport: () => void
  onPin: (pinned: boolean) => void
}) {
  const p = props.project
  const [text, setText] = useState('')
  const [instr, setInstr] = useState(p.instructions)
  const [editingInstr, setEditingInstr] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /** a folder or file dragged from your file manager is over the Folders or Knowledge card */
  const [dropCard, setDropCard] = useState<'folders' | 'knowledge' | null>(null)
  const [folderNote, setFolderNote] = useState<string | null>(null)
  const projectDirs = [p.cwd, ...(p.dirs ?? [])].filter((d): d is string => !!d)
  const filesOver = (card: 'folders' | 'knowledge') => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDropCard(card)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCard(null)
    }
  })
  /** dropped on Folders: folders Claude works in. Dropped on Knowledge: files to read, folders to search. */
  const dropPaths = async (e: DragEvent, card: 'folders' | 'knowledge'): Promise<void> => {
    e.preventDefault()
    setDropCard(null)
    const paths = await api.droppedPaths(e.dataTransfer)
    if (!paths.length) return
    const skipped: string[] = []
    if (card === 'folders') {
      for (const path of paths)
        try {
          const next = await api.addProjectDir(p.id, path)
          if (next) props.onChanged(next)
        } catch {
          skipped.push(folderName(path))
        }
      setFolderNote(skipped.length ? `Only folders go here (drop files on Knowledge): ${skipped.join(', ')}` : null)
      return
    }
    setAdding(true)
    try {
      const r = await api.addKnowledgePaths(p.id, paths)
      props.onChanged(r.project)
      setNotice(r.skipped.length ? `Skipped: ${r.skipped.join(', ')}` : null)
    } finally {
      setAdding(false)
    }
  }
  const [renaming, setRenaming] = useState<{ name: string; description: string } | null>(null)
  const [artifacts, setArtifacts] = useState<ProjectArtifactRef[]>([])
  const [usage, setUsage] = useState<ProjectContextUsage | null>(null)
  const [chatFilter, setChatFilter] = useState('')
  useEffect(() => setInstr(p.instructions), [p.id, p.instructions])
  const chats = props.sessions.filter((s) => s.projectId === p.id)
  const artifactKey = chats.map((s) => `${s.id}:${s.artifactCount ?? 0}`).join(',')
  useEffect(() => {
    void api.projectArtifacts(p.id).then(setArtifacts)
  }, [p.id, artifactKey])
  useEffect(() => {
    void api.projectContext(p.id).then(setUsage)
  }, [p.id, p.updatedAt, p.instructions, p.files.length, p.memory?.length])
  const used = p.files.reduce((n, f) => n + f.size, 0)
  const shownChats = chats.filter((s) => !chatFilter.trim() || s.title.toLowerCase().includes(chatFilter.trim().toLowerCase()))

  const update = async (patch: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'cwd'>>): Promise<void> => props.onChanged(await api.updateProject(p.id, patch))

  const projectMenu: MenuEntry[] = [
    { key: 'pin', label: p.pinned ? 'Unpin from sidebar' : 'Pin to sidebar', onSelect: () => props.onPin(!p.pinned) },
    { key: 'edit', label: 'Edit details', onSelect: () => setRenaming({ name: p.name, description: p.description }) },
    { key: 'export', label: 'Export project…', hint: 'Chats, artifacts, knowledge and memory as a ZIP', onSelect: props.onExport },
    'divider',
    {
      key: 'delete',
      label: 'Delete project',
      danger: true,
      onSelect: () => {
        if (!confirm(`Delete the project "${p.name}"? Its chats are kept and just leave the project.`)) return
        void api.deleteProject(p.id).then(props.onDeleted)
      }
    }
  ]

  return (
    <div className="page">
      <TitleBar left={props.headerLeft}>
        <button className="link-btn crumb no-drag" onClick={props.onBack}>
          Projects
        </button>
        <span className="muted">/</span>
        <span className="crumb-current">{p.name}</span>
        {p.pinned && (
          <span className="muted" title="Pinned to the sidebar">
            <Icon name="pin" size={14} />
          </span>
        )}
      </TitleBar>
      <div className="page-scroll">
        <div className="project-layout">
          <section className="project-main">
            {renaming ? (
              <div className="project-form">
                <input className="input" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                <textarea className="input" rows={2} value={renaming.description} onChange={(e) => setRenaming({ ...renaming, description: e.target.value })} />
                <div className="row gap end">
                  <button className="btn ghost" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn primary"
                    disabled={!renaming.name.trim()}
                    onClick={() => {
                      void update({ name: renaming.name.trim(), description: renaming.description })
                      setRenaming(null)
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="project-title-row">
                <div>
                  <h1>{p.name}</h1>
                  {p.description && <p className="muted">{p.description}</p>}
                </div>
                <div className="row gap">
                  <button className="btn ghost small-btn" onClick={props.onExport} title="Export this project">
                    <Icon name="download" size={15} /> Export
                  </button>
                  <Menu align="right" title="Project options" trigger={<span className="more-dots">⋯</span>} entries={projectMenu} />
                </div>
              </div>
            )}

            <div className="composer project-composer">
              <div className="prompt-row">
                <textarea
                  className="composer-input"
                  rows={2}
                  placeholder={`Start a chat in ${p.name}…`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
                      e.preventDefault()
                      props.onStartChat(text.trim())
                    }
                  }}
                />
                <button className="send" disabled={!text.trim()} onClick={() => props.onStartChat(text.trim())} title="Send">
                  <Icon name="enter" size={18} />
                </button>
              </div>
            </div>

            <div className="project-chats">
              {chats.length > 4 && (
                <div className="side-search page-search">
                  <Icon name="search" size={15} />
                  <input placeholder={`Search ${chats.length} chats…`} value={chatFilter} onChange={(e) => setChatFilter(e.target.value)} />
                </div>
              )}
              {chats.length === 0 && <div className="muted small">No chats in this project yet.</div>}
              {shownChats.map((s) => (
                <button key={s.id} className="project-chat" onClick={() => props.onOpenChat(s.id)}>
                  <span className="project-chat-title">
                    {s.title}
                    {s.artifactCount ? (
                      <span className="muted" title={`${s.artifactCount} artifact${s.artifactCount === 1 ? '' : 's'}`}>
                        {' '}
                        <Icon name="file" size={13} />
                      </span>
                    ) : null}
                  </span>
                  <span className="muted small">Last message {ago(s.updatedAt)}</span>
                </button>
              ))}
            </div>
          </section>

          <aside className="project-side">
            <div className={'side-card folders-card' + (dropCard === 'folders' ? ' drop-target' : '')} {...filesOver('folders')} onDrop={(e) => void dropPaths(e, 'folders')}>
              <div className="side-card-head">
                <span>Folders</span>
                <button
                  className="link-btn"
                  onClick={async () => {
                    const next = await api.addProjectDir(p.id)
                    if (next) props.onChanged(next)
                  }}
                >
                  + Add folder
                </button>
              </div>
              {projectDirs.length === 0 ? (
                <div className="side-card-body muted">
                  No folder yet, so chats work in {folderName(props.defaultCwd) || 'your default folder'}. Add the folder you’re working on, or drop it here.
                </div>
              ) : (
                <ul className="knowledge-list project-dirs">
                  {projectDirs.map((d, i) => (
                    <li key={d} title={d}>
                      <Icon name="folder" size={15} />
                      <button className="knowledge-name link-like" title={`Open ${d}`} onClick={() => void api.openPath(d)}>
                        {folderName(d)}
                      </button>
                      {i === 0 && p.cwd ? (
                        <button className="link-like dir-main" title="New chats start here. Click to pick another main folder." onClick={async () => {
                          const next = await api.setProjectMainDir(p.id)
                          if (next) props.onChanged(next)
                        }}>
                          main
                        </button>
                      ) : null}
                      <button className="icon-btn" title={i === 0 && p.cwd ? 'Remove (the next folder becomes the main one)' : 'Remove'} onClick={async () => props.onChanged(await api.removeProjectDir(p.id, d))}>
                        <Icon name="x" size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {folderNote && <div className="notice small">{folderNote}</div>}
              <div className="muted small">
                {projectDirs.length > 1 ? 'New chats start in the main folder. ' : projectDirs.length ? 'New chats start here. ' : ''}
                Claude can work in these folders in every chat in this project. Drop folders here to add them.
              </div>
            </div>

            <ContextCard usage={usage} />

            <div className="side-card">
              <div className="side-card-head">
                <span>Instructions</span>
                {!editingInstr && (
                  <button className="link-btn" onClick={() => setEditingInstr(true)}>
                    {p.instructions ? 'Edit' : 'Add'}
                  </button>
                )}
              </div>
              {editingInstr ? (
                <>
                  <textarea
                    className="input"
                    rows={8}
                    autoFocus
                    placeholder="How should Claude respond in this project? e.g. tone, format, background, rules."
                    value={instr}
                    onChange={(e) => setInstr(e.target.value)}
                  />
                  <div className="row gap end">
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setInstr(p.instructions)
                        setEditingInstr(false)
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => {
                        void update({ instructions: instr })
                        setEditingInstr(false)
                      }}
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <div className={'side-card-body' + (p.instructions ? '' : ' muted')}>
                  {p.instructions || 'Add instructions to tailor Claude’s responses in every chat in this project.'}
                </div>
              )}
            </div>

            <div className="side-card">
              <div className="side-card-head">
                <span>
                  Memory {p.memory?.length ? <span className="muted small">{p.memory.length}</span> : null}
                </span>
              </div>
              <MemoryList
                items={p.memory ?? []}
                projectId={p.id}
                enabled={props.memoryEnabled}
                onEnable={props.onEnableMemory}
                compact
                onChange={(_items: MemoryItem[], project?: Project) => project && props.onChanged(project)}
              />
            </div>

            <div className={'side-card' + (dropCard === 'knowledge' ? ' drop-target' : '')} {...filesOver('knowledge')} onDrop={(e) => void dropPaths(e, 'knowledge')}>
              <div className="side-card-head">
                <span>Knowledge</span>
                <span className="row gap">
                  <button
                    className="link-btn"
                    disabled={adding}
                    onClick={async () => {
                      const paths = await api.pickFiles()
                      if (!paths.length) return
                      setAdding(true)
                      try {
                        const r = await api.addProjectFiles(p.id, paths)
                        props.onChanged(r.project)
                        setNotice(r.skipped.length ? `Skipped: ${r.skipped.join(', ')}` : null)
                      } finally {
                        setAdding(false)
                      }
                    }}
                  >
                    {adding ? 'Reading…' : '+ Add files'}
                  </button>
                  <button
                    className="link-btn"
                    title="Link a folder, like part of your Obsidian vault: it stays in sync and Claude searches it"
                    onClick={async () => {
                      const next = await api.addProjectFolder(p.id)
                      if (next) props.onChanged(next)
                    }}
                  >
                    + Link folder
                  </button>
                </span>
              </div>
              {p.files.length === 0 && !p.folders?.length ? (
                <div className="side-card-body muted">
                  Add PDFs, Word, PowerPoint and Excel files, notes, code or data. Claude reads them in every chat in this project, and searches them when
                  they’re large. Or link a folder to keep it in sync.
                </div>
              ) : p.files.length === 0 ? null : (
                <ul className="knowledge-list">
                  {p.files.map((f) => (
                    <li key={f.id}>
                      <Icon name="file" size={15} />
                      <span className="knowledge-name" title={f.name}>
                        {f.name}
                      </span>
                      <span className="muted small">{kb(f.size)}</span>
                      <button className="icon-btn" title="Remove" onClick={async () => props.onChanged(await api.removeProjectFile(p.id, f.id))}>
                        <Icon name="x" size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(p.folders ?? []).length > 0 && (
                <ul className="knowledge-list linked-folders">
                  {p.folders!.map((f) => (
                    <li key={f}>
                      <Icon name="folder" size={15} />
                      <span className="knowledge-name" title={f}>
                        {folderName(f)}
                      </span>
                      <span className="muted small">linked</span>
                      <button className="icon-btn" title="Unlink this folder" onClick={async () => props.onChanged(await api.removeProjectFolder(p.id, f))}>
                        <Icon name="x" size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {used > 0 && <div className="muted small">{kb(used)} of knowledge</div>}
              {notice && <div className="notice small">{notice}</div>}
            </div>

            <div className="side-card">
              <div className="side-card-head">
                <span>
                  Artifacts {artifacts.length ? <span className="muted small">{artifacts.length}</span> : null}
                </span>
              </div>
              {artifacts.length === 0 ? (
                <div className="side-card-body muted">Pages, apps, diagrams and documents Claude makes in this project’s chats appear here.</div>
              ) : (
                <ul className="project-artifacts">
                  {artifacts.slice(0, 12).map((a) => (
                    <li key={a.sessionId + a.id}>
                      <button onClick={() => props.onOpenArtifact(a.sessionId, a.id)} title={`Open in “${a.chatTitle}”`}>
                        <Icon name={artifactIcon(a.type)} size={15} />
                        <span className="pa-text">
                          <span className="pa-title">{a.title}</span>
                          <span className="muted small">
                            {ARTIFACT_LABEL[a.type]}
                            {a.versions > 1 ? ` · v${a.versions}` : ''} · {a.chatTitle}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {artifacts.length > 12 && <li className="muted small">…and {artifacts.length - 12} more (export the project to get them all)</li>}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
