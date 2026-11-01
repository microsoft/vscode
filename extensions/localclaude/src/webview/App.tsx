import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyEvent } from '../shared/reducer'
import type {
  AgentEvent,
  Artifact,
  ExportScope,
  ImportResult,
  MemoryItem,
  AppSettings,
  AuthStatus,
  ChatMessage,
  ComposeRequest,
  ContextUsage,
  DesignInfo,
  InitInfo,
  LockStatus,
  McpStatus,
  PermissionRequest,
  Project,
  RateLimitInfo,
  RemoteState,
  SessionMeta,
  SlashCommandInfo,
  TurnStats
} from '../shared/types'
import { api } from './api'
import { applyFonts } from './fonts'
import { ArtifactsView } from './components/ArtifactsView'
import { ChatView } from './components/ChatView'
import { DesignsView } from './components/DesignsView'
import { LockScreen } from './components/LockScreen'
import { LoginScreen } from './components/LoginScreen'
import { ExportDialog } from './components/ExportDialog'
import { PasswordDialog } from './components/PasswordDialog'
import { ProjectView, ProjectsView } from './components/Projects'
import type { TranscriptMode } from './components/MessageView'
import { SettingsDialog } from './components/SettingsDialog'
import { SIDEBAR_WIDTH, Sidebar } from './components/Sidebar'
import { Icon } from './components/Icon'
import { Spark } from './components/Spark'

export interface SessionRuntime {
  status: 'idle' | 'running' | 'starting'
  init?: InitInfo
  lastStats?: TurnStats
  context?: ContextUsage
  commands?: SlashCommandInfo[]
  mcp?: McpStatus[]
  /** when the current turn started (for the working timer) */
  turnStartedAt?: number
}

const NARROW = '(max-width: 900px)'

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* per-viewer convenience only */
  }
}

/** Sidebar open/closed. Wide windows remember it; narrow windows start closed and open as an overlay. */
function useSidebar(): { open: boolean; narrow: boolean; toggle: () => void; close: () => void } {
  const mq = useMemo(() => window.matchMedia(NARROW), [])
  const [narrow, setNarrow] = useState(mq.matches)
  const [open, setOpen] = useState(() => !mq.matches && readPref('sidebar') !== 'closed')
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent): void => {
      setNarrow(e.matches)
      setOpen(!e.matches && readPref('sidebar') !== 'closed')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mq])
  const toggle = useCallback(() => {
    setOpen((o) => {
      if (!narrow) writePref('sidebar', o ? 'closed' : 'open')
      return !o
    })
  }, [narrow])
  const close = useCallback(() => {
    if (narrow) setOpen(false)
  }, [narrow])
  return { open, narrow, toggle, close }
}

function loadTranscriptMode(): TranscriptMode {
  try {
    return localStorage.getItem('transcript') === 'verbose' ? 'verbose' : 'normal'
  } catch {
    return 'normal'
  }
}

