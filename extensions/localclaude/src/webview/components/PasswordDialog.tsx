import { useEffect, useState, type ReactNode } from 'react'

export const MIN_PASSWORD = 8

/**
 * Asks for a password (twice when choosing a new one). `onSubmit` returns an error to show,
 * or null when done (the caller then closes the dialog). Esc or clicking outside cancels.
 */
export function PasswordDialog(props: { title: string; body: ReactNode; confirm?: boolean; submitLabel: string; onSubmit: (password: string) => Promise<string | null>; onCancel: () => void }) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
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
    if (props.confirm && password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (props.confirm && password !== again) return setError('The two passwords don’t match.')
    setBusy(true)
    setError(null)
    try {
      setError(await props.onSubmit(password))
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
    setBusy(false)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="dialog-card choice-dialog password-dialog"
        role="dialog"
        aria-label={props.title}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="dialog-title">{props.title}</div>
        <div className="muted small">{props.body}</div>
        <input className="input" type="password" autoFocus placeholder="Password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {props.confirm && (
          <input className="input" type="password" placeholder="Type it again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        )}
        {error && <div className="danger-text small">{error}</div>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!password || busy}>
            {busy ? 'Working…' : props.submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
