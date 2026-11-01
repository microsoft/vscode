// The design canvas, beside the design's chat, like Claude Design: a board of frames in rows by section,
// which you pan and zoom. Open a frame to use it (at desktop, tablet or mobile size, or its own size),
// comment on any element, go through versions, present the frames, and export them as PNG, PDF or HTML.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { designKind, type Viewport } from '../../shared/design'
import { artifactLang, fenced } from '../../shared/format'
import { streamingFields, type StreamingField } from '../../shared/partialJson'
import type { ToolPart } from '../../shared/steps'
import type { Artifact, DesignInfo, DesignKind } from '../../shared/types'
import { api } from '../api'
import { buildDesignClip, writeClip, type DesignClip } from '../designClipboard'
import { PreviewError, type PanelState } from './ArtifactPanel'
import { Icon } from './Icon'
import { Markdown } from './Markdown'
import { Menu, type MenuEntry } from './Menu'
import { Spark } from './Spark'
import { artifactUrl, draftUrl } from '../vscode/urls'

/** An element picked in comment mode (the page sends it, see withDesignBridge). */
export interface DesignPick {
  selector: string
  tag: string
  text: string
  html: string
  rect: { x: number; y: number; w: number; h: number }
}

/** A frame a subagent is writing (it shows as a placeholder until it's saved). */
export interface PendingFrame {
  key: string
  title: string
}

