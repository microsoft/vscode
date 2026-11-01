// The Design page, like Claude Design: start a prototype, slide deck, wireframe or one-pager by
// describing it, and find every design you've made. Each design is a chat with its own canvas.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DESIGN_KINDS, designKind } from '../../shared/design'
import type { AppSettings, Attachment, DesignInfo, DesignKind, PermissionModeUI, ProjectArtifactRef, SessionMeta } from '../../shared/types'
import { api } from '../api'
import { FRAMED } from './ArtifactPanel'
import { EFFORTS, MODEL_ALIASES, MODES, fileToAttachment, prettyModel } from './ChatView'
import { Icon } from './Icon'
import { Menu } from './Menu'
import { TitleBar, ago } from './Projects'
import { artifactUrl } from '../vscode/urls'

/** height of a design's preview on its card */
const THUMB_HEIGHT = 168

const folderName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

/** A live, scaled-down preview of a design (it can't be clicked or focused). */
function Thumb({ src, width }: { src: string; width: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = w / width
  return (
    <div className="design-thumb" ref={box}>
      {w > 0 && (
        <iframe
          src={src}
          title=""
          aria-hidden
          tabIndex={-1}
          loading="lazy"
          sandbox="allow-scripts"
          style={{ width, height: THUMB_HEIGHT / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  )
}

export interface NewDesign {
  text: string
  attachments: Attachment[]
  design: DesignInfo
  /** the folder whose style to match */
  cwd?: string
  /** the design chat's model ('' = Claude Code's default) and permission mode */
  model: string
  permissionMode: PermissionModeUI
}

export function DesignsView(props: {
  headerLeft: ReactNode
  sessions: SessionMeta[]
  onOpen: (id: string) => void
  onCreate: (d: NewDesign) => Promise<unknown>
  onPin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  settings: AppSettings
  onSettings: (patch: Partial<AppSettings>) => void
}) {
  const [kind, setKind] = useState<DesignKind>('prototype')
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [folder, setFolder] = useState('')
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  const [refs, setRefs] = useState<ProjectArtifactRef[]>([])
  const [dragOver, setDragOver] = useState(false)
  // the new design's chat starts with these; they can be changed there later
  const [model, setModel] = useState(props.settings.defaultModel)
  const [mode, setMode] = useState<PermissionModeUI>(props.settings.defaultPermissionMode)
  const [models, setModels] = useState(MODEL_ALIASES)
  useEffect(() => {
    void api.listModels().then((m) => {
      if (m.length) setModels([MODEL_ALIASES[0], ...m.filter((x) => x.value && x.value !== 'default')])
    })
  }, [])
  const ta = useRef<HTMLTextAreaElement>(null)
  const info = designKind(kind)

  const designs = useMemo(
    () => props.sessions.filter((s) => s.design).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt),
    [props.sessions]
  )
  // each design's preview: the page Claude changed last
  const changed = designs.map((d) => d.updatedAt + ':' + (d.artifactCount ?? 0)).join()
  useEffect(() => void api.allArtifacts().then(setRefs), [changed])
  const preview = useMemo(() => {
    const m = new Map<string, ProjectArtifactRef>()
    for (const r of refs) if (FRAMED.includes(r.type) && !m.has(r.sessionId)) m.set(r.sessionId, r)
    return m
  }, [refs])
  const q = filter.trim().toLowerCase()
  const shown = designs.filter((d) => !q || d.title.toLowerCase().includes(q))

  useEffect(() => ta.current?.focus(), [kind])

  const addPaths = async (paths: string[]): Promise<void> => {
    const imgs = await api.readImages(paths)
    const imgNames = new Set(imgs.map((i) => i.name))
    const others = paths.filter((p) => !imgNames.has(p.split(/[\\/]/).pop() ?? ''))
    if (imgs.length) setAttachments((a) => [...a, ...imgs])
    if (others.length) setText((t) => (t ? t + ' ' : '') + others.map((p) => (p.includes(' ') ? `@"${p}"` : `@${p}`)).join(' ') + ' ')
    ta.current?.focus()
  }

  const create = (): void => {
    const t = text.trim()
    if (!t || creating) return
    setCreating(true)
    // on success the new design opens in place of this page
    props.onCreate({ text: t, attachments, design: { kind, matchStyle: !!folder }, cwd: folder || undefined, model, permissionMode: mode }).catch(() => setCreating(false))
  }

  const modelLabel = models.find((m) => m.value === model)?.displayName ?? prettyModel(model)
  const effortLabel = EFFORTS.find((e) => e.value === props.settings.effort && e.value)?.label
  const modeInfo = MODES.find((m) => m.value === mode) ?? MODES[0]

  return (
    <div className="page">
      <TitleBar left={props.headerLeft} />
      <div className="page-scroll">
        <div className="page-inner design-page">
          <div className="page-head">
            <h1>Design</h1>
            {designs.length > 0 && <span className="muted">{designs.length}</span>}
          </div>
          <p className="muted design-intro">Describe a prototype, deck or page, and Claude designs it on a canvas. Click any part of it to ask for changes, then export it or build it in code.</p>

          <div
            className={'design-start' + (dragOver ? ' drag' : '')}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              void api.droppedPaths(e.dataTransfer).then((paths) => {
              if (paths.length) void addPaths(paths)
            })
            }}
          >
            <div className="design-kinds" role="radiogroup" aria-label="What to design">
              {DESIGN_KINDS.map((k) => (
                <button key={k.value} role="radio" aria-checked={kind === k.value} className={'design-kind' + (kind === k.value ? ' on' : '')} onClick={() => setKind(k.value)}>
                  <Icon name={k.icon} size={18} />
                  <span className="design-kind-label">{k.label}</span>
                  <span className="design-kind-hint">{k.hint}</span>
                </button>
              ))}
            </div>
            <textarea
              ref={ta}
              className="design-prompt"
              rows={3}
              placeholder={info.placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={async (e) => {
                const files = Array.from(e.clipboardData.files)
                if (!files.length) return
                e.preventDefault()
                const atts = (await Promise.all(files.map(fileToAttachment))).filter(Boolean) as Attachment[]
                setAttachments((a) => [...a, ...atts])
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  create()
                }
              }}
            />
            {attachments.length > 0 && (
              <div className="attachments">
                {attachments.map((a, i) => (
                  <div key={i} className="thumb">
                    <img src={`data:${a.mediaType};base64,${a.base64}`} alt={a.name} />
                    <button className="chip-x" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="design-start-foot">
              <button
                className="icon-btn"
                title="Add images or files for reference (screenshots, sketches, a brief)"
                onClick={async () => {
                  const paths = await api.pickFiles()
                  if (paths.length) void addPaths(paths)
                }}
              >
                <Icon name="plus" size={18} />
              </button>
              {folder ? (
                <span className="design-folder-chip" title={`Claude reads the code in ${folder} and uses its colors, fonts and components`}>
                  <Icon name="folder" size={14} />
                  Match {folderName(folder)}
                  <button className="chip-x" title="Don’t match a codebase" onClick={() => setFolder('')}>
                    ×
                  </button>
                </span>
              ) : (
                <button
                  className="btn ghost small"
                  title="Claude reads the code in a folder and uses its colors, fonts and components"
                  onClick={async () => {
                    const d = await api.pickFolder('Folder of the product to match')
                    if (d) setFolder(d)
                  }}
                >
                  <Icon name="folder" size={14} /> Match a codebase’s style…
                </button>
              )}
              <span className="grow" />
              <Menu
                className="below-menu design-model"
                align="right"
                title="Model and effort"
                trigger={
                  <>
                    <span className="model-name">{modelLabel}</span>
                    {effortLabel && <span className="muted">{effortLabel}</span>}
                  </>
                }
                entries={[
                  { section: 'Model' },
                  ...models.map((m) => ({ key: 'm:' + m.value, label: m.displayName, hint: m.description, checked: model === m.value, onSelect: () => setModel(m.value) })),
                  'divider',
                  { section: 'Effort' },
                  ...EFFORTS.map((e) => ({ key: 'e:' + e.value, label: e.label, checked: props.settings.effort === e.value, onSelect: () => props.onSettings({ effort: e.value }) }))
                ]}
              />
              <Menu
                className={'below-menu design-mode mode-' + mode}
                align="right"
                title={modeInfo.hint}
                trigger={<span>{modeInfo.short}</span>}
                entries={MODES.map((m) => ({
                  key: m.value,
                  label: m.label,
                  hint: m.hint,
                  checked: mode === m.value,
                  danger: m.value === 'bypassPermissions',
                  onSelect: () => {
                    if (m.value === 'bypassPermissions' && !confirm('Full access lets Claude edit, delete and run anything on this machine without asking. Continue?')) return
                    setMode(m.value)
                  }
                }))}
              />
              <button className="btn primary" disabled={!text.trim() || creating} onClick={create}>
                Create {info.label.toLowerCase()}
              </button>
            </div>
          </div>
          <div className="design-examples">
            <span className="muted small">Try</span>
            {info.examples.map((ex) => (
              <button
                key={ex}
                className="kind-chip"
                onClick={() => {
                  setText(ex)
                  ta.current?.focus()
                }}
              >
                {ex}
              </button>
            ))}
          </div>

          {designs.length > 0 && (
            <>
              <div className="row gap design-list-head">
                <h2>Your designs</h2>
                <span className="grow" />
                <div className="side-search page-search">
                  <Icon name="search" size={15} />
                  <input placeholder="Search designs…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                </div>
              </div>
              <div className="design-grid">
                {shown.map((s) => {
                  const k = designKind(s.design?.kind)
                  const p = preview.get(s.id)
                  return (
                    <div
                      key={s.id}
                      className="design-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => props.onOpen(s.id)}
                      onKeyDown={(e) => e.key === 'Enter' && props.onOpen(s.id)}
                    >
                      {p ? (
                        <Thumb src={artifactUrl(s.id, p.id, p.versions - 1, p.updatedAt)} width={k.viewports[0].width} />
                      ) : (
                        <div className="design-thumb empty">
                          <Icon name={k.icon} size={26} />
                        </div>
                      )}
                      <div className="design-card-info">
                        <div className="design-card-title">
                          <span className="design-card-name" title={s.title}>
                            {s.title}
                          </span>
                          {s.pinned && <Icon name="pin" size={13} className="muted" />}
                          <div className="more" onClick={(e) => e.stopPropagation()}>
                            <Menu
                              className="card-menu"
                              align="right"
                              title="Design options"
                              trigger={<span className="more-dots">⋯</span>}
                              entries={[
                                { key: 'open', label: 'Open', onSelect: () => props.onOpen(s.id) },
                                { key: 'pin', label: s.pinned ? 'Unpin' : 'Pin to the sidebar', onSelect: () => props.onPin(s.id, !s.pinned) },
                                'divider',
                                {
                                  key: 'delete',
                                  label: 'Delete',
                                  danger: true,
                                  onSelect: () => confirm(`Delete "${s.title}"? This removes the design and its chat from LocalClaude.`) && props.onDelete(s.id)
                                }
                              ]}
                            />
                          </div>
                        </div>
                        <span className="muted small">
                          {k.label} · {ago(s.updatedAt)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {!shown.length && <div className="empty-projects muted">No designs match.</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
