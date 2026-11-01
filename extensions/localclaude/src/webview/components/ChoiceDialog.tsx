import { useEffect } from 'react'

export interface Choice<T extends string> {
  value: T
  label: string
  primary?: boolean
  danger?: boolean
}

/** A small dialog with a question and a few buttons. Esc or clicking outside cancels. */
export function ChoiceDialog<T extends string>(props: { title: string; body?: string; choices: Choice<T>[]; onChoose: (value: T | null) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        props.onChoose(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [props])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onChoose(null)}>
      <div className="dialog-card choice-dialog" role="dialog" aria-label={props.title}>
        <div className="dialog-title">{props.title}</div>
        {props.body && <div className="muted small">{props.body}</div>}
        <div className="row gap end">
          <button className="btn ghost" onClick={() => props.onChoose(null)}>
            Cancel
          </button>
          {props.choices.map((c) => (
            <button key={c.value} className={'btn' + (c.primary ? ' primary' : '') + (c.danger ? ' danger' : '')} onClick={() => props.onChoose(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
