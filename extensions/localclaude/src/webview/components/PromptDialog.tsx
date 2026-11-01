import { useEffect, useState, type ReactNode } from 'react'

/** Asks for one line of text. `onSubmit` returns an error to show, or null when done. Esc cancels. */
export function PromptDialog(props: { title: string; body?: ReactNode; placeholder?: string; initial?: string; submitLabel: string; onSubmit: (value: string) => Promise<string | null>; onCancel: () => void }) {
  const [value, setValue] = useState(props.initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { onCancel } = props

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setError(await props.onSubmit(value.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
    setBusy(false)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="dialog-card choice-dialog prompt-dialog"
        role="dialog"
        aria-label={props.title}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="dialog-title">{props.title}</div>
        {props.body && <div className="muted small">{props.body}</div>}
        <input className="input" autoFocus placeholder={props.placeholder} value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} />
        {error && <div className="danger-text small">{error}</div>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim() || busy}>
            {busy ? 'Working…' : props.submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
