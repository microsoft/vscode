import { useState } from 'react'
import type { PermissionModeUI, PermissionRequest } from '../../shared/types'
import { api } from '../api'
import { Markdown } from './Markdown'
import { Icon } from './Icon'
import { describeTool } from './MessageView'

interface Question {
  question: string
  header?: string
  multiSelect?: boolean
  options: { label: string; description?: string }[]
}

function AskUser({ req, done }: { req: PermissionRequest; done: () => void }) {
  const questions = (req.input.questions ?? []) as Question[]
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})

  const toggle = (q: Question, label: string): void => {
    setPicks((p) => {
      const cur = p[q.question] ?? []
      if (q.multiSelect) return { ...p, [q.question]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label] }
      return { ...p, [q.question]: [label] }
    })
  }
  const answerFor = (q: Question): string => {
    const o = other[q.question]?.trim()
    const sel = picks[q.question] ?? []
    return [...sel, ...(o ? [o] : [])].join(', ')
  }
  const complete = questions.every((q) => answerFor(q))

  const submit = (): void => {
    const answers: Record<string, string> = {}
    for (const q of questions) answers[q.question] = answerFor(q)
    void api.respond(req.sessionId, req.requestId, { behavior: 'allow', updatedInput: { ...req.input, answers } })
    done()
  }

  return (
    <div className="perm-card">
      <div className="perm-title">Claude has {questions.length > 1 ? 'some questions' : 'a question'}</div>
      {questions.map((q) => (
        <div key={q.question} className="question">
          {q.header && <span className="chip">{q.header}</span>}
          <div className="q-text">{q.question}</div>
          <div className="options">
            {q.options.map((o) => (
              <button
                key={o.label}
                className={'option' + ((picks[q.question] ?? []).includes(o.label) ? ' selected' : '')}
                onClick={() => toggle(q, o.label)}
              >
                <span className="option-label">{o.label}</span>
                {o.description && <span className="muted small">{o.description}</span>}
              </button>
            ))}
          </div>
          <input
            className="input"
            placeholder="Other…"
            value={other[q.question] ?? ''}
            onChange={(e) => setOther((x) => ({ ...x, [q.question]: e.target.value }))}
          />
        </div>
      ))}
      <div className="row gap end">
        <button
          className="btn ghost"
          onClick={() => {
            void api.respond(req.sessionId, req.requestId, { behavior: 'deny', message: 'The user skipped the questions.' })
            done()
          }}
        >
          Skip
        </button>
        <button className="btn primary" disabled={!complete} onClick={submit}>
          Submit answers
        </button>
      </div>
    </div>
  )
}

function PlanApproval({ req, done }: { req: PermissionRequest; done: () => void }) {
  const [feedback, setFeedback] = useState('')
  const approve = (mode: PermissionModeUI): void => {
    void api.respond(req.sessionId, req.requestId, { behavior: 'allow', switchMode: mode })
    done()
  }
  return (
    <div className="perm-card wide">
      <div className="perm-title">Ready to code? Here's Claude's plan</div>
      <div className="plan-body">
        <Markdown text={String(req.input.plan ?? '')} />
      </div>
      <input className="input" placeholder="Or tell Claude what to change…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <div className="row gap end">
        <button
          className="btn ghost"
          onClick={() => {
            void api.respond(req.sessionId, req.requestId, { behavior: 'deny', message: feedback.trim() || 'Keep planning.' })
            done()
          }}
        >
          {feedback.trim() ? 'Send feedback' : 'Keep planning'}
        </button>
        <button className="btn" onClick={() => approve('default')}>
          Approve, ask before edits
        </button>
        <button className="btn primary" onClick={() => approve('acceptEdits')}>
          Approve, auto-accept edits
        </button>
      </div>
    </div>
  )
}

export function PermissionDialog({ req, onDone }: { req: PermissionRequest; onDone: (requestId: string) => void }) {
  const [denyMsg, setDenyMsg] = useState('')
  const [showDeny, setShowDeny] = useState(false)
  const done = (): void => onDone(req.requestId)

  if (req.toolName === 'AskUserQuestion') return <AskUser req={req} done={done} />
  if (req.toolName === 'ExitPlanMode') return <PlanApproval req={req} done={done} />

  const d = describeTool(req.toolName, req.input)
  const cmd = req.input.command ?? req.input.file_path ?? req.input.url ?? req.input.pattern ?? (d.detail || d.label)
  const respond = (allow: boolean, always = false): void => {
    void api.respond(req.sessionId, req.requestId, allow ? { behavior: 'allow', always } : { behavior: 'deny', message: denyMsg })
    done()
  }

  return (
    <div className="perm-card" onKeyDown={(e) => e.key === 'Escape' && respond(false)}>
      <div className="perm-title">
        <Icon name={d.icon} size={16} /> {req.title ?? `Allow Claude to use ${req.displayName ?? req.toolName}?`}
      </div>
      {cmd !== undefined && <pre className="tool-pre">{String(cmd)}</pre>}
      {req.decisionReason && <div className="muted small">{req.decisionReason}</div>}
      {req.blockedPath && <div className="muted small">Outside allowed folders: {req.blockedPath}</div>}
      <details className="muted small">
        <summary>Details</summary>
        <pre className="tool-pre">{JSON.stringify(req.input, null, 2)}</pre>
      </details>
      {showDeny && (
        <input
          className="input"
          autoFocus
          placeholder="Tell Claude what to do instead (optional)"
          value={denyMsg}
          onChange={(e) => setDenyMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && respond(false)}
        />
      )}
      <div className="row gap end">
        <button className="btn ghost" onClick={() => (showDeny ? respond(false) : setShowDeny(true))}>
          {showDeny ? 'Deny' : 'Deny…'}
        </button>
        {req.hasSuggestions && (
          <button className="btn" onClick={() => respond(true, true)}>
            Always allow
          </button>
        )}
        <button className="btn primary" autoFocus onClick={() => respond(true)}>
          Allow once
        </button>
      </div>
    </div>
  )
}
