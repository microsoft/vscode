import { useState } from 'react'
import type { LockStatus } from '../../shared/types'

export function LockScreen({ lock, onReset }: { lock: LockStatus; onReset: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="center-screen">
      <div className="card narrow">
        <div className="lock-icon">🔒</div>
        <h1>Locked to another machine</h1>
        <p className="muted">{lock.reason}</p>
        <p className="muted small">This machine: {lock.machineIdShort || 'unknown'}</p>
        {!confirm ? (
          <button className="btn" onClick={() => setConfirm(true)}>
            Reset and start fresh on this machine
          </button>
        ) : (
          <div className="row gap">
            <button className="btn danger" onClick={() => void onReset()}>
              Yes, erase local app data
            </button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