const FOCUS_ZOOMS = [
  { value: 0, label: 'Fit' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' }
]
/** space around a frame when it's open */
const PAD = 28
/** the chat beside the canvas: drag the edge between them; double-click for the default */
const CHAT_WIDTH = { min: 300, default: 400 }
const MIN_CANVAS = 420
/** the board: gaps between frames and between sections (room for the labels above), zoom limits */
const GAP_X = 80
const GAP_Y = 320
const ZOOM = { min: 0.03, max: 2 }
/** space on screen above the first row, for its section heading and frame labels */
const BOARD_TOP = 64
const PENDING_SECTION = 'Being designed'
/** a frame's size when Claude didn't give one */
const DEFAULT_SIZE: Record<DesignKind, { w: number; h: number }> = {
  prototype: { w: 1440, h: 900 },
  slides: { w: 1920, h: 1080 },
  wireframe: { w: 1440, h: 900 },
  onepager: { w: 794, h: 1123 },
  other: { w: 1440, h: 900 }
}

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

function isPick(p: unknown): p is DesignPick {
  const x = p as DesignPick | null
  return !!x && typeof x.selector === 'string' && typeof x.tag === 'string' && typeof x.rect?.x === 'number' && typeof x.rect?.y === 'number'
}

const typing = (t: EventTarget | null): boolean => !!(t as HTMLElement | null)?.closest?.('textarea, input, [contenteditable="true"]')

/** What Claude gets for a comment on one element of a frame. */
export function commentMessage(title: string, pick: DesignPick, comment: string, version?: { n: number; of: number }): string {
  const lines = [
    `Comment on the frame “${title}”${version ? ` (I'm looking at version ${version.n} of ${version.of})` : ''}, about this element:`,
    `- selector: \`${pick.selector}\``
  ]
  if (pick.text) lines.push(`- text: “${pick.text}”`)
  lines.push(`- HTML: ${fenced(pick.html, 'html')}`, '', comment.trim())
  return lines.join('\n')
}

interface Draft {
  id: string
  title: string
  updating: boolean
  /** the page so far, when it can be shown while it's written (a new page, or a rewrite, of HTML or SVG) */
  html: string | null
  /** how much Claude has written */
  size: number
  section?: string
  width?: number
  height?: number
}

const num = (f?: StreamingField): number | undefined => {
  const n = f?.done ? Number(f.value) : NaN
  return Number.isFinite(n) && n >= 64 ? n : undefined
}

/** The artifact Claude is writing, read from the tool call as it streams in. */
function draftOf(part: ToolPart | null | undefined, artifacts: Artifact[]): Draft | null {
  if (!part) return null
  const done = part.input && typeof part.input === 'object' && Object.keys(part.input).length > 0
  const f: Record<string, StreamingField> = done
    ? Object.fromEntries(Object.entries(part.input as Record<string, unknown>).map(([k, v]) => [k, { value: String(v ?? ''), done: true }]))
    : streamingFields(part.inputJsonPartial ?? '')
  const id = f.id?.done ? f.id.value : ''
  const target = artifacts.find((a) => a.id === id)
  const updating = part.name.endsWith('update_artifact')
  const type = updating ? target?.type : f.type?.done ? f.type.value : undefined
  // small edits (old_str → new_str) take a moment and show when they're done
  const html = f.content && (!type || type === 'html' || type === 'svg') ? f.content.value : null
  return {
    id,
    title: f.title?.value || target?.title || '',
    updating,
    html,
    size: done ? JSON.stringify(part.input).length : (part.inputJsonPartial ?? '').length,
    section: f.section?.done ? f.section.value : undefined,
    width: num(f.width),
    height: num(f.height)
  }
}

/** The design as Claude writes it: the HTML so far, redrawn a few times a second (see DRAFT_PAGE). */
function DraftFrame({ html, width, height, scale = 1 }: { html: string; width: number; height: number; scale?: number }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const latest = useRef(html)
  latest.current = html
  const sent = useRef<string | null>(null)
  const ready = useRef(false)
  const flush = (): void => {
    if (!ready.current || sent.current === latest.current) return
    sent.current = latest.current
    frame.current?.contentWindow?.postMessage({ __lcDraft: latest.current }, '*')
  }
  useEffect(() => {
    const t = setInterval(flush, 250)
    return () => clearInterval(t)
  }, [])
  return (
    <iframe
      ref={frame}
      className="design-draft"
      src={draftUrl()}
      title="The design as Claude writes it"
      sandbox="allow-scripts"
      style={{ width, height, transform: scale === 1 ? undefined : `scale(${scale})` }}
      onLoad={() => {
        ready.current = true
        flush()
      }}
    />
  )
}

/** A frame on the board. */
interface Frame {
  key: string
  title: string
  section: string
  w: number
  h: number
  x: number
  y: number
  artifact?: Artifact
  /** a subagent is writing it */
  pending?: boolean
}

export function DesignCanvas(props: {
  sessionId: string
  design: DesignInfo
  artifacts: Artifact[]
  /** the selected frame (and version); id null = none */
  state: PanelState
  onState: (s: PanelState) => void
  busy: boolean
  /** the artifact tool call Claude is in the middle of, if any (it streams onto the board) */
  writing?: ToolPart | null
  /** frames subagents are writing */
  pending?: PendingFrame[]
  /** send a message in the design's chat */
  onSend: (text: string) => void
  onFix: (title: string, error: string) => void
  /** build the design in code, in a new chat */
  onHandoff: (artifactId: string, version: number) => void
}) {
  const kind = designKind(props.design.kind)
  const def = DEFAULT_SIZE[props.design.kind] ?? DEFAULT_SIZE.other
  const sid = props.sessionId
  const [chatWidth, setChatWidth] = useState(() => Math.max(CHAT_WIDTH.min, Number(readPref('designChatWidth')) || CHAT_WIDTH.default))
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const [notice, setNotice] = useState<{ text: string; path?: string; error?: boolean } | null>(null)
  const [commenting, setCommenting] = useState(false)
  const [picked, setPick] = useState<{ key: string; src: string; at: DesignPick } | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<{ key: string; src: string; text: string } | null>(null)
  /** the open frame (null = the board), and whether it fills the window to present */
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  /** frames selected together (empty when one or none is selected: that's the panel's state) */
  const [group, setGroup] = useState<string[]>([])
  /** the box being dragged to select frames (px on the board) */
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  /** hand tool, or Space held: dragging pans instead of selecting */
  const [hand, setHand] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const [view, setView] = useState<'preview' | 'code'>('preview')
  const [viewportKey, setViewportKey] = useState(() => readPref('design.viewport.' + sid) ?? '')
  const [zoom, setZoom] = useState(0)
  /** the board's pan and zoom: screen = world × z + (x, y) */
  const [cam, setCam] = useState({ x: 0, y: 0, z: 0.2 })
  const camRef = useRef(cam)
  camRef.current = cam
  /** you moved the board yourself, so new frames don't re-fit it */
  const moved = useRef(false)
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const frames = useRef(new Map<string, HTMLIFrameElement>())
  const loaded = useRef(new Map<string, string>())
  const [, bump] = useState(0)

  const draft = draftOf(props.writing, props.artifacts)
  const pending = props.pending ?? []

  // ---- the board's layout: a row per section, frames left to right in the order they were made
  const { list, bounds } = useMemo(() => {
    const items: Omit<Frame, 'x' | 'y'>[] = [...props.artifacts]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((a) => ({ key: a.id, title: a.title, section: a.frame?.section ?? '', w: a.frame?.width ?? def.w, h: a.frame?.height ?? def.h, artifact: a }))
    if (draft?.id && !props.artifacts.some((a) => a.id === draft.id))
      items.push({ key: draft.id, title: draft.title || 'New frame', section: draft.section ?? '', w: draft.width ?? def.w, h: draft.height ?? def.h })
    for (const p of pending) items.push({ key: 'pending:' + p.key, title: p.title, section: PENDING_SECTION, w: def.w, h: def.h, pending: true })
    const order: string[] = []
    for (const it of items) if (!order.includes(it.section)) order.push(it.section)
    const out: Frame[] = []
    let y = 0
    let maxX = 0
    for (const section of order) {
      let x = 0
      let rowH = 0
      for (const it of items.filter((i) => i.section === section)) {
        out.push({ ...it, x, y })
        x += it.w + GAP_X
        rowH = Math.max(rowH, it.h)
      }
      maxX = Math.max(maxX, x - GAP_X)
      y += rowH + GAP_Y
    }
    return { list: out, bounds: { w: Math.max(1, maxX), h: Math.max(1, y - GAP_Y) } }
  }, [props.artifacts, draft?.id, draft?.title, draft?.section, draft?.width, draft?.height, pending.map((p) => p.key + p.title).join(), def.w, def.h])
  const shape = list.map((f) => `${f.key}:${f.x},${f.y},${f.w},${f.h}`).join('|')
  const sections = list.filter((f, i) => f.section && list.findIndex((g) => g.section === f.section) === i)

  const versionOf = (a: Artifact): number => (a.id === props.state.id && props.state.version != null ? Math.min(props.state.version, a.versions.length - 1) : a.versions.length - 1)
  const srcOf = (a: Artifact): string => {
    const vi = versionOf(a)
    return artifactUrl(sid, a.id, vi, a.versions[vi].ts, true)
  }
  const selected = props.artifacts.find((a) => a.id === props.state.id)
  const focus = focusKey ? list.find((f) => f.key === focusKey && f.artifact) : undefined
  // the frame the toolbar acts on: the open one, else the selected one
  const current = focus?.artifact ?? selected
  const order = list.filter((f) => f.artifact)

  // While Claude writes a frame, it builds up live; the last of it stays up until the finished page has loaded.
  const held = useRef<{ id: string; html: string } | null>(null)
  if (draft?.html != null && draft.id) held.current = { id: draft.id, html: draft.html }
  else if (held.current && !draft) {
    const a = props.artifacts.find((x) => x.id === held.current!.id)
    if (!a || loaded.current.get(a.id) === srcOf(a)) held.current = null
  }
  const liveFor = (key: string): string | null => (draft?.id === key && draft.html != null ? draft.html : held.current?.id === key ? held.current.html : null)

  // ---- sizes, fitting and the camera
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [!!focus, view, list.length > 0])
  const fitCam = (): { x: number; y: number; z: number } => {
    const W = stageSize.w
    const H = stageSize.h
    const z = Math.max(ZOOM.min, Math.min(1, (W - 2 * PAD) / bounds.w, (H - PAD - BOARD_TOP) / bounds.h))
    return { x: (W - bounds.w * z) / 2, y: BOARD_TOP + Math.max(0, (H - PAD - BOARD_TOP - bounds.h * z) / 2), z }
  }
  const fit = (): void => {
    moved.current = false
    setCam(fitCam())
  }
  // new frames: fit them all in, unless you've moved the board yourself
  useEffect(() => {
    if (stageSize.w && !moved.current && !focus) setCam(fitCam())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, stageSize.w, stageSize.h, !!focus])
  const zoomAt = (z: number, sx = stageSize.w / 2, sy = stageSize.h / 2): void => {
    moved.current = true
    setCam((c) => {
      const nz = Math.max(ZOOM.min, Math.min(ZOOM.max, z))
      return { z: nz, x: sx - ((sx - c.x) * nz) / c.z, y: sy - ((sy - c.y) * nz) / c.z }
    })
  }
  // the wheel pans; Ctrl+wheel (and pinching a touchpad) zooms where the pointer is
  useEffect(() => {
    const el = stage.current
    if (!el || focus) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      moved.current = true
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        const c = camRef.current
        zoomAt(c.z * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top)
      } else setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // ---- selecting frames: drag a box (or click, Shift/Ctrl+click to add, Ctrl+A for all); several can be selected
  const choose = (keys: string[]): void => {
    setGroup(keys.length > 1 ? keys : [])
    props.onState({ id: keys.length === 1 ? keys[0] : null, version: null })
  }
  const picks = group.length ? group : selected ? [selected.id] : []

  // Drag on the board to select; to pan, hold Space, drag with the middle button, use the hand tool, or scroll.
  // A click picks a frame (or nothing); a double-click opens it.
  const startDrag = (e: MouseEvent): void => {
    if (e.button !== 0 && e.button !== 1) return
    if ((e.target as HTMLElement).closest('button, textarea, .design-comment, .menu-wrap')) return
    e.preventDefault()
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-frame]')?.dataset.frame
    const pan = e.button === 1 || spaceDown || hand
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const base = additive ? picks : []
    const origin = stage.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const start = { x: e.clientX, y: e.clientY, cx: camRef.current.x, cy: camRef.current.y }
    let dragged = false
    document.body.classList.add(pan ? 'panning-board' : 'selecting-board')
    const move = (ev: globalThis.MouseEvent): void => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!dragged && Math.hypot(dx, dy) < 4) return
      dragged = true
      if (pan) {
        moved.current = true
        setCam((c) => ({ ...c, x: start.cx + dx, y: start.cy + dy }))
        return
      }
      const x1 = Math.min(start.x, ev.clientX) - origin.left
      const y1 = Math.min(start.y, ev.clientY) - origin.top
      const x2 = Math.max(start.x, ev.clientX) - origin.left
      const y2 = Math.max(start.y, ev.clientY) - origin.top
      setBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
      const c = camRef.current
      // the frames the box touches
      const inside = list
        .filter((f) => f.artifact && c.x + f.x * c.z < x2 && c.x + (f.x + f.w) * c.z > x1 && c.y + f.y * c.z < y2 && c.y + (f.y + f.h) * c.z > y1)
        .map((f) => f.key)
      choose([...new Set([...base, ...inside])])
    }
    const up = (): void => {
      document.body.classList.remove('panning-board', 'selecting-board')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setBox(null)
      if (dragged) return
      const f = list.find((x) => x.key === key)
      if (!f?.artifact) return choose(additive ? base : [])
      choose(additive ? (base.includes(f.key) ? base.filter((k) => k !== f.key) : [...base, f.key]) : [f.key])
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const open = (key: string): void => {
    const f = list.find((x) => x.key === key && x.artifact)
    if (!f) return
    setFocusKey(key)
    setGroup([])
    setView('preview')
    setZoom(0)
    if (f.artifact!.id !== props.state.id) props.onState({ id: f.artifact!.id, version: null })
  }
  const step = (d: -1 | 1): void => {
    if (!order.length) return
    const i = order.findIndex((f) => f.key === focusKey)
    open(order[(i + d + order.length) % order.length].key)
  }
  const closeFocus = (): void => {
    setFocusKey(null)
    setPresenting(false)
  }

  // ---- pages talk to the canvas: comment picks, Esc inside a page, and errors
  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      let key: string | null = null
      for (const [k, f] of frames.current) if (f.contentWindow === e.source) key = k
      if (!key) return
      const f = frames.current.get(key)!
      if (isPick(e.data?.__lcDesignPick)) {
        setPick({ key, src: f.getAttribute('src') ?? '', at: e.data.__lcDesignPick })
        setComment('')
      } else if (e.data?.__lcDesignKey === 'Escape') {
        setPick(null)
        setCommenting(false)
      } else if (typeof e.data?.__lcArtifactError === 'string') {
        const src = f.getAttribute('src') ?? ''
        const text = String(e.data.__lcArtifactError).replace(/(?:artifact:\/\/view|https?:\/\/127\.0\.0\.1:\d+\/[0-9a-f]+\/artifact)\/\S*?(:\d+:\d+)/g, 'page$1')
        setError((cur) => (cur?.src === src ? cur : { key, src, text }))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  const postAll = (msg: unknown): void => {
    for (const f of frames.current.values()) f.contentWindow?.postMessage(msg, '*')
  }
  useEffect(() => {
    postAll({ __lcDesign: 'comment', on: commenting })
    if (!commenting) setPick(null)
  }, [commenting])
  // a new version reloads its page: whatever was picked in it is gone
  const pick = picked && frames.current.get(picked.key)?.getAttribute('src') === picked.src ? picked : null
  useEffect(() => setPick(null), [focusKey])
  const frameRef = (key: string) => (el: HTMLIFrameElement | null) => {
    if (el) frames.current.set(key, el)
    else frames.current.delete(key)
  }

  useEffect(() => {
    if (!notice || notice.error === undefined) return
    const t = setTimeout(() => setNotice(null), notice.error ? 9000 : 6000)
    return () => clearTimeout(t)
  }, [notice])

  // ---- keys (not while you're typing): Esc, arrows to step through open frames, Shift+1 to fit, Ctrl +/- to zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (typing(e.target)) return
      if (e.key === ' ' && !focus && !(e.target as HTMLElement | null)?.closest?.('button')) {
        e.preventDefault()
        setSpaceDown(true)
      } else if (e.key === 'Escape') {
        if (pick) closePick()
        else if (commenting) setCommenting(false)
        else if (focus) closeFocus()
        else if (picks.length) choose([])
        else return
        e.preventDefault()
      } else if (!focus && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && order.length) {
        e.preventDefault()
        choose(order.map((f) => f.key))
      } else if (focus && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        step(e.key === 'ArrowRight' ? 1 : -1)
      } else if (!focus && e.shiftKey && (e.key === '!' || e.code === 'Digit1')) {
        e.preventDefault()
        fit()
      } else if (!focus && (e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-')) {
        e.preventDefault()
        zoomAt(cam.z * (e.key === '-' ? 1 / 1.25 : 1.25))
      } else if (!focus && e.key === 'Enter' && selected) {
        e.preventDefault()
        open(selected.id)
      }
    }
    const onUp = (e: KeyboardEvent): void => {
      if (e.key === ' ') setSpaceDown(false)
    }
    const onBlur = (): void => setSpaceDown(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  })

  const closePick = (): void => {
    setPick(null)
    postAll({ __lcDesign: 'release' })
  }
  const sendComment = (): void => {
    const a = pick && list.find((f) => f.key === pick.key)?.artifact
    if (!a || !pick || !comment.trim() || props.busy) return
    const vi = versionOf(a)
    props.onSend(commentMessage(a.title, pick.at, comment, vi < a.versions.length - 1 ? { n: vi + 1, of: a.versions.length } : undefined))
    closePick()
  }

  // ---- export
  const sizeOf = (a: Artifact): { w: number; h: number } => ({ w: a.frame?.width ?? def.w, h: a.frame?.height ?? def.h })
  const done = (r: { ok: boolean; canceled?: boolean; error?: string; path?: string }): void => {
    if (r.canceled) setNotice(null)
    else if (r.ok && r.path) setNotice({ text: `Saved ${r.path.split(/[\\/]/).pop()}`, path: r.path, error: false })
    else setNotice({ text: r.error ?? 'Export failed.', error: true })
  }
  const exportFrame = async (a: Artifact, format: 'pdf' | 'png'): Promise<void> => {
    setNotice({ text: `Exporting ${a.title} as ${format.toUpperCase()}…` })
    // an open web page exports at the width you're viewing it at
    const vpNow = focus?.artifact?.id === a.id ? vp : null
    const s = sizeOf(a)
    const exact = !!a.frame?.height && (!vpNow || vpNow.key === 'frame')
    done(await api.exportDesign(sid, a.id, versionOf(a), format, vpNow?.width ?? s.w, vpNow?.height ?? s.h, exact))
  }
  const exportAll = async (keys?: string[]): Promise<void> => {
    const frames = keys ? order.filter((f) => keys.includes(f.key)) : order
    setNotice({ text: `Exporting ${frames.length} frame${frames.length === 1 ? '' : 's'} as one PDF…` })
    done(await api.exportDesignAll(sid, frames.map((f) => ({ artifactId: f.artifact!.id, version: versionOf(f.artifact!), width: f.w, height: f.h }))))
  }

  // ---- copy frames so they paste into a claude.ai Design canvas (and as pages elsewhere)
  const clipFor = (keys: string[]): DesignClip | null =>
    buildDesignClip(
      order
        .filter((f) => keys.includes(f.key))
        .map((f) => ({ id: f.key, title: f.title, html: f.artifact!.versions[versionOf(f.artifact!)].content, x: f.x, y: f.y, w: f.w, h: f.h }))
    )
  const copied = (clip: DesignClip | null): void => {
    if (!clip) return setNotice({ text: 'Nothing to copy: these frames came from Claude Design, so they’re already there.', error: true })
    setNotice({
      text:
        `Copied ${clip.frames} frame${clip.frames === 1 ? '' : 's'}. In claude.ai Design, click the canvas and press Ctrl+V.` +
        (clip.scriptsDropped ? ` Scripts don’t carry over (${clip.scriptsDropped}), so interactions stay behind.` : '') +
        (clip.skipped.length ? ` Left out: ${clip.skipped.join(', ')} (from Claude Design).` : ''),
      error: false
    })
  }
  const copyFrames = (keys: string[]): void => {
    const clip = clipFor(keys)
    if (clip && !writeClip(clip)) return setNotice({ text: 'Couldn’t copy to the clipboard.', error: true })
    copied(clip)
  }
  // Ctrl+C on the board copies the selected frames (unless you're copying selected text)
  useEffect(() => {
    const onCopy = (e: ClipboardEvent): void => {
      if (focus || !picks.length || typing(e.target) || window.getSelection()?.toString()) return
      const clip = clipFor(picks)
      if (!clip || !e.clipboardData) return copied(clip)
      e.clipboardData.setData('text/plain', clip.text)
      e.clipboardData.setData('text/html', clip.html)
      e.preventDefault()
      copied(clip)
    }
    window.addEventListener('copy', onCopy)
    return () => window.removeEventListener('copy', onCopy)
  })

  // drag the edge between the chat and the canvas
  const startResize = (e: MouseEvent): void => {
    e.preventDefault()
    const row = root.current?.parentElement?.getBoundingClientRect().width ?? 1200
    const startX = e.clientX
    const startW = chatWidth
    let w = startW
    document.body.classList.add('resizing-sidebar')
    const move = (ev: globalThis.MouseEvent): void => {
      w = Math.round(Math.max(CHAT_WIDTH.min, Math.min(row - MIN_CANVAS, startW + ev.clientX - startX)))
      setChatWidth(w)
    }
    const up = (): void => {
      document.body.classList.remove('resizing-sidebar')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      writePref('designChatWidth', String(w))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // ---- an open frame: its own size, or (for a web page) desktop, tablet or mobile
  const fa = focus?.artifact
  const frameVp: Viewport | null = fa?.frame?.width ? { key: 'frame', label: `Frame · ${fa.frame.width}×${fa.frame.height ?? def.h}`, width: fa.frame.width, height: fa.frame.height ?? def.h, icon: 'grid' } : null
  const responsive = !fa?.frame?.width || fa.frame.width >= 768
  const viewports = [...(frameVp ? [frameVp] : []), ...(responsive && kind.viewports.length > 1 ? kind.viewports : frameVp ? [] : kind.viewports)]
  const vp = viewports.find((v) => v.key === viewportKey) ?? viewports[0] ?? kind.viewports[0]
  const availW = Math.max(0, stageSize.w - PAD * 2)
  const availH = Math.max(0, stageSize.h - PAD * 2)
  const fitScale = vp.height ? Math.min(1, availW / vp.width, availH / vp.height) : Math.min(1, availW / vp.width)
  const scale = zoom || fitScale || 1
  const frameH = vp.height ?? availH / scale

  // where the comment box goes: under the picked element, or above it near the bottom
  let pickPos: { left: number; top: number; above: boolean } | null = null
  if (pick && stage.current) {
    const el = frames.current.get(pick.key)
    if (el) {
      const f = el.getBoundingClientRect()
      const s = stage.current.getBoundingClientRect()
      const k = f.width / (el.offsetWidth || 1)
      const x = f.left - s.left + stage.current.scrollLeft + pick.at.rect.x * k
      const below = f.top - s.top + (pick.at.rect.y + pick.at.rect.h) * k + 8
      const above = below + 190 > s.height
      pickPos = {
        left: Math.max(8, Math.min(x, stage.current.scrollLeft + s.width - 328)),
        top: stage.current.scrollTop + (above ? f.top - s.top + pick.at.rect.y * k - 8 : below),
        above
      }
    }
  }

  const exportMenu: MenuEntry[] = [
    { section: current ? current.title : 'Export' },
    ...(group.length > 1
      ? ([{ key: 'sel', label: `${group.length} selected frames as PDF`, hint: 'A page per frame', onSelect: () => void exportAll(group) }] as MenuEntry[])
      : current
        ? ([
          { key: 'png', label: 'PNG image', hint: current.frame?.height ? `${sizeOf(current).w}×${sizeOf(current).h}, at 2×` : 'The whole page, at 2×', onSelect: () => void exportFrame(current, 'png') },
          { key: 'pdf', label: 'PDF', hint: 'This frame', onSelect: () => void exportFrame(current, 'pdf') },
          { key: 'html', label: current.type === 'html' ? 'HTML file' : 'Source file', onSelect: () => void api.saveArtifact(sid, current.id, versionOf(current)) },
          { key: 'browser', label: 'Open in your browser', onSelect: () => void api.openArtifactInBrowser(sid, current.id, versionOf(current)) },
          { key: 'copy', label: 'Copy code', onSelect: () => void navigator.clipboard.writeText(current.versions[versionOf(current)].content) }
        ] as MenuEntry[])
      : [{ key: 'none', label: 'Select a frame to export it', disabled: true, onSelect: () => {} }]),
    ...(picks.length ? ([{ key: 'copy-ds', label: `Copy ${picks.length === 1 ? 'frame' : picks.length + ' frames'} for claude.ai Design`, hint: 'Then Ctrl+V on its canvas', onSelect: () => copyFrames(picks) }] as MenuEntry[]) : []),
    'divider',
    { key: 'all', label: props.design.kind === 'slides' ? 'Deck as PDF' : 'All frames as PDF', hint: `${order.length} page${order.length === 1 ? '' : 's'}`, disabled: !order.length, onSelect: () => void exportAll() },
    ...(current ? (['divider', { key: 'handoff', label: 'Build it in code…', hint: 'A new chat in your project’s folder', onSelect: () => props.onHandoff(current.id, versionOf(current)) }] as MenuEntry[]) : [])
  ]

  const versionMenu =
    current && current.versions.length > 1 ? (
      <Menu
        className="version-menu"
        title="Version history"
        trigger={
          <span className="small">
            v{versionOf(current) + 1} <Icon name="chevronDown" size={12} />
          </span>
        }
        entries={current.versions
          .map((x, i) => ({
            key: String(i),
            label: `Version ${i + 1}${i === current.versions.length - 1 ? ' (latest)' : ''}`,
            hint: new Date(x.ts).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }),
            checked: i === versionOf(current),
            onSelect: () => props.onState({ id: current.id, version: i === current.versions.length - 1 ? null : i })
          }))
          .reverse()}
      />
    ) : null

  const commentBtn = (
    <button
      className={'btn small design-comment-btn' + (commenting ? ' on' : '')}
      disabled={!order.length}
      onClick={() => setCommenting(!commenting)}
      title={commenting ? 'Stop commenting (Esc)' : 'Click any part of a frame to tell Claude what to change'}
    >
      <Icon name="comment" size={15} />
      Comment
    </button>
  )
  const errorFrame = error && list.find((f) => f.key === error.key && f.artifact && frames.current.get(f.key)?.getAttribute('src') === error.src)
  const writingText = draft
    ? `${draft.updating ? 'Updating' : 'Writing'}${draft.title ? ` ${draft.title}` : ''}${draft.size > 1024 ? ` · ${(draft.size / 1024).toFixed(1)} KB` : ''}`
    : pending.length
      ? `Designing ${pending.length} frame${pending.length === 1 ? '' : 's'} at once…`
      : 'Claude is working…'

  const commentBox = pick && pickPos && (
    <div className={'design-comment' + (pickPos.above ? ' above' : '')} style={{ left: pickPos.left, top: pickPos.top }}>
      <div className="design-comment-target" title={pick.at.selector}>
        <span className="tag">{pick.at.tag}</span>
        <span className="design-comment-text">{pick.at.text || pick.at.selector}</span>
      </div>
      <textarea
        className="input"
        autoFocus
        rows={3}
        placeholder="What should change here?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closePick()
          } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            sendComment()
          }
        }}
      />
      <div className="row gap end">
        {props.busy && <span className="muted small grow">Claude is working; send when it’s done.</span>}
        <button className="btn ghost small" onClick={closePick}>
          Cancel
        </button>
        <button className="btn primary small" disabled={!comment.trim() || props.busy} onClick={sendComment}>
          Send
        </button>
      </div>
    </div>
  )

  return (
    <section
      ref={root}
      className={'design-canvas' + (presenting ? ' presenting' : '')}
      style={presenting ? undefined : { width: `calc(100% - ${chatWidth}px)` }}
    >
      {!presenting && (
        <div
          className="design-resizer"
          onMouseDown={startResize}
          onDoubleClick={() => {
            setChatWidth(CHAT_WIDTH.default)
            writePref('designChatWidth', String(CHAT_WIDTH.default))
          }}
          title="Drag to resize · double-click for the default width"
        />
      )}
      <div className="design-toolbar">
        {focus ? (
          <>
            <button className="btn small ghost design-back" onClick={closeFocus} title="Back to the board (Esc)">
              <Icon name="grid" size={15} /> Board
            </button>
            <button className="icon-btn" disabled={order.length < 2} onClick={() => step(-1)} title="Previous frame (←)">
              <Icon name="back" size={15} />
            </button>
            <span className="design-name" title={focus.title}>
              {focus.title}
            </span>
            <button className="icon-btn" disabled={order.length < 2} onClick={() => step(1)} title="Next frame (→)">
              <Icon name="forward" size={15} />
            </button>
            <span className="muted small design-count">
              {order.findIndex((f) => f.key === focus.key) + 1} / {order.length}
            </span>
          </>
        ) : (
          <span className={'design-name' + (selected || group.length ? '' : ' muted')} title={selected?.title}>
            {group.length
              ? `${group.length} frames selected`
              : selected
                ? selected.title
                : order.length
                  ? `${order.length} frame${order.length === 1 ? '' : 's'}`
                  : draft?.title || kind.label}
          </span>
        )}
        {versionMenu}
        <span className="grow" />
        {focus ? (
          <>
            {view === 'preview' && viewports.length > 1 && (
              <div className="seg-toggle design-viewports">
                {viewports.map((x) => (
                  <button
                    key={x.key}
                    className={x.key === vp.key ? 'on' : ''}
                    title={x.key === 'frame' ? x.label : `${x.label} · ${x.width}px`}
                    onClick={() => {
                      setViewportKey(x.key)
                      writePref('design.viewport.' + sid, x.key)
                    }}
                  >
                    <Icon name={x.icon} size={15} />
                  </button>
                ))}
              </div>
            )}
            {view === 'preview' && (
              <Menu
                className="design-zoom"
                align="right"
                title="Zoom"
                trigger={<span className="small">{zoom ? `${Math.round(zoom * 100)}%` : `Fit · ${Math.round(scale * 100)}%`}</span>}
                entries={FOCUS_ZOOMS.map((z) => ({ key: String(z.value), label: z.label, checked: zoom === z.value, onSelect: () => setZoom(z.value) }))}
              />
            )}
            {view === 'preview' && commentBtn}
            {focus.artifact && focus.artifact.type !== 'code' && focus.artifact.type !== 'markdown' && (
              <div className="seg-toggle">
                <button className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}>
                  Preview
                </button>
                <button className={view === 'code' ? 'on' : ''} onClick={() => setView('code')}>
                  Code
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {list.length > 0 && (
              <div className="seg-toggle design-tools" role="group" aria-label="Tool">
                <button className={hand ? '' : 'on'} title="Select: drag to select frames" onClick={() => setHand(false)}>
                  <Icon name="cursor" size={15} />
                </button>
                <button className={hand ? 'on' : ''} title="Hand: drag to move around (or hold Space)" onClick={() => setHand(true)}>
                  <Icon name="hand" size={15} />
                </button>
              </div>
            )}
            {list.length > 0 && (
              <Menu
                className="design-zoom"
                align="right"
                title="Zoom (Ctrl+scroll or pinch)"
                trigger={<span className="small">{Math.round(cam.z * 100)}%</span>}
                entries={[
                  { key: 'fit', label: 'Zoom to fit', hint: 'Shift+1', onSelect: fit },
                  { key: 'in', label: 'Zoom in', hint: 'Ctrl +', onSelect: () => zoomAt(cam.z * 1.25) },
                  { key: 'out', label: 'Zoom out', hint: 'Ctrl −', onSelect: () => zoomAt(cam.z / 1.25) },
                  'divider',
                  ...[0.25, 0.5, 1].map((z) => ({ key: String(z), label: `${z * 100}%`, onSelect: () => zoomAt(z) }))
                ]}
              />
            )}
            {commentBtn}
          </>
        )}
        <button
          className={'icon-btn design-present' + (presenting ? ' on' : '')}
          disabled={!order.length}
          title={presenting ? 'Stop presenting (Esc)' : 'Present: one frame at a time, ← → to move'}
          onClick={() => {
            if (presenting) return closeFocus()
            open(focus?.key ?? selected?.id ?? order[0].key)
            setPresenting(true)
          }}
        >
          <Icon name="play" size={15} />
        </button>
        {order.length > 0 && <Menu className="design-export" align="right" title="Export" trigger={<Icon name="download" size={16} />} entries={exportMenu} />}
      </div>
      {notice && (
        <div className={'design-notice' + (notice.error ? ' error' : '')} role="status">
          <span>{notice.text}</span>
          {notice.path && (
            <button className="link-btn" onClick={() => void api.revealFile(notice.path!)}>
              Show in folder
            </button>
          )}
        </div>
      )}
      {errorFrame && error && (
        <PreviewError
          text={`${errorFrame.title}: ${error.text}`}
          busy={props.busy}
          onFix={() => {
            props.onFix(errorFrame.title, error.text)
            setError(null)
          }}
          onDismiss={() => setError(null)}
        />
      )}
      {commenting && !pick && <div className="design-hint">Click any part of a frame to comment on it · Esc to stop</div>}

      {focus && fa ? (
        view === 'code' ? (
          <div className="design-stage artifact-code">
            <Markdown text={fenced(liveFor(fa.id) ?? fa.versions[versionOf(fa)].content, artifactLang(fa))} />
          </div>
        ) : (
          <div ref={stage} className={'design-stage' + (commenting ? ' commenting' : '')}>
            {stageSize.w > 0 && (
              <div className={'design-frame' + (vp.height ? ' device' : '')} style={{ width: vp.width * scale, height: frameH * scale }}>
                {/* No allow-same-origin: the page gets an opaque origin and can't reach the app, its storage or your files. */}
                <iframe
                  key={srcOf(fa)}
                  ref={frameRef(fa.id)}
                  src={srcOf(fa)}
                  title={fa.title}
                  sandbox="allow-scripts allow-popups allow-forms allow-modals"
                  style={{ width: vp.width, height: frameH, transform: `scale(${scale})` }}
                  onLoad={(e) => {
                    loaded.current.set(fa.id, srcOf(fa))
                    bump((n) => n + 1)
                    e.currentTarget.contentWindow?.postMessage({ __lcDesign: 'comment', on: commenting }, '*')
                  }}
                />
                {liveFor(fa.id) != null && <DraftFrame html={liveFor(fa.id)!} width={vp.width} height={frameH} scale={scale} />}
              </div>
            )}
            {commentBox}
          </div>
        )
      ) : list.length ? (
        <div
          ref={stage}
          className={'design-stage design-board' + (commenting ? ' commenting' : '') + (hand || spaceDown ? ' hand' : '')}
          style={{ backgroundPosition: `${cam.x}px ${cam.y}px` }}
          onMouseDown={startDrag}
          onDoubleClick={(e) => {
            const key = (e.target as HTMLElement).closest<HTMLElement>('[data-frame]')?.dataset.frame
            if (key) open(key)
          }}
        >
          {/* --z: outlines and borders stay the same width on screen at any zoom */}
          <div className="board-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`, ['--z' as string]: cam.z }}>
            {list.map((f) => {
              const live = liveFor(f.key)
              return (
                <div
                  key={f.key}
                  data-frame={f.key}
                  className={'board-frame' + (f.artifact && picks.includes(f.key) ? ' selected' : '') + (f.pending ? ' pending' : '')}
                  style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
                >
                  {f.artifact && (
                    <iframe
                      key={srcOf(f.artifact)}
                      ref={frameRef(f.key)}
                      src={srcOf(f.artifact)}
                      title={f.title}
                      sandbox="allow-scripts allow-popups allow-forms allow-modals"
                      style={{ width: f.w, height: f.h }}
                      onLoad={(e) => {
                        loaded.current.set(f.key, srcOf(f.artifact!))
                        bump((n) => n + 1)
                        e.currentTarget.contentWindow?.postMessage({ __lcDesign: 'comment', on: commenting }, '*')
                      }}
                    />
                  )}
                  {live != null && <DraftFrame html={live} width={f.w} height={f.h} />}
                  {f.pending && (
                    <div className="board-pending">
                      <Spark size={Math.round(Math.min(f.w, f.h) / 8)} animate />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {/* section headings and frame labels stay readable at any zoom */}
          {sections.map((s) => (
            <div key={'s:' + s.section} className="board-section" style={{ left: cam.x + s.x * cam.z, top: cam.y + s.y * cam.z - 48 }}>
              {s.section}
            </div>
          ))}
          {list.map((f) => (
            <div key={'l:' + f.key} className={'board-label' + (f.artifact && picks.includes(f.key) ? ' selected' : '')} style={{ left: cam.x + f.x * cam.z, top: cam.y + f.y * cam.z - 24, width: Math.max(60, f.w * cam.z) }}>
              <span className="board-label-text" title={f.title}>
                {f.pending ? `Designing ${f.title}…` : f.title}
              </span>
              {f.artifact && (
                <>
                  <button className="icon-btn" title="Open" onClick={() => open(f.key)}>
                    <Icon name="expand" size={12} />
                  </button>
                  <button className="icon-btn" title="Download as PNG" onClick={() => void exportFrame(f.artifact!, 'png')}>
                    <Icon name="download" size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
          {box && <div className="board-marquee" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
          {commentBox}
        </div>
      ) : (
        <div className="design-stage design-empty">
          <Spark size={40} animate={props.busy} className="welcome-spark" />
          <p>{props.busy ? 'Claude is designing…' : 'Your design will appear here.'}</p>
          {!props.busy && <p className="muted small">Describe what you want in the chat, and say what to change as it takes shape.</p>}
        </div>
      )}
      {props.busy && (list.length > 0 || draft) && (
        <div className="design-writing" role="status">
          <Spark size={14} animate />
          {writingText}
        </div>
      )}
    </section>
  )
}
