import { useState } from 'react'
import { Icon } from './Icon'

export interface Todo {
  content?: string
  status?: string
  activeForm?: string
}

/** Claude's task list while it works, above the reply box (click to see every task). */
export function TaskBar({ todos }: { todos: Todo[] }) {
  const [open, setOpen] = useState(false)
  const done = todos.filter((t) => t.status === 'completed').length
  const current = todos.find((t) => t.status === 'in_progress')
  return (
    <div className={'task-bar' + (open ? ' open' : '')}>
      <button className="task-bar-head" onClick={() => setOpen(!open)} title={open ? 'Hide tasks' : 'Show all tasks'}>
        <Icon name="list" size={15} />
        <span className="task-bar-now shimmer">{current ? (current.activeForm ?? current.content) : done === todos.length ? 'All tasks done' : 'Working through tasks'}</span>
        <span className="muted small">
          {done}/{todos.length}
        </span>
        <Icon name="chevron" size={13} className={'chev-i' + (open ? ' open' : '')} />
      </button>
      {open && (
        <ul className="todos">
          {todos.map((t, i) => (
            <li key={i} className={'todo ' + (t.status ?? '')}>
              <span className="todo-box">{t.status === 'completed' ? '✓' : ''}</span>
              <span>{t.status === 'in_progress' ? (t.activeForm ?? t.content) : t.content}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