function useTheme(theme: AppSettings['theme'] | undefined): void {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme !== 'light' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      void api.setWindowTheme(dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const [lock, setLock] = useState<LockStatus | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [histories, setHistories] = useState<Record<string, ChatMessage[]>>({})
  const [runtime, setRuntime] = useState<Record<string, SessionRuntime>>({})
  const [permissions, setPermissions] = useState<PermissionRequest[]>([])
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)
  const [settingsOpen, setSettingsOpen] = useState<false | string>(false)
  const [transcript, setTranscriptState] = useState<TranscriptMode>(loadTranscriptMode)
  const sidebar = useSidebar()
  const [sideWidth, setSideWidth] = useState(() => {
    const w = Number(readPref('sidebarWidth'))
    return w >= SIDEBAR_WIDTH.min && w <= SIDEBAR_WIDTH.max ? w : SIDEBAR_WIDTH.default
  })
  const [page, setPage] = useState<{ kind: 'chat' } | { kind: 'projects' } | { kind: 'artifacts' } | { kind: 'designs' } | { kind: 'project'; id: string }>({ kind: 'chat' })
  const [projects, setProjects] = useState<Project[]>([])
  const [artifacts, setArtifacts] = useState<Record<string, Artifact[]>>({})
  /** the artifact Claude touched most recently, so the chat can open it in the side panel */
  const [lastArtifact, setLastArtifact] = useState<{ sessionId: string; id: string; at: number } | null>(null)
  const [globalMemory, setGlobalMemory] = useState<MemoryItem[]>([])
  // Remote Control (one server at a time, for any chat's folder)
  const [remote, setRemote] = useState<RemoteState>({ status: 'off', log: [] })
  useEffect(() => {
    void api.remoteState().then(setRemote)
    return api.onRemote(setRemote)
  }, [])
  const [exportReq, setExportReq] = useState<{ scope: ExportScope; sessionId?: string; sessionIds?: string[]; projectId?: string } | null>(null)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  /** ask the open chat to show its find bar */
  const [findRequest, setFindRequest] = useState<{ query: string; n: number } | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.error ? 9000 : 6000)
    return () => clearTimeout(t)
  }, [toast])
  const loaded = useRef(new Set<string>())
  // back/forward through chats you opened, like the Claude app
  const nav = useRef<{ stack: string[]; i: number }>({ stack: [], i: -1 })
  const [, bumpNav] = useState(0)
  const openChat = useCallback((id: string | null) => {
    setActiveId(id)
    setPage({ kind: 'chat' })
    if (!id) return
    const n = nav.current
    if (n.stack[n.i] === id) return
    n.stack = [...n.stack.slice(0, n.i + 1), id]
    n.i = n.stack.length - 1
    bumpNav((x) => x + 1)
  }, [])
  const stepNav = useCallback((d: -1 | 1) => {
    const n = nav.current
    const i = n.i + d
    if (i < 0 || i >= n.stack.length) return
    n.i = i
    setActiveId(n.stack[i])
    setPage({ kind: 'chat' })
    bumpNav((x) => x + 1)
  }, [])

  const setTranscript = useCallback((m: TranscriptMode) => {
    setTranscriptState(m)
    writePref('transcript', m)
  }, [])

  useTheme(settings?.theme)
  useEffect(() => {
    if (settings) applyFonts(settings)
  }, [settings?.replyFont, settings?.uiFont])

  const refreshAuth = useCallback(async () => setAuth(await api.authStatus()), [])

  // ---- boot: lock → settings/sessions → auth
  const boot = useCallback(async () => {
    const l = await api.lockStatus()
    setLock(l)
    if (!l.ok) return
    const [s, list, projs, memory] = await Promise.all([api.getSettings(), api.listSessions(), api.listProjects(), api.globalMemory()])
    setSettings(s)
    setSessions(list)
    setProjects(projs)
    setGlobalMemory(memory)
    if (list.length) setActiveId((cur) => cur ?? list[0].id)
    if (list.length && nav.current.i < 0) nav.current = { stack: [list[0].id], i: 0 }
    void refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    void boot()
  }, [boot])

  // ---- live agent events
  useEffect(() => {
    return api.onEvent((e: AgentEvent) => {
      switch (e.type) {
        case 'status':
          setRuntime((r) => {
            const cur = r[e.sessionId]
            const wasIdle = !cur || cur.status === 'idle'
            const turnStartedAt = e.status === 'idle' ? undefined : wasIdle ? Date.now() : cur.turnStartedAt
            return { ...r, [e.sessionId]: { ...cur, status: e.status, turnStartedAt } }
          })
          return
        case 'context':
          setRuntime((r) => ({ ...r, [e.sessionId]: { ...(r[e.sessionId] ?? { status: 'idle' }), context: e.usage } }))
          return
        case 'commands':
          setRuntime((r) => ({ ...r, [e.sessionId]: { ...(r[e.sessionId] ?? { status: 'idle' }), commands: e.commands } }))
          return
        case 'mcp-status':
          setRuntime((r) => ({ ...r, [e.sessionId]: { ...(r[e.sessionId] ?? { status: 'idle' }), mcp: e.servers } }))
          return
        case 'init':
          setRuntime((r) => ({ ...r, [e.sessionId]: { ...r[e.sessionId], status: r[e.sessionId]?.status ?? 'running', init: e.info } }))
          return
        case 'meta':
          setSessions((list) => {
            const i = list.findIndex((s) => s.id === e.meta.id)
            const next = i >= 0 ? list.map((s) => (s.id === e.meta.id ? e.meta : s)) : [e.meta, ...list]
            return next.sort((a, b) => b.updatedAt - a.updatedAt)
          })
          return
        case 'permission':
          setPermissions((p) => [...p, e.request])
          return
        case 'permission-cancel':
          setPermissions((p) => p.filter((x) => x.requestId !== e.requestId))
          return
        case 'rate-limit':
          setRateLimit(e.info)
          return
        case 'sdk-session':
          return
        case 'artifact':
          setArtifacts((all) => {
            const list = all[e.sessionId] ?? []
            const i = list.findIndex((a) => a.id === e.artifact.id)
            return { ...all, [e.sessionId]: i >= 0 ? list.map((a) => (a.id === e.artifact.id ? e.artifact : a)) : [...list, e.artifact] }
          })
          setLastArtifact({ sessionId: e.sessionId, id: e.artifact.id, at: Date.now() })
          return
        case 'project':
          setProjects((list) => list.map((p) => (p.id === e.project.id ? e.project : p)))
          return
        case 'global-memory':
          setGlobalMemory(e.items)
          return
        case 'account':
          setAuth((a) => (a ? { ...a, email: e.email ?? a.email, subscriptionType: e.subscriptionType ?? a.subscriptionType } : a))
          return
        default:
          break
      }
      if ('sessionId' in e) {
        if (e.type === 'turn-done') setRuntime((r) => ({ ...r, [e.sessionId]: { ...r[e.sessionId], status: 'idle', lastStats: e.stats } }))
        setHistories((h) => (h[e.sessionId] ? { ...h, [e.sessionId]: applyEvent(h[e.sessionId], e) } : h))
      }
    })
  }, [])

  // ---- load history when a chat is opened
  useEffect(() => {
    if (!activeId || loaded.current.has(activeId)) return
    loaded.current.add(activeId)
    void Promise.all([api.history(activeId), api.isRunning(activeId), api.listArtifacts(activeId)]).then(([h, running, arts]) => {
      setHistories((cur) => ({ ...cur, [activeId]: cur[activeId] ?? h }))
      setArtifacts((cur) => ({ ...cur, [activeId]: cur[activeId] ?? arts }))
      if (running) setRuntime((r) => ({ ...r, [activeId]: { ...r[activeId], status: 'running' } }))
    })
  }, [activeId])

  /** Show a chat that was just made (it has no history yet). */
  const adoptChat = useCallback(
    (meta: SessionMeta) => {
      loaded.current.add(meta.id)
      setHistories((h) => ({ ...h, [meta.id]: [] }))
      setSessions((list) => [meta, ...list.filter((s) => s.id !== meta.id)])
      openChat(meta.id)
      return meta
    },
    [openChat]
  )
  const newChat = useCallback(
    async (cwd?: string, projectId?: string, design?: DesignInfo) => adoptChat(await api.createSession(cwd, projectId, design)),
    [adoptChat]
  )

  /** Build a design in code: a new chat in your project's folder, which reads the design's file. */
  const handoffDesign = useCallback(
    async (sessionId: string, artifactId: string, version: number) => {
      const folder = await api.pickFolder('Folder of the project to build the design in')
      if (!folder) return
      try {
        const { meta, path } = await api.designHandoff(sessionId, artifactId, version, folder)
        adoptChat(meta)
        const file = path.includes(' ') ? `@"${path}"` : `@${path}`
        await api.send({
          sessionId: meta.id,
          text:
            `Build this design in this project: ${file} (a single HTML file I made in LocalClaude's Design space).\n\n` +
            `Match its layout, colors, typography, spacing and content closely, but write it the way this project does things, with its framework, components and conventions, instead of pasting the HTML in. Look at how the project is organized first.`,
          attachments: []
        })
      } catch (e) {
        setToast({ text: e instanceof Error ? e.message : String(e), error: true })
      }
    },
    [adoptChat]
  )

  const deleteChat = useCallback(
    async (id: string) => {
      await api.deleteSession(id)
      loaded.current.delete(id)
      setSessions((list) => {
        const next = list.filter((s) => s.id !== id)
        if (activeId === id) setActiveId(next[0]?.id ?? null)
        nav.current.stack = nav.current.stack.filter((x) => x !== id)
        nav.current.i = Math.min(nav.current.i, nav.current.stack.length - 1)
        return next
      })
      setPermissions((p) => p.filter((x) => x.sessionId !== id))
    },
    [activeId]
  )

  const renameChat = useCallback(async (id: string, title: string) => {
    const meta = await api.updateSession(id, { title })
    setSessions((list) => list.map((s) => (s.id === id ? meta : s)))
  }, [])

  const pinChat = useCallback(async (id: string, pinned: boolean) => {
    const meta = await api.updateSession(id, { pinned })
    setSessions((list) => list.map((s) => (s.id === id ? meta : s)))
  }, [])

  const upsertProject = useCallback((p: Project) => {
    setProjects((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list]))
  }, [])

  const moveChat = useCallback(async (id: string, projectId: string | undefined) => {
    const meta = await api.updateSession(id, { projectId })
    setSessions((list) => list.map((s) => (s.id === id ? meta : s)))
  }, [])

  const pinProject = useCallback(
    async (id: string, pinned: boolean) => upsertProject(await api.updateProject(id, { pinned })),
    [upsertProject]
  )

  // several chats at once: from selecting them in the sidebar, or dragging them onto a project
  const moveChats = useCallback(
    async (ids: string[], projectId: string | undefined) => {
      for (const id of ids) await moveChat(id, projectId)
      const to = projects.find((p) => p.id === projectId)?.name
      setToast({ text: `${to ? 'Moved' : 'Removed'} ${ids.length} chat${ids.length === 1 ? '' : 's'} ${to ? `to “${to}”` : 'from their project'}.` })
    },
    [moveChat, projects]
  )
  const pinChats = useCallback(
    async (ids: string[], pinned: boolean) => {
      for (const id of ids) await pinChat(id, pinned)
    },
    [pinChat]
  )
  const deleteChats = useCallback(
    async (ids: string[]) => {
      for (const id of ids) {
        await api.deleteSession(id)
        loaded.current.delete(id)
      }
      const gone = new Set(ids)
      setSessions((list) => {
        const next = list.filter((s) => !gone.has(s.id))
        if (activeId && gone.has(activeId)) setActiveId(next[0]?.id ?? null)
        nav.current.stack = nav.current.stack.filter((x) => !gone.has(x))
        nav.current.i = Math.min(nav.current.i, nav.current.stack.length - 1)
        return next
      })
      setPermissions((p) => p.filter((x) => !gone.has(x.sessionId)))
      setToast({ text: `Deleted ${ids.length} chat${ids.length === 1 ? '' : 's'}.` })
    },
    [activeId]
  )

  const projectDeleted = useCallback((id: string) => {
    setProjects((list) => list.filter((p) => p.id !== id))
    setSessions((list) => list.map((s) => (s.projectId === id ? { ...s, projectId: undefined } : s)))
  }, [])

  /** Open a chat with one of its artifacts showing in the side panel. */
  const openArtifact = useCallback(
    (sessionId: string, artifactId: string) => {
      setLastArtifact({ sessionId, id: artifactId, at: Date.now() })
      openChat(sessionId)
    },
    [openChat]
  )

  /** a password-protected backup was picked: ask for its password */
  const [restoreAsk, setRestoreAsk] = useState(false)
  const imported = useCallback(async (r: ImportResult) => {
    const [list, projs, memory] = await Promise.all([api.listSessions(), api.listProjects(), api.globalMemory()])
    setSessions(list)
    setProjects(projs)
    setGlobalMemory(memory)
    const parts = [`${r.chats} chat${r.chats === 1 ? '' : 's'}`, `${r.projects} project${r.projects === 1 ? '' : 's'}`, `${r.artifacts} artifact${r.artifacts === 1 ? '' : 's'}`]
    if (r.memory) parts.push(`${r.memory} memor${r.memory === 1 ? 'y' : 'ies'}`)
    setToast({
      text:
        `Imported ${parts.join(', ')}.` +
        (r.skipped ? ` Skipped ${r.skipped} already here.` : '') +
        (r.withoutTranscript ? ` ${r.withoutTranscript} chat${r.withoutTranscript === 1 ? '' : 's'} will send ${r.withoutTranscript === 1 ? 'its' : 'their'} earlier messages to Claude as context.` : '')
    })
  }, [])
  const runImport = useCallback(async () => {
    const r = await api.importData()
    if (r.canceled) return
    if (r.needsPassword) return setRestoreAsk(true)
    if (!r.ok) return setToast({ text: r.error ?? 'Import failed.', error: true })
    await imported(r)
  }, [imported])
  const cancelRestore = useCallback(() => {
    setRestoreAsk(false)
    void api.cancelImport()
  }, [])

  const signOut = useCallback(async () => {
    await api.logout()
    setSettingsOpen(false)
    await refreshAuth()
  }, [refreshAuth])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(await api.setSettings(patch))
  }, [])

  // a notification was clicked / the global shortcut was pressed
  useEffect(() => api.onOpenSession((id) => openChat(id)), [openChat])
  useEffect(() => api.onNewChat(() => void newChat()), [newChat])

  // VS Code editor commands put a selection, problems or files into the open chat's message box (a new chat if none is open)
  const [compose, setCompose] = useState<(ComposeRequest & { n: number; sessionId: string }) | null>(null)
  const composeN = useRef(0)
  useEffect(
    () =>
      api.onCompose((c) => {
        const n = ++composeN.current
        const current = page.kind === 'chat' ? sessions.find((s) => s.id === activeId && !s.design) : undefined
        if (current) setCompose({ ...c, n, sessionId: current.id })
        else void newChat(c.cwd).then((meta) => setCompose({ ...c, n, sessionId: meta.id }))
      }),
    [activeId, sessions, page.kind, newChat]
  )
  // after the listeners above are in place: tell VS Code the app is ready for editor commands
  useEffect(() => void api.ready(), [])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        void newChat()
      } else if (mod && e.key === ',') {
        e.preventDefault()
        setSettingsOpen('general')
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        setTranscript(transcript === 'verbose' ? 'normal' : 'verbose')
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        sidebar.toggle()
      } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        stepNav(e.key === 'ArrowLeft' ? -1 : 1)
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'f' && page.kind === 'chat' && activeId) {
        e.preventDefault()
        setFindRequest({ query: window.getSelection()?.toString().trim().slice(0, 100) ?? '', n: Date.now() })
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
        // export what's on screen: the chat, the project, or everything
        e.preventDefault()
        if (page.kind === 'project') setExportReq({ scope: 'project', projectId: page.id })
        else if (page.kind === 'chat' && activeId) setExportReq({ scope: 'chat', sessionId: activeId })
        else setExportReq({ scope: 'all' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newChat, transcript, setTranscript, sidebar, stepNav, page, activeId])

  if (!lock) return <div className="splash">Opening…</div>
  if (!lock.ok)
    return (
      <LockScreen
        lock={lock}
        onReset={async () => {
          await api.resetData()
          loaded.current.clear()
          setHistories({})
          setActiveId(null)
          await boot()
        }}
      />
    )
  if (!settings || !auth) return <div className="splash">Checking your Claude sign-in…</div>
  if (!auth.loggedIn) return <LoginScreen auth={auth} onDone={refreshAuth} />

  const active = sessions.find((s) => s.id === activeId) ?? null
  const pendingBySession: Record<string, number> = {}
  for (const p of permissions) pendingBySession[p.sessionId] = (pendingBySession[p.sessionId] ?? 0) + 1

  const canBack = nav.current.i > 0
  const canForward = nav.current.i < nav.current.stack.length - 1
  // Shown in the chat's top bar while the sidebar is hidden.
  const headerLeft = !sidebar.open && (
    <div className="header-actions no-drag">
      <button className="icon-btn" onClick={sidebar.toggle} title="Show sidebar (Ctrl+B)">
        <Icon name="sidebar" size={18} />
      </button>
      <button className="icon-btn" disabled={!canBack} onClick={() => stepNav(-1)} title="Back (Alt+←)">
        <Icon name="back" size={18} />
      </button>
      <button className="icon-btn" disabled={!canForward} onClick={() => stepNav(1)} title="Forward (Alt+→)">
        <Icon name="forward" size={18} />
      </button>
      <button className="icon-btn" onClick={() => void newChat()} title="New chat (Ctrl+N)">
        <Icon name="compose" size={17} />
      </button>
    </div>
  )

  return (
    <div className={'app' + (sidebar.narrow ? ' narrow' : '')}>
      {sidebar.open && sidebar.narrow && <div className="sidebar-backdrop" onClick={sidebar.toggle} />}
      <Sidebar
        open={sidebar.open}
        overlay={sidebar.narrow}
        onCollapse={sidebar.toggle}
        sessions={sessions}
        projects={projects}
        activeId={page.kind === 'chat' ? activeId : null}
        activeProjectId={page.kind === 'project' ? page.id : null}
        runtime={runtime}
        pending={pendingBySession}
        auth={auth}
        canBack={canBack}
        canForward={canForward}
        onBack={() => stepNav(-1)}
        onForward={() => stepNav(1)}
        onPin={(id, p) => void pinChat(id, p)}
        onExportChat={(id) => setExportReq({ scope: 'chat', sessionId: id })}
        onOpenSearchHit={(id, query) => {
          openChat(id)
          setFindRequest({ query, n: Date.now() })
          sidebar.close()
        }}
        onOpenProject={(id) => {
          setPage({ kind: 'project', id })
          sidebar.close()
        }}
        onPinProject={(id, p) => void pinProject(id, p)}
        onExportAll={() => setExportReq({ scope: 'all' })}
        onImport={() => void runImport()}
        projectsActive={page.kind === 'projects'}
        onProjects={() => {
          setPage({ kind: 'projects' })
          sidebar.close()
        }}
        artifactsActive={page.kind === 'artifacts'}
        onArtifacts={() => {
          setPage({ kind: 'artifacts' })
          sidebar.close()
        }}
        designActive={page.kind === 'designs' || (page.kind === 'chat' && !!active?.design)}
        onDesign={() => {
          setPage({ kind: 'designs' })
          sidebar.close()
        }}
        onSignOut={() => void signOut()}
        onSelect={(id) => {
          openChat(id)
          sidebar.close()
        }}
        onNew={() => {
          void newChat()
          sidebar.close()
        }}
        onNewIn={(cwd, projectId) => {
          void newChat(cwd, projectId)
          sidebar.close()
        }}
        width={sideWidth}
        onResize={(w, done) => {
          setSideWidth(w)
          if (done) writePref('sidebarWidth', String(w))
        }}
        userName={settings.userName ?? ''}
        onDelete={(id) => void deleteChat(id)}
        onDeleteChats={(ids) => void deleteChats(ids)}
        onPinChats={(ids, p) => void pinChats(ids, p)}
        onMoveChats={(ids, pid) => void moveChats(ids, pid)}
        onExportChats={(ids) => setExportReq({ scope: 'chats', sessionIds: ids })}
        onRename={(id, t) => void renameChat(id, t)}
        onSettings={() => setSettingsOpen('general')}
      />
      <main className="main">
        {page.kind === 'artifacts' ? (
          <ArtifactsView headerLeft={headerLeft} projects={projects} onOpen={openArtifact} />
        ) : page.kind === 'designs' ? (
          <DesignsView
            headerLeft={headerLeft}
            sessions={sessions}
            onOpen={openChat}
            onCreate={async (d) => {
              const meta = await newChat(d.cwd, undefined, d.design)
              if (d.model !== meta.model) await api.setModel(meta.id, d.model)
              if (d.permissionMode !== meta.permissionMode) await api.setMode(meta.id, d.permissionMode)
              await api.send({ sessionId: meta.id, text: d.text, attachments: d.attachments })
            }}
            onPin={(id, p) => void pinChat(id, p)}
            onDelete={(id) => void deleteChat(id)}
            settings={settings}
            onSettings={updateSettings}
          />
        ) : page.kind === 'projects' ? (
          <ProjectsView
            projects={projects}
            sessions={sessions}
            headerLeft={headerLeft}
            onOpen={(id) => setPage({ kind: 'project', id })}
            onCreated={(p) => {
              upsertProject(p)
              setPage({ kind: 'project', id: p.id })
            }}
            onPin={(id, p) => void pinProject(id, p)}
            onExport={(id) => setExportReq({ scope: 'project', projectId: id })}
            onDeleted={projectDeleted}
            onDropChats={(pid, ids) => void moveChats(ids, pid)}
          />
        ) : page.kind === 'project' && projects.some((p) => p.id === page.id) ? (
          <ProjectView
            key={page.id}
            project={projects.find((p) => p.id === page.id)!}
            sessions={sessions}
            headerLeft={headerLeft}
            defaultCwd={settings.defaultCwd}
            memoryEnabled={settings.memory}
            onEnableMemory={() => void updateSettings({ memory: true })}
            onBack={() => setPage({ kind: 'projects' })}
            onChanged={upsertProject}
            onDeleted={() => {
              projectDeleted(page.id)
              setPage({ kind: 'projects' })
            }}
            onOpenChat={openChat}
            onOpenArtifact={openArtifact}
            onExport={() => setExportReq({ scope: 'project', projectId: page.id })}
            onPin={(p) => void pinProject(page.id, p)}
            onStartChat={(text) =>
              void newChat(undefined, page.id).then((meta) => api.send({ sessionId: meta.id, text, attachments: [] }))
            }
          />
        ) : active ? (
          <ChatView
            key={active.id}
            meta={active}
            compose={compose?.sessionId === active.id ? compose : null}
            history={histories[active.id] ?? []}
            runtime={runtime[active.id] ?? { status: 'idle' }}
            permission={permissions.find((p) => p.sessionId === active.id) ?? null}
            settings={settings}
            rateLimit={rateLimit}
            transcript={transcript}
            onTranscript={setTranscript}
            onPermissionDone={(rid) => setPermissions((p) => p.filter((x) => x.requestId !== rid))}
            onMeta={(m) => setSessions((list) => list.map((s) => (s.id === m.id ? m : s)))}
            onOpenSettings={(tab) => setSettingsOpen(tab)}
            headerLeft={headerLeft}
            artifacts={artifacts[active.id] ?? []}
            lastArtifact={lastArtifact?.sessionId === active.id ? lastArtifact : null}
            project={projects.find((p) => p.id === active.projectId)}
            projects={projects}
            onOpenProject={(id) => setPage({ kind: 'project', id })}
            onMoveToProject={(pid) => void moveChat(active.id, pid)}
            onProjectChanged={upsertProject}
            remote={remote}
            onSettings={updateSettings}
            onRename={(t) => void renameChat(active.id, t)}
            onPin={(p) => void pinChat(active.id, p)}
            onDelete={() => {
              void deleteChat(active.id)
              if (active.design) setPage({ kind: 'designs' })
            }}
            onExport={() => setExportReq({ scope: 'chat', sessionId: active.id })}
            findRequest={findRequest}
            onFindHandled={() => setFindRequest(null)}
            onOpenDesigns={() => setPage({ kind: 'designs' })}
            onHandoff={(artifactId, version) => void handoffDesign(active.id, artifactId, version)}
          />
        ) : (
          <div className="empty-main">
            <div className="titlebar floating">{headerLeft}</div>
            <Spark size={44} className="welcome-spark" />
            <h1>What should we work on?</h1>
            <p>Claude can read and edit your files, run commands, browse and use your tools — all on this machine.</p>
            <button className="btn primary" onClick={() => void newChat()}>
              Start a new chat
            </button>
          </div>
        )}
      </main>
      {settingsOpen && (
        <SettingsDialog
          tab={settingsOpen}
          settings={settings}
          auth={auth}
          onTab={setSettingsOpen}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
          onLogout={signOut}
          globalMemory={globalMemory}
          onGlobalMemory={setGlobalMemory}
          onExportAll={() => setExportReq({ scope: 'all' })}
          onImport={() => void runImport()}
        />
      )}
      {exportReq && (
        <ExportDialog
          scope={exportReq.scope}
          sessionId={exportReq.sessionId}
          sessionIds={exportReq.sessionIds}
          projectId={exportReq.projectId}
          sessions={sessions}
          projects={projects}
          onClose={() => setExportReq(null)}
        />
      )}
      {restoreAsk && (
        <PasswordDialog
          title="Restore a backup"
          body="Enter the password this backup was made with. Chats, projects and memory that are already here are skipped."
          submitLabel="Restore"
          onCancel={cancelRestore}
          onSubmit={async (password) => {
            const r = await api.importWithPassword(password)
            if (!r.ok) return r.error ?? 'Couldn’t restore this backup.'
            setRestoreAsk(false)
            await imported(r)
            return null
          }}
        />
      )}
      {toast && (
        <div className={'toast' + (toast.error ? ' error' : '')} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
