import { useState } from 'react'
import type { MemoryItem, Project } from '../../shared/types'
import { api } from '../api'
import { Icon } from './Icon'

const when = (ts: number): string => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * View and edit memory: global (projectId null) or one project's.
 * Changes go straight to storage; idle chats pick them up on their next message.
 */
export function MemoryList(props: {
  items: MemoryItem[]
  projectId: string | null
  enabled: boolean
  onChange: (items: MemoryItem[], project?: Project) => void
  onEnable?: () => void
  compact?: boolean
}) {
  const [adding, setAdding] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const apply = (r: { items: MemoryItem[]; project?: Project }): void => props.onChange(r.items, r.project)

  const add = async (): Promise<void> => {
    if (!adding.trim()) return
    apply(await api.addMemory(props.projectId, adding.trim()))
    setAdding('')
  }

  return (
    <div className={'memory' + (props.compact ? ' compact' : '')}>
      {!props.enabled && (
        <div className="notice small">
          Memory is off, so Claude doesn’t see or save these.{' '}
          {props.onEnable && (
            <button className="link-btn" onClick={props.onEnable}>
              Turn it on
            </button>
          )}
        </div>
      )}
      {props.items.length === 0 ? (
        <div className="muted small">
          {props.projectId
            ? 'Nothing yet. Claude saves useful facts about this project as you chat, or add one yourself.'
            : 'Nothing yet. Claude saves your preferences and other useful facts as you chat, or add one yourself.'}
        </div>
      ) : (
        <ul className="memory-list">
          {props.items.map((m) => (
            <li key={m.id}>
              {editing?.id === m.id ? (
                <input
                  className="input"
                  autoFocus
                  value={editing.text}
                  onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                  onBlur={async () => {
                    if (editing.text.trim() && editing.text.trim() !== m.text) apply(await api.editMemory(props.projectId, m.id, editing.text))
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <>
                  <span className="memory-text">{m.text}</span>
                  <span className="memory-meta">
                    {m.source === 'claude' ? 'Saved by Claude' : 'Added by you'} · {when(m.updatedAt ?? m.createdAt)}
                  </span>
                  <span className="memory-actions">
                    <button className="icon-btn" title="Edit" onClick={() => setEditing({ id: m.id, text: m.text })}>
                      <Icon name="edit" size={13} />
                    </button>
                    <button className="icon-btn" title="Forget" onClick={async () => apply(await api.removeMemory(props.projectId, m.id))}>
                      <Icon name="x" size={13} />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="memory-add">
        <input
          className="input"
          placeholder={props.projectId ? 'Add something for Claude to remember in this project…' : 'Add something for Claude to remember…'}
          value={adding}
          maxLength={500}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <button className="btn" disabled={!adding.trim()} onClick={() => void add()}>
          Add
        </button>
      </div>
      {props.items.length > 1 && (
        <button
          className="link-btn danger-text memory-clear"
          onClick={async () => confirm(`Forget all ${props.items.length} memories${props.projectId ? ' in this project' : ''}?`) && apply(await api.clearMemory(props.projectId))}
        >
          Forget everything
        </button>
      )}
    </div>
  )
}
