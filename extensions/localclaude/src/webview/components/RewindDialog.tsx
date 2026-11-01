import { useEffect, useState } from 'react'
import type { ChatMessage, RewindPreview } from '../../shared/types'
import { api } from '../api'

const textOf = (m: ChatMessage): string => m.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')

/**
 * Claude Code's /rewind: pick a message, then restore the code, the conversation, or both
 * to how they were just before it.
 */
export function RewindDialog(props: {
  sessionId: string
  history: ChatMessage[]
  messageId: string | null
  onClose: () => void
  onRestored: (text: string | undefined) => void
}) {
  const candidates = props.history.filter((m) => m.role === 'user' && (m.uuid || m.forkAt)).reverse()
  const [picked, setPicked] = useState<string | null>(props.messageId)
  const [preview, setPreview] = useState<RewindPreview | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const msg = props.history.find((m) => m.id === picked)

  useEffect(() => {
    setPreview(null)
    setError(null)
    if (!msg) return
    if (!msg.uuid) {
      setPreview({ canRewind: false, error: 'Sent before checkpoints were turned on.' })
      return
    }
    let live = true
    void api.rewindPreview(props.sessionId, msg.id).then((p) => live && setPreview(p))
    return () => {
      live = false
    }
  }, [msg, props.sessionId])

  const files = preview?.canRewind ? (preview.filesChanged?.length ?? 0) : 0
  const canCode = files > 0
  const canConvo = !!msg?.forkAt
  const options: { key: string; label: string; hint: string; code: boolean; conversation: boolean }[] = []
  if (canCode && canConvo)
    options.push({ key: 'both', label: 'Restore code and conversation', hint: 'Undo file changes and forget everything from this message on', code: true, conversation: true })
  if (canConvo) options.push({ key: 'convo', label: 'Restore conversation', hint: 'Forget messages from here on; files stay as they are', code: false, conversation: true })
  if (canCode) options.push({ key: 'code', label: 'Restore code', hint: 'Undo file changes; keep the conversation', code: true, conversation: false })

  const run = async (o: (typeof options)[number]): Promise<void> => {
    if (!msg) return
    setWorking(true)
    setError(null)
    const r = await api.rewind(props.sessionId, { messageId: msg.id, code: o.code, conversation: o.conversation })
    setWorking(false)
    if (!r.ok) return setError(r.error ?? 'Rewind failed.')
    props.onRestored(o.conversation ? r.text : undefined)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (picked && !props.messageId) setPicked(null)
        else props.onClose()
        return
      }
      const n = picked ? options.length : candidates.length
      if (!n) return
      if (e.key === 'ArrowDown') setSel((s) => (s + 1) % n)
      else if (e.key === 'ArrowUp') setSel((s) => (s + n - 1) % n)
      else if (e.key === 'Enter') {
        e.preventDefault()
        if (!picked) {
          setPicked(candidates[sel % n].id)
          setSel(0)
        } else if (!working && preview) void run(options[sel % n])
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="rewind-card">
        <div className="pop-title">↶ Rewind</div>
        {!picked ? (
          <>
            <div className="muted small">Restore the code and/or conversation to the point before…</div>
            <div className="rewind-list">
              {candidates.length === 0 && <div className="muted small">No messages to rewind to yet.</div>}
              {candidates.map((m, i) => (
                <button
                  key={m.id}
                  className={'rewind-item' + (i === sel ? ' active' : '')}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => {
                    setPicked(m.id)
                    setSel(0)
                  }}
                >
                  <span className="prompt-mark">›</span>
                  <span className="rewind-text">{textOf(m).trim() || '(image)'}</span>
                  <span className="muted small">{new Date(m.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="rewind-quote">
              <span className="prompt-mark">›</span> {msg ? textOf(msg).trim().slice(0, 300) || '(image)' : ''}
            </div>
            <div className="small">
              {!preview ? (
                <span className="muted">Checking file changes…</span>
              ) : files > 0 ? (
                <span>
                  {files} file{files === 1 ? '' : 's'} changed since then{' '}
                  <span className="ok-text">+{preview.insertions ?? 0}</span> <span className="danger-text">-{preview.deletions ?? 0}</span>
                </span>
              ) : (
                <span className="muted">No file changes to restore{preview.error && !/no.*change/i.test(preview.error) ? ` (${preview.error})` : ''}.</span>
              )}
            </div>
            {preview && files > 0 && (
              <ul className="rewind-files mono small">
                {preview.filesChanged!.slice(0, 8).map((f) => (
                  <li key={f}>{f}</li>
                ))}
                {files > 8 && <li className="muted">…and {files - 8} more</li>}
              </ul>
            )}
            <div className="rewind-options">
              {preview &&
                options.map((o, i) => (
                  <button key={o.key} className={'option' + (i === sel ? ' selected' : '')} disabled={working} onMouseEnter={() => setSel(i)} onClick={() => void run(o)}>
                    <span className="option-label">
                      {i + 1}. {o.label}
                    </span>
                    <span className="muted small">{o.hint}</span>
                  </button>
                ))}
              {preview && !options.length && <div className="muted small">Nothing can be restored for this message.</div>}
            </div>
            {error && <div className="notice error">{error}</div>}
            <div className="row gap end">
              {!props.messageId && (
                <button className="btn ghost" onClick={() => setPicked(null)}>
                  Back
                </button>
              )}
              <button className="btn" onClick={props.onClose}>
                Never mind
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
