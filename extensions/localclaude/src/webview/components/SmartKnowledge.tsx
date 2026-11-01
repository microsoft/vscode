// Settings for Claude-powered knowledge search (see src/host/smartKnowledge.ts).
import { useEffect, useState } from 'react'
import type { AppSettings, SmartKnowledgeStatus } from '../../shared/types'
import { api } from '../api'

type OnChange = (patch: Partial<AppSettings>) => Promise<void> | void

const HELPER_MODELS: [string, string][] = [
  ['haiku', 'Haiku (fastest, uses the least)'],
  ['sonnet', 'Sonnet'],
  ['opus', 'Opus (most careful, uses the most)']
]

export function SmartKnowledgeSettings({ settings: s, onChange }: { settings: AppSettings; onChange: OnChange }) {
  const [status, setStatus] = useState<SmartKnowledgeStatus | null>(null)
  useEffect(() => {
    if (!s.smartKnowledge || !s.smartContext) return
    void api.smartKnowledgeStatus().then(setStatus)
    return api.onSmartKnowledge(setStatus)
  }, [s.smartKnowledge, s.smartContext])

  return (
    <div className="smart-knowledge">
      <label className="toggle">
        <input type="checkbox" checked={s.smartKnowledge} onChange={(e) => void onChange({ smartKnowledge: e.target.checked })} />
        <span>
          <b>Claude-powered knowledge search</b>
          <span className="muted small">
            Claude helps find things in your project files, linked folders and notes, instead of keyword search alone. Uses your plan’s usage for the
            extra requests. Your files stay on this machine; the passages Claude looks at are sent to it like anything else in a chat.
          </span>
        </span>
      </label>
      {s.smartKnowledge && (
        <div className="smart-knowledge-options">
          <label className="toggle">
            <input type="checkbox" checked={s.smartRerank} onChange={(e) => void onChange({ smartRerank: e.target.checked })} />
            <span>
              <b>Claude picks the best passages</b>
              <span className="muted small">
                A search finds the 30 closest passages by wording, then a short request to Claude keeps the ones that actually answer the question.
                One small request per search.
              </span>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.smartResearcher} onChange={(e) => void onChange({ smartResearcher: e.target.checked })} />
            <span>
              <b>Research helper</b>
              <span className="muted small">
                For questions that need many passages or long documents (manuals, datasheets), Claude hands the reading to a helper that reports back
                with the facts and where each came from, so the chat stays focused. The helper uses the chat’s model.
              </span>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.smartContext} onChange={(e) => void onChange({ smartContext: e.target.checked })} />
            <span>
              <b>Write context for each passage</b>
              <span className="muted small">
                When knowledge is indexed, Claude writes one line per passage saying where it sits and what it’s about (the section, register,
                function or topic), so searches find it by words the passage itself doesn’t use. Done once per document and stored encrypted, but a
                long manual takes many requests: about one per 20 passages (roughly 15 pages).
              </span>
              {s.smartContext && status && (status.running || status.queuedDocs > 0) && (
                <span className="small">
                  Writing context: {status.done.toLocaleString()} of {status.total.toLocaleString()} passages ({status.queuedDocs} document
                  {status.queuedDocs === 1 ? '' : 's'})
                </span>
              )}
              {s.smartContext && status?.lastError && <span className="small notice">{status.lastError}</span>}
            </span>
          </label>
          <div className="field">
            <label>Model for picking passages and writing context</label>
            <select className="select" value={s.smartModel} onChange={(e) => void onChange({ smartModel: e.target.value })}>
              {HELPER_MODELS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
