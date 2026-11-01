import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import type { AuthStatus, ChatSearchHit, Project, SessionMeta } from '../../shared/types'
import { api } from '../api'
import type { SessionRuntime } from '../App'
import { droppedChats, isChatDrag, startChatDrag } from '../dnd'
import { Icon } from './Icon'
import { Menu, type MenuEntry } from './Menu'

const RECENT = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days']

function groupLabel(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const startOfDay = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (days <= 0) return RECENT[0]
  if (days === 1) return RECENT[1]
  if (days < 7) return RECENT[2]
  if (days < 30) return RECENT[3]
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const folderName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

/** Sidebar width: drag its edge between these; double-click the edge for the default. */
export const SIDEBAR_WIDTH = { min: 240, max: 560, default: 272 }
/** a folder or project group shows this many chats until you ask for more */
const GROUP_PREVIEW = 8

// A color for your avatar, the same every time for the same name.
const AVATAR_COLORS = [
  ['#d97757', '#b35a3c'],
  ['#5b8def', '#3f6fd1'],
  ['#7b5fc4', '#5e44a3'],
  ['#2f9e7a', '#227a5e'],
  ['#c9772b', '#a35c1c'],
  ['#c2456a', '#9e3253']
]
function avatarStyle(name: string): { background: string } {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [a, b] = AVATAR_COLORS[h % AVATAR_COLORS.length]
  return { background: `linear-gradient(135deg, ${a}, ${b})` }
}

// How the sidebar lists chats (per viewer): grouped by folder or project, or by date; collapsed groups.
const PREFS = 'sidebar.sections'
type Prefs = { collapsed: Record<string, boolean>; hideProjectChats: boolean; groupBy: 'folder' | 'date' }
function loadPrefs(): Prefs {
  try {
    return { collapsed: {}, hideProjectChats: false, groupBy: 'folder', ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }
  } catch {
    return { collapsed: {}, hideProjectChats: false, groupBy: 'folder' }
  }
}
function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p))
  } catch {
    /* per-viewer convenience only */
  }
}

/** Mark the search words inside a snippet. */
function highlight(text: string, query: string): ReactNode {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/"/g, ''))
    .filter((w) => w.length >= 2)
  if (!words.length) return text
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c))
  const re = new RegExp('(' + escaped.join('|') + ')', 'gi')
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))
}

/** A collapsible sidebar section: Pinned, a folder or project, or a date group. */
function Section(props: { label: string; open: boolean; count: number; onToggle: () => void; extra?: ReactNode; title?: string; group?: string; children: ReactNode }) {
  return (
    <div className={'side-section' + (props.open ? '' : ' closed')} data-group={props.group}>
      <div className="group-row">
        <button className="group-label" onClick={props.onToggle} aria-expanded={props.open} title={props.title ?? (props.open ? 'Collapse' : 'Expand')}>
          <span>{props.label}</span>
          {!props.open && <span className="group-count">{props.count}</span>}
          <Icon name="chevron" size={12} className={'chev-i' + (props.open ? ' open' : '')} />
        </button>
        {props.extra}
      </div>
      {props.open && props.children}
    </div>
  )
}

/** A group of chats in the sidebar. */
interface Group {
  key: string
  label: string
  items: SessionMeta[]
  /** folder and project groups: where "+" starts a new chat */
  cwd?: string
  projectId?: string
  title?: string
}

