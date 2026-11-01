// Every artifact from every chat in one place, like the Claude app's Artifacts page.
import { useEffect, useState, type ReactNode } from 'react'
import { ARTIFACT_LABEL } from '../../shared/format'
import type { ArtifactType, Project, ProjectArtifactRef } from '../../shared/types'
import { api } from '../api'
import { artifactIcon } from './ArtifactPanel'
import { Icon } from './Icon'
import { TitleBar, ago } from './Projects'

const KINDS: { key: string; label: string; types: ArtifactType[] }[] = [
  { key: 'all', label: 'All', types: [] },
  { key: 'pages', label: 'Web pages', types: ['html'] },
  { key: 'apps', label: 'Apps', types: ['react'] },
  { key: 'diagrams', label: 'Diagrams', types: ['svg', 'mermaid'] },
  { key: 'docs', label: 'Documents', types: ['markdown'] },
  { key: 'code', label: 'Code', types: ['code'] }
]

export function ArtifactsView(props: { headerLeft: ReactNode; projects: Project[]; onOpen: (sessionId: string, artifactId: string) => void }) {
  const [items, setItems] = useState<ProjectArtifactRef[] | null>(null)
  const [filter, setFilter] = useState('')
  const [kind, setKind] = useState('all')
  useEffect(() => void api.allArtifacts().then(setItems), [])
  const types = KINDS.find((k) => k.key === kind)?.types ?? []
  const q = filter.trim().toLowerCase()
  const shown = (items ?? []).filter((a) => (!types.length || types.includes(a.type)) && (!q || (a.title + ' ' + a.chatTitle).toLowerCase().includes(q)))
  const projectName = (id?: string): string | undefined => props.projects.find((p) => p.id === id)?.name

  return (
    <div className="page">
      <TitleBar left={props.headerLeft} />
      <div className="page-scroll">
        <div className="page-inner">
          <div className="page-head">
            <h1>Artifacts</h1>
            {items && <span className="muted">{items.length}</span>}
          </div>
          {items && items.length > 0 && (
            <>
              <div className="side-search page-search">
                <Icon name="search" size={15} />
                <input placeholder="Search artifacts…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <div className="kind-chips">
                {KINDS.map((k) => (
                  <button key={k.key} className={'kind-chip' + (kind === k.key ? ' on' : '')} onClick={() => setKind(k.key)}>
                    {k.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="project-grid artifact-grid">
            {shown.map((a) => (
              <div
                key={a.sessionId + '/' + a.id}
                className="project-card artifact-tile"
                role="button"
                tabIndex={0}
                onClick={() => props.onOpen(a.sessionId, a.id)}
                onKeyDown={(e) => e.key === 'Enter' && props.onOpen(a.sessionId, a.id)}
              >
                <div className="project-card-top">
                  <span className="artifact-card-icon">
                    <Icon name={artifactIcon(a.type)} size={17} />
                  </span>
                  <span className="project-card-name">{a.title}</span>
                </div>
                <span className="muted small">
                  {ARTIFACT_LABEL[a.type]}
                  {a.versions > 1 ? ` · v${a.versions}` : ''} · updated {ago(a.updatedAt)}
                </span>
                <span className="muted small artifact-tile-chat" title={a.chatTitle}>
                  {projectName(a.projectId) ? `${projectName(a.projectId)} / ` : ''}
                  {a.chatTitle}
                </span>
              </div>
            ))}
          </div>
          {items && !items.length && (
            <div className="empty-projects muted">Pages, apps, diagrams and documents Claude makes in your chats appear here.</div>
          )}
          {items && items.length > 0 && !shown.length && <div className="empty-projects muted">No artifacts match.</div>}
        </div>
      </div>
    </div>
  )
}
