import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Artifact, ArtifactType } from '../../shared/types'
import { ARTIFACT_LABEL, artifactLang, fenced } from '../../shared/format'
import { api } from '../api'
import { Icon } from './Icon'
import { Markdown } from './Markdown'
import { Menu } from './Menu'
import { artifactUrl } from '../vscode/urls'

export function artifactIcon(type: ArtifactType): string {
  return type === 'markdown' ? 'file' : type === 'code' ? 'terminal' : type === 'svg' || type === 'mermaid' ? 'sparkle' : 'globe'
}

/** Types rendered in the sandboxed frame (they can run scripts). */
export const FRAMED: ArtifactType[] = ['html', 'react', 'svg', 'mermaid']

export interface PanelState {
  id: string | null
  /** version index; null = latest */
  version: number | null
}

/** The first error the page in this preview frame reported (pages report them, see renderArtifactPage). */
export function usePreviewError(frame: RefObject<HTMLIFrameElement | null>) {
  const [error, setError] = useState<{ src: string; text: string } | null>(null)
  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const f = frame.current
      if (!f || e.source !== f.contentWindow || typeof e.data?.__lcArtifactError !== 'string') return
      const src = f.getAttribute('src') ?? ''
      // the page's internal address means nothing to Claude: "page:line:column" is enough
      const text = String(e.data.__lcArtifactError).replace(/(?:artifact:\/\/view|https?:\/\/127\.0\.0\.1:\d+\/[0-9a-f]+\/artifact)\/\S*?(:\d+:\d+)/g, 'page$1')
      setError((cur) => (cur?.src === src ? cur : { src, text }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frame])
  return [error, setError] as const
}

/** The bar above a preview that hit an error, with "Fix with Claude". */
export function PreviewError(props: { text: string; busy?: boolean; onFix?: () => void; onDismiss: () => void }) {
  return (
    <div className="artifact-error" role="alert">
      <div className="artifact-error-text">
        <b>This artifact ran into an error</b>
        <pre>{props.text}</pre>
      </div>
      {props.onFix && (
        <button className="btn primary small" disabled={props.busy} title={props.busy ? 'Claude is busy' : 'Ask Claude to fix it'} onClick={props.onFix}>
          Fix with Claude
        </button>
      )}
      <button className="icon-btn" title="Dismiss" onClick={props.onDismiss}>
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

/** Side panel showing one artifact (or the list of this chat's artifacts), like the Claude app. */
export function ArtifactPanel(props: {
  sessionId: string
  artifacts: Artifact[]
  state: PanelState
  onState: (s: PanelState) => void
  onClose: () => void
  /** ask Claude to fix an error the preview hit */
  onFix?: (title: string, error: string) => void
  /** Claude is replying (fixing has to wait) */
  busy?: boolean
}) {
  const a = props.artifacts.find((x) => x.id === props.state.id)
  const [view, setView] = useState<'preview' | 'code'>('preview')
  const [copied, setCopied] = useState(false)
  useEffect(() => setView(a?.type === 'code' ? 'code' : 'preview'), [a?.id, a?.type])
  const frame = useRef<HTMLIFrameElement>(null)
  const [error, setError] = usePreviewError(frame)

  if (!a) {
    return (
      <aside className="artifact-panel">
        <div className="artifact-head">
          <span className="artifact-title">Artifacts</span>
          <span className="grow" />
          <button className="icon-btn" onClick={props.onClose} title="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="artifact-list">
          {props.artifacts.length === 0 && (
            <div className="muted small pad">
              No artifacts in this chat yet. Ask Claude for a web page, an app, a diagram or a document and it will appear here.
            </div>
          )}
          {[...props.artifacts]
            .sort((x, y) => y.updatedAt - x.updatedAt)
            .map((x) => (
              <button key={x.id} className="artifact-card" onClick={() => props.onState({ id: x.id, version: null })}>
                <span className="artifact-card-icon">
                  <Icon name={artifactIcon(x.type)} size={18} />
                </span>
                <span className="artifact-card-text">
                  <span className="artifact-card-title">{x.title}</span>
                  <span className="muted small">
                    {ARTIFACT_LABEL[x.type]}
                    {x.versions.length > 1 ? ` · ${x.versions.length} versions` : ''}
                  </span>
                </span>
              </button>
            ))}
        </div>
      </aside>
    )
  }

  const vi = props.state.version ?? a.versions.length - 1
  const v = a.versions[Math.min(vi, a.versions.length - 1)]
  const framed = FRAMED.includes(a.type)
  const src = artifactUrl(props.sessionId, a.id, vi, v.ts)
  const pageError = error?.src === src ? error.text : null

  return (
    <aside className="artifact-panel">
      <div className="artifact-head">
        <button className="icon-btn" onClick={() => props.onState({ id: null, version: null })} title="All artifacts">
          <Icon name="back" size={16} />
        </button>
        <span className="artifact-title" title={a.title}>
          {a.title}
        </span>
        {a.versions.length > 1 && (
          <Menu
            className="version-menu"
            align="right"
            title="Version history"
            trigger={
              <span className="small">
                v{vi + 1} <Icon name="chevronDown" size={12} />
              </span>
            }
            entries={a.versions
              .map((x, i) => ({
                key: String(i),
                label: `Version ${i + 1}${i === a.versions.length - 1 ? ' (latest)' : ''}`,
                hint: new Date(x.ts).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }),
                checked: i === vi,
                onSelect: () => props.onState({ id: a.id, version: i === a.versions.length - 1 ? null : i })
              }))
              .reverse()}
          />
        )}
        {a.type !== 'code' && (
          <div className="seg-toggle">
            <button className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}>
              Preview
            </button>
            <button className={view === 'code' ? 'on' : ''} onClick={() => setView('code')}>
              Code
            </button>
          </div>
        )}
        <button
          className="icon-btn"
          title="Copy"
          onClick={() => {
            void navigator.clipboard.writeText(v.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </button>
        {framed && (
          <button className="icon-btn" title="Open in your browser" onClick={() => void api.openArtifactInBrowser(props.sessionId, a.id, vi)}>
            <Icon name="globe" size={16} />
          </button>
        )}
        <button className="icon-btn" title="Download" onClick={() => void api.saveArtifact(props.sessionId, a.id, vi)}>
          <Icon name="arrowDown" size={16} />
        </button>
        <button className="icon-btn" onClick={props.onClose} title="Close">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="artifact-body">
        {view === 'code' ? (
          <div className="artifact-code">
            <Markdown text={fenced(v.content, artifactLang(a))} />
          </div>
        ) : framed ? (
          <>
            {pageError && (
              <PreviewError
                text={pageError}
                busy={props.busy}
                onFix={
                  props.onFix &&
                  (() => {
                    props.onFix!(a.title, pageError)
                    setError(null)
                  })
                }
                onDismiss={() => setError(null)}
              />
            )}
            {/* No allow-same-origin: the page gets an opaque origin and can't reach the app, its storage or your files. */}
            <iframe key={src} ref={frame} className="artifact-frame" src={src} sandbox="allow-scripts allow-popups allow-forms allow-modals" title={a.title} />
          </>
        ) : (
          <div className="artifact-doc">
            <Markdown text={v.content} />
          </div>
        )}
      </div>
    </aside>
  )
}