export function Sidebar(props: {
  open: boolean
  /** width in pixels (wide windows; drag the edge to change it) */
  width: number
  onResize: (width: number, done: boolean) => void
  /** what Claude calls you, from Settings ('' = the name from your email) */
  userName: string
  /** "+" on a folder or project group */
  onNewIn: (cwd: string | undefined, projectId: string | undefined) => void
  /** narrow window: slide over the chat instead of taking space */
  overlay: boolean
  onCollapse: () => void
  sessions: SessionMeta[]
  projects: Project[]
  activeId: string | null
  activeProjectId: string | null
  runtime: Record<string, SessionRuntime>
  pending: Record<string, number>
  auth: AuthStatus
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  /** several chats at once (selected with Ctrl/Shift+click, or dragged onto a project) */
  onDeleteChats: (ids: string[]) => void
  onPinChats: (ids: string[], pinned: boolean) => void
  onMoveChats: (ids: string[], projectId: string | undefined) => void
  onExportChats: (ids: string[]) => void
  onRename: (id: string, title: string) => void
  onPin: (id: string, pinned: boolean) => void
  onExportChat: (id: string) => void
  /** open a chat found by searching inside messages, with the find bar showing the query */
  onOpenSearchHit: (id: string, query: string) => void
  projectsActive: boolean
  onProjects: () => void
  artifactsActive: boolean
  onArtifacts: () => void
  /** the Design page, or a design, is open */
  designActive: boolean
  onDesign: () => void
  onOpenProject: (id: string) => void
  onPinProject: (id: string, pinned: boolean) => void
  onExportAll: () => void
  onImport: () => void
  onSettings: () => void
  onSignOut: () => void
}) {
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [prefs, setPrefs] = useState(loadPrefs)
  const [hits, setHits] = useState<ChatSearchHit[]>([])
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const anchor = useRef<string | null>(null)
  /** the project a dragged chat is over */
  const [dropOn, setDropOn] = useState<string | null>(null)

  // Full-text search inside messages, a moment after you stop typing.
  useEffect(() => {
    const q = filter.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    let live = true
    const t = setTimeout(() => void api.searchChats(q).then((h) => live && setHits(h)), 200)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [filter])

  const update = (next: typeof prefs): void => {
    setPrefs(next)
    savePrefs(next)
  }
  const searching = filter.trim().length > 0
  // While searching, every section is open so nothing is hidden.
  const isOpen = (label: string): boolean => {
    // by date, older months start collapsed; folders and projects start open
    const collapsedByDefault = prefs.groupBy === 'date' && !RECENT.includes(label) && label !== 'Pinned'
    return searching || !(prefs.collapsed[label] ?? collapsedByDefault)
  }
  const toggle = (label: string): void => update({ ...prefs, collapsed: { ...prefs.collapsed, [label]: isOpen(label) } })

  const { pinnedChats, pinnedProjects, groups } = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const match = (s: SessionMeta): boolean => !f || s.title.toLowerCase().includes(f) || s.cwd.toLowerCase().includes(f)
    const pinnedChats = props.sessions.filter((s) => s.pinned && match(s))
    const pinnedProjects = props.projects.filter((p) => p.pinned && (!f || p.name.toLowerCase().includes(f)))
    // designs live on the Design page; they show here when pinned or found by searching
    const recent = props.sessions
      .filter((s) => !s.pinned && match(s) && !(prefs.hideProjectChats && s.projectId && !f) && !(s.design && !f))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const out: Group[] = []
    if (prefs.groupBy === 'date') {
      for (const s of recent) {
        const g = groupLabel(s.updatedAt)
        const last = out[out.length - 1]
        if (last && last.key === g) last.items.push(s)
        else out.push({ key: g, label: g, items: [s] })
      }
    } else {
      // like Claude Code: a group per folder (chats in a project go under the project), busiest first
      const byKey = new Map<string, Group>()
      for (const s of recent) {
        const project = s.projectId ? props.projects.find((p) => p.id === s.projectId) : undefined
        const key = project ? 'project:' + project.id : 'folder:' + s.cwd.replace(/\\/g, '/').toLowerCase()
        let g = byKey.get(key)
        if (!g) {
          g = project
            ? { key, label: project.name, items: [], projectId: project.id, title: `Project “${project.name}”` }
            : { key, label: folderName(s.cwd), items: [], cwd: s.cwd, title: s.cwd }
          byKey.set(key, g)
          out.push(g)
        }
        g.items.push(s)
      }
    }
    return { pinnedChats, pinnedProjects, groups: out }
  }, [props.sessions, props.projects, filter, prefs.hideProjectChats, prefs.groupBy])

  // chats found only inside their messages (title matches are already listed above)
  const shownIds = new Set([...pinnedChats.map((s) => s.id), ...groups.flatMap((g) => g.items.map((s) => s.id))])
  const messageHits = searching ? hits.filter((h) => !shownIds.has(h.sessionId)) : []

  // selecting chats: Ctrl/Cmd+click picks one, Shift+click a range, Esc stops
  const live = selected.filter((id) => props.sessions.some((s) => s.id === id))
  const selecting = selectMode || live.length > 0
  const clearSelection = (): void => {
    setSelected([])
    setSelectMode(false)
  }
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setSelected([])
      setSelectMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting])
  const order = [...(isOpen('Pinned') ? pinnedChats : []), ...groups.filter((g) => isOpen(g.key)).flatMap((g) => g.items)].map((s) => s.id)
  const clickChat = (e: MouseEvent, id: string): void => {
    if (e.shiftKey && anchor.current) {
      const a = order.indexOf(anchor.current)
      const b = order.indexOf(id)
      if (a >= 0 && b >= 0) {
        const range = order.slice(Math.min(a, b), Math.max(a, b) + 1)
        setSelected((cur) => [...new Set([...cur, ...range])])
        return
      }
    }
    anchor.current = id
    if (e.ctrlKey || e.metaKey || selecting) setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
    else props.onSelect(id)
  }
  const allPinned = live.length > 0 && live.every((id) => props.sessions.find((s) => s.id === id)?.pinned)
  const anyInProject = live.some((id) => props.sessions.find((s) => s.id === id)?.projectId)
  const dropProps = (projectId: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!isChatDrag(e)) return
      e.preventDefault()
      setDropOn(projectId)
    },
    onDragLeave: () => setDropOn((d) => (d === projectId ? null : d)),
    onDrop: (e: DragEvent) => {
      const ids = droppedChats(e)
      setDropOn(null)
      if (ids?.length) props.onMoveChats(ids, projectId)
    }
  })

  const name = props.userName.trim() || (props.auth.email ? props.auth.email.split('@')[0] : 'You')

  // drag the right edge to resize
  const startResize = (e: MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = props.width
    let w = startW
    document.body.classList.add('resizing-sidebar')
    const move = (ev: globalThis.MouseEvent): void => {
      w = Math.round(Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, window.innerWidth * 0.6, startW + ev.clientX - startX)))
      props.onResize(w, false)
    }
    const up = (): void => {
      document.body.classList.remove('resizing-sidebar')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      props.onResize(w, true)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const plan = props.auth.subscriptionType ? cap(props.auth.subscriptionType) : ''
  const projectName = (id?: string): string | undefined => (id ? props.projects.find((p) => p.id === id)?.name : undefined)

  const chatItem = (s: SessionMeta) => {
    const rt = props.runtime[s.id]
    const busy = rt?.status === 'running' || rt?.status === 'starting'
    const pend = props.pending[s.id]
    const proj = projectName(s.projectId)
    const isSel = live.includes(s.id)
    return (
      <div
        key={s.id}
        className={'session-item' + (s.id === props.activeId && !selecting ? ' active' : '') + (isSel ? ' selected' : '')}
        onClick={(e) => clickChat(e, s.id)}
        onMouseDown={(e) => e.shiftKey && e.preventDefault()}
        draggable={editing !== s.id}
        onDragStart={(e) => startChatDrag(e, isSel ? live : [s.id])}
        title={proj ? `${s.title}\nProject: ${proj}` : s.title}
      >
        {selecting ? (
          <span className={'select-box' + (isSel ? ' on' : '')}>{isSel ? '✓' : ''}</span>
        ) : (
          <span className={'item-dot' + (busy ? ' busy' : '')} aria-hidden />
        )}
        {editing === s.id ? (
          <input
            className="input rename"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              if (draft.trim()) props.onRename(s.id, draft.trim())
              setEditing(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <>
            <span className="session-title">{s.title}</span>
            {pend ? (
              <span className="badge warn">{pend}</span>
            ) : s.design ? (
              <span className="item-icon" title="Design">
                <Icon name="penTool" size={14} />
              </span>
            ) : s.artifactCount ? (
              <span className="item-icon" title={`${s.artifactCount} artifact${s.artifactCount === 1 ? '' : 's'}`}>
                <Icon name="file" size={14} />
              </span>
            ) : null}
            <div className="more" onClick={(e) => e.stopPropagation()}>
              <Menu
                title="Chat options"
                align="right"
                trigger={<span className="more-dots">⋯</span>}
                entries={[
                  { key: 'pin', label: s.pinned ? 'Unpin' : 'Pin', onSelect: () => props.onPin(s.id, !s.pinned) },
                  {
                    key: 'rename',
                    label: 'Rename',
                    onSelect: () => {
                      setDraft(s.title)
                      setEditing(s.id)
                    }
                  },
                  { key: 'export', label: 'Export as Markdown…', onSelect: () => props.onExportChat(s.id) },
                  ...(proj && s.projectId ? [{ key: 'proj', label: `Open project “${proj}”`, onSelect: () => props.onOpenProject(s.projectId!) }] : []),
                  'divider',
                  {
                    key: 'delete',
                    label: 'Delete',
                    danger: true,
                    onSelect: () => confirm(`Delete "${s.title}"? This removes it from LocalClaude.`) && props.onDelete(s.id)
                  }
                ]}
              />
            </div>
          </>
        )}
      </div>
    )
  }

  const projectItem = (p: Project) => (
    <div
      key={p.id}
      className={'session-item project-item' + (p.id === props.activeProjectId ? ' active' : '') + (dropOn === p.id ? ' drop-target' : '')}
      onClick={() => props.onOpenProject(p.id)}
      title={p.description || p.name}
      {...dropProps(p.id)}
    >
      <span className="item-lead">
        <Icon name="project" size={15} />
      </span>
      <span className="session-title">{p.name}</span>
      <div className="more" onClick={(e) => e.stopPropagation()}>
        <Menu
          title="Project options"
          align="right"
          trigger={<span className="more-dots">⋯</span>}
          entries={[
            { key: 'open', label: 'Open project', onSelect: () => props.onOpenProject(p.id) },
            { key: 'unpin', label: 'Unpin', onSelect: () => props.onPinProject(p.id, false) }
          ]}
        />
      </div>
    </div>
  )

  const viewMenu: MenuEntry[] = [
    { section: 'Group chats by' },
    { key: 'by-folder', label: 'Folder and project', checked: prefs.groupBy === 'folder', onSelect: () => update({ ...prefs, groupBy: 'folder' }) },
    { key: 'by-date', label: 'Date', checked: prefs.groupBy === 'date', onSelect: () => update({ ...prefs, groupBy: 'date' }) },
    'divider',
    { key: 'select', label: 'Select chats', hint: 'Ctrl+click', onSelect: () => setSelectMode(true) },
    { key: 'collapse', label: 'Collapse all groups', onSelect: () => update({ ...prefs, collapsed: { ...prefs.collapsed, ...Object.fromEntries(['Pinned', ...groups.map((g) => g.key)].map((l) => [l, true])) } }) },
    { key: 'expand', label: 'Expand all groups', onSelect: () => update({ ...prefs, collapsed: { ...prefs.collapsed, ...Object.fromEntries(['Pinned', ...groups.map((g) => g.key)].map((l) => [l, false])) } }) },
    'divider',
    {
      key: 'hide',
      label: 'Hide chats that are in projects',
      checked: prefs.hideProjectChats,
      onSelect: () => update({ ...prefs, hideProjectChats: !prefs.hideProjectChats })
    }
  ]
  const pinnedCount = pinnedChats.length + pinnedProjects.length

  return (
    <aside
      className={'sidebar' + (props.open ? '' : ' collapsed') + (props.overlay ? ' overlay' : '')}
      aria-hidden={!props.open}
      style={!props.overlay && props.open ? { width: props.width } : undefined}
    >
      {!props.overlay && props.open && (
        <div
          className="side-resizer"
          onMouseDown={startResize}
          onDoubleClick={() => props.onResize(SIDEBAR_WIDTH.default, true)}
          title="Drag to resize · double-click for the default width"
        />
      )}
      <div className="side-titlebar">
        <Menu
          className="no-drag"
          title="Menu"
          trigger={<Icon name="menu" size={18} />}
          entries={[
            { key: 'new', label: 'New chat', hint: 'Ctrl+N', onSelect: props.onNew },
            { key: 'projects', label: 'Projects', onSelect: props.onProjects },
            { key: 'artifacts', label: 'Artifacts', onSelect: props.onArtifacts },
            { key: 'design', label: 'Design', onSelect: props.onDesign },
            'divider',
            { key: 'export', label: 'Export all chats…', hint: 'Markdown + artifacts + projects, as a ZIP', onSelect: props.onExportAll },
            { key: 'import', label: 'Import an export or backup…', onSelect: props.onImport },
            'divider',
            { key: 'settings', label: 'Settings', hint: 'Ctrl+,', onSelect: props.onSettings },
            { key: 'sidebar', label: 'Hide sidebar', hint: 'Ctrl+B', onSelect: props.onCollapse }
          ]}
        />
        <button className="icon-btn no-drag" onClick={props.onCollapse} title="Hide sidebar (Ctrl+B)">
          <Icon name="sidebar" size={18} />
        </button>
        <button className="icon-btn no-drag" disabled={!props.canBack} onClick={props.onBack} title="Back">
          <Icon name="back" size={18} />
        </button>
        <button className="icon-btn no-drag" disabled={!props.canForward} onClick={props.onForward} title="Forward">
          <Icon name="forward" size={18} />
        </button>
      </div>

      <div className="side-search">
        <Icon name="search" size={15} />
        <input placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {searching && (
          <button className="icon-btn" onClick={() => setFilter('')} title="Clear search">
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
      <button className="side-new" onClick={props.onNew} title="New chat (Ctrl+N)">
        <span className="side-new-icon">
          <Icon name="plus" size={14} />
        </span>
        New
      </button>
      <button className={'side-nav' + (props.projectsActive ? ' active' : '')} onClick={props.onProjects}>
        <Icon name="project" size={16} />
        Projects
      </button>
      <button className={'side-nav' + (props.artifactsActive ? ' active' : '')} onClick={props.onArtifacts}>
        <Icon name="shapes" size={16} />
        Artifacts
      </button>
      <button className={'side-nav' + (props.designActive ? ' active' : '')} onClick={props.onDesign}>
        <Icon name="penTool" size={16} />
        Design
      </button>

      <nav className="session-list">
        {pinnedCount > 0 && (
          <Section label="Pinned" open={isOpen('Pinned')} count={pinnedCount} onToggle={() => toggle('Pinned')}>
            {pinnedProjects.map(projectItem)}
            {pinnedChats.map(chatItem)}
          </Section>
        )}
        {groups.map((g, i) => {
          const all = searching || showAll[g.key] || g.items.length <= GROUP_PREVIEW
          return (
            <Section
              key={g.key}
              group={g.key}
              label={g.label}
              title={g.title}
              open={isOpen(g.key)}
              count={g.items.length}
              onToggle={() => toggle(g.key)}
              extra={
                <>
                  {(g.cwd || g.projectId) && (
                    <button
                      className="icon-btn group-add"
                      title={g.projectId ? `New chat in “${g.label}”` : `New chat in ${g.title}`}
                      onClick={() => props.onNewIn(g.projectId ? undefined : g.cwd, g.projectId)}
                    >
                      <Icon name="plus" size={15} />
                    </button>
                  )}
                  {i === 0 && <Menu className="group-menu" align="right" title="View options" trigger={<Icon name="sliders" size={14} />} entries={viewMenu} />}
                </>
              }
            >
              {(all ? g.items : g.items.slice(0, GROUP_PREVIEW)).map(chatItem)}
              {!searching && g.items.length > GROUP_PREVIEW && (
                <button className="link-btn group-more" onClick={() => setShowAll((x) => ({ ...x, [g.key]: !x[g.key] }))}>
                  {showAll[g.key] ? 'Show fewer' : `Show ${g.items.length - GROUP_PREVIEW} more`}
                </button>
              )}
            </Section>
          )
        })}
        {!groups.length && !pinnedCount && props.sessions.length > 0 && !searching && (
          <div className="group-row lone-view">
            <span className="grow" />
            <Menu className="group-menu" align="right" title="View options" trigger={<Icon name="sliders" size={14} />} entries={viewMenu} />
          </div>
        )}
        {searching && messageHits.length > 0 && (
          <Section label="In messages" open count={messageHits.length} onToggle={() => {}}>
            {messageHits.map((h) => (
              <div key={h.sessionId} className={'session-item search-hit' + (h.sessionId === props.activeId ? ' active' : '')} onClick={() => props.onOpenSearchHit(h.sessionId, filter.trim())}>
                <span className="hit-title">{h.title}</span>
                <span className="hit-snippet">{highlight(h.snippet, filter)}</span>
              </div>
            ))}
          </Section>
        )}
        {searching && !groups.length && !pinnedCount && !messageHits.length && <div className="muted small pad">No chats match “{filter.trim()}”.</div>}
        {!searching && !pinnedCount && !props.sessions.some((s) => !s.design) && <div className="muted small pad">No chats yet.</div>}
        {prefs.hideProjectChats && !searching && (
          <button className="link-btn side-hint" onClick={() => update({ ...prefs, hideProjectChats: false })}>
            Chats in projects are hidden · show them
          </button>
        )}
      </nav>

      {selecting && (
        <div className="bulk-bar">
          <span className="bulk-count">{live.length ? `${live.length} selected` : 'Click chats to select'}</span>
          <span className="grow" />
          <button className="icon-btn" title={allPinned ? 'Unpin' : 'Pin'} disabled={!live.length} onClick={() => props.onPinChats(live, !allPinned)}>
            <Icon name="pin" size={15} />
          </button>
          <Menu
            className="bulk-move"
            align="right"
            direction="up"
            title="Move to a project"
            trigger={<Icon name="project" size={15} />}
            entries={[
              { section: 'Move to project' },
              ...props.projects.map((p) => ({ key: p.id, label: p.name, disabled: !live.length, onSelect: () => props.onMoveChats(live, p.id) })),
              ...(props.projects.length ? [] : [{ key: 'none', label: 'No projects yet', disabled: true, onSelect: () => {} }]),
              ...(anyInProject ? (['divider', { key: 'out', label: 'Remove from project', onSelect: () => props.onMoveChats(live, undefined) }] as MenuEntry[]) : [])
            ]}
          />
          <button className="icon-btn" title="Export…" disabled={!live.length} onClick={() => props.onExportChats(live)}>
            <Icon name="download" size={15} />
          </button>
          <button
            className="icon-btn bulk-delete"
            title="Delete"
            disabled={!live.length}
            onClick={() => {
              if (!confirm(`Delete ${live.length} chat${live.length === 1 ? '' : 's'}? This removes them from LocalClaude.`)) return
              props.onDeleteChats(live)
              clearSelection()
            }}
          >
            <Icon name="trash" size={15} />
          </button>
          <button className="icon-btn" title="Done (Esc)" onClick={clearSelection}>
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      <div className="side-account">
        <Menu
          className="account-menu"
          direction="up"
          trigger={
            <>
              <span className="avatar" style={avatarStyle(name)}>
                {name.slice(0, 1).toUpperCase()}
              </span>
              <span className="account-name">{name}</span>
              {plan && <span className="account-plan">· {plan}</span>}
              <Icon name="chevronDown" size={14} className="account-chev" />
            </>
          }
          entries={[
            { section: props.auth.email ?? 'Signed in' },
            { key: 'settings', label: 'Settings', onSelect: props.onSettings },
            { key: 'export', label: 'Export all chats…', onSelect: props.onExportAll },
            'divider',
            { key: 'signout', label: 'Sign out', onSelect: props.onSignOut }
          ]}
        />
        <button className="icon-btn account-settings" onClick={props.onSettings} title="Settings (Ctrl+,)">
          <Icon name="settings" size={18} />
        </button>
      </div>
    </aside>
  )
}
