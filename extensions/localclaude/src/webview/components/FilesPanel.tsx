// The files Claude changed in this chat, each with its changes, like a pull request's file list.
import { useState } from 'react'
import { countChanges, type DiffLine } from '../../shared/diff'
import { editDiff, fileName, parsedInput, type ToolPart } from '../../shared/steps'
import type { ChatMessage } from '../../shared/types'
import { api } from '../api'
import { Icon } from './Icon'
import { DiffView } from './MessageView'

const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']

export interface ChangedFile {
  path: string
  added: number
  removed: number
  /** Claude created it (its first change wrote the whole file) */
  created: boolean
  edits: { id: string; lines: DiffLine[]; numbered: boolean }[]
}

/** Every file Claude changed in a chat (subagents included), in the order first changed. */
export function changedFiles(history: ChatMessage[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>()
  for (const m of history)
    for (const p of m.parts) {
      if (p.kind !== 'tool' || !EDIT_TOOLS.includes(p.name) || !p.done || p.isError) continue
      const input = parsedInput(p as ToolPart)
      const path = String(input.file_path ?? input.notebook_path ?? '')
      const diff = editDiff(p as ToolPart, input)
      if (!path || !diff) continue
      const key = path.replace(/\\/g, '/').toLowerCase()
      let f = byPath.get(key)
      if (!f) byPath.set(key, (f = { path, added: 0, removed: 0, created: p.name === 'Write' && !p.patch?.length, edits: [] }))
      const { added, removed } = countChanges(diff.lines)
      f.added += added
      f.removed += removed
      f.edits.push({ id: p.toolUseId, lines: diff.lines, numbered: diff.numbered })
    }
  return [...byPath.values()]
}

const folderOf = (p: string): string => p.replace(/[\\/][^\\/]*$/, '')

function FileRow({ file, cwd }: { file: ChangedFile; cwd: string }) {
  const [open, setOpen] = useState(false)
  const dir = folderOf(file.path)
  const shownDir = dir.toLowerCase().startsWith(cwd.toLowerCase()) ? dir.slice(cwd.length).replace(/^[\\/]/, '') : dir
  return (
    <div className="file-card changed-file">
      <button className="file-card-head" onClick={() => setOpen(!open)} title={file.path}>
        <Icon name="file" size={15} />
        <span className="file-card-name">{fileName(file.path)}</span>
        {shownDir && <span className="muted small changed-dir">{shownDir}</span>}
        {file.created && <span className="muted small">new</span>}
        <span className="grow" />
        <span className="ok-text small mono">+{file.added}</span>
        <span className="danger-text small mono">-{file.removed}</span>
        <Icon name="chevron" size={14} className={'chev-i' + (open ? ' open' : '')} />
      </button>
      {open && (
        <div className="changed-body">
          <div className="row gap changed-actions">
            <button className="btn ghost small" onClick={() => void api.openPath(file.path)}>
              Open
            </button>
            <button className="btn ghost small" onClick={() => void api.openInEditor(file.path)}>
              Open in VS Code
            </button>
            <button className="btn ghost small" onClick={() => void api.revealFile(file.path)}>
              Show in folder
            </button>
          </div>
          {file.edits.map((e) => (
            <DiffView key={e.id} lines={e.lines} numbered={e.numbered} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FilesPanel(props: { files: ChangedFile[]; cwd: string; canUndo: boolean; onUndo: () => void; onClose: () => void }) {
  const added = props.files.reduce((n, f) => n + f.added, 0)
  const removed = props.files.reduce((n, f) => n + f.removed, 0)
  return (
    <aside className="artifact-panel files-panel">
      <div className="artifact-head">
        <span className="files-title">Files changed</span>
        <span className="muted small">
          {props.files.length} · <span className="ok-text">+{added}</span> <span className="danger-text">-{removed}</span>
        </span>
        <span className="grow" />
        <button className="icon-btn" title="Close" onClick={props.onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="files-body">
        {props.files.length === 0 ? (
          <div className="muted small files-empty">Claude hasn’t changed any files in this chat yet.</div>
        ) : (
          props.files.map((f) => <FileRow key={f.path} file={f} cwd={props.cwd} />)
        )}
      </div>
      {props.files.length > 0 && (
        <div className="files-foot">
          <span className="muted small grow">Changes made by Claude’s edit tools. Commands it ran aren’t tracked here.</span>
          <button className="btn ghost" disabled={!props.canUndo} onClick={props.onUndo} title="Go back to before a message and undo the file changes made after it">
            Undo changes…
          </button>
        </div>
      )}
    </aside>
  )
}
