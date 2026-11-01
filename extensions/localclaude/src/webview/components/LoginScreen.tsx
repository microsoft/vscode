import { useEffect, useRef, useState } from 'react'
import type { AuthStatus } from '../../shared/types'
import { api } from '../api'

export function LoginScreen({ auth, onDone }: { auth: AuthStatus; onDone: () => Promise<void> }) {
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [url, setUrl] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    return api.onLogin((e) => {
      if (e.type === 'output') {
        setLog((l) => (l + (e.text ?? '')).slice(-6000))
        if (e.url) setUrl(e.url)
      } else {
        setBusy(false)
        void onDone()
      }
    })
  }, [onDone])

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [log])

  const start = async (): Promise<void> => {
    setLog('')
    setUrl(null)
    setBusy(true)
    await api.login()
  }

  return (
    <div className="center-screen">
      <div className="card">
        <div className="empty-mark">✳</div>
        <h1>Sign in with your Claude subscription</h1>
        <p className="muted">
          LocalClaude runs Claude Code on this computer and uses your Pro / Max plan through Claude Code's own sign-in. No API key and no
          pay-per-token billing.
        </p>
        {auth.usingApiKeyEnv && (
          <p className="notice">
            An <code>ANTHROPIC_API_KEY</code> (or similar) is set in your environment. LocalClaude ignores it so your subscription is used instead.
          </p>
        )}
        {auth.error && <p className="notice error">{auth.error}</p>}

        {!busy ? (
          <div className="row gap">
            <button className="btn primary" onClick={() => void start()}>
              Sign in with Claude
            </button>
            <button className="btn ghost" onClick={() => void onDone()}>
              I've signed in already, check again
            </button>
          </div>
        ) : (
          <>
            <p className="muted small">
              A browser window should open. Approve access there.
              {url && (
                <>
                  {' '}
                  Didn't open?{' '}
                  <a href="#" onClick={(e) => (e.preventDefault(), void api.openExternal(url))}>
                    Open the sign-in page
                  </a>
                </>
              )}
            </p>
            <div className="row gap">
              <input
                className="input grow"
                placeholder="If the page shows a code, paste it here"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.trim()) {
                    void api.loginInput(code)
                    setCode('')
                  }
                }}
              />
              <button
                className="btn"
                disabled={!code.trim()}
                onClick={() => {
                  void api.loginInput(code)
                  setCode('')
                }}
              >
                Submit code
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  void api.cancelLogin()
                  setBusy(false)
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
        {log && (
          <pre ref={logRef} className="login-log">
            {log}
          </pre>
        )}
        <p className="muted small">
          Already use Claude Code in a terminal? Its sign-in is shared, so if <code>claude</code> works there you're set.
        </p>
      </div>
    </div>
  )
}
