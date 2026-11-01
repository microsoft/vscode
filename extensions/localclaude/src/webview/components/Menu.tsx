import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  key: string
  label: ReactNode
  hint?: ReactNode
  checked?: boolean
  danger?: boolean
  disabled?: boolean
  /** shown on hover, e.g. a folder's full path */
  title?: string
  onSelect: () => void
}
export type MenuEntry = MenuItem | { section: ReactNode } | 'divider'

/** A button that opens a Claude app-style popover menu. */
export function Menu(props: {
  trigger: ReactNode
  entries: MenuEntry[]
  title?: string
  className?: string
  align?: 'left' | 'right'
  direction?: 'up' | 'down'
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  return (
    <div className={'menu-wrap ' + (props.className ?? '')} ref={ref}>
      <button className={'menu-trigger' + (open ? ' open' : '')} onClick={() => setOpen(!open)} title={props.title}>
        {props.trigger}
      </button>
      {open && (
        <div className={`menu-pop ${props.align ?? 'left'} ${props.direction ?? 'down'}`} role="menu">
          {props.entries.map((e, i) =>
            e === 'divider' ? (
              <div key={'d' + i} className="menu-divider" />
            ) : 'section' in e ? (
              <div key={'s' + i} className="menu-section">
                {e.section}
              </div>
            ) : (
              <button
                key={e.key}
                role="menuitem"
                className={'menu-item' + (e.danger ? ' danger' : '') + (e.checked ? ' checked' : '')}
                disabled={e.disabled}
                title={e.title}
                onClick={() => {
                  setOpen(false)
                  e.onSelect()
                }}
              >
                <span className="menu-label">
                  {e.label}
                  {e.hint && <span className="menu-hint">{e.hint}</span>}
                </span>
                {e.checked && <span className="menu-check">✓</span>}
              </button>
            )
          )}
          {props.footer && <div className="menu-footer">{props.footer}</div>}
        </div>
      )}
    </div>
  )
}
