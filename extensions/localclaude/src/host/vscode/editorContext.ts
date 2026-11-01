// What the editor tells Claude: the file you're in, your selection, and the problems VS Code found.
import { isAbsolute, relative } from 'node:path'
import * as vscode from 'vscode'

/** Longest selection that rides along with every message; bigger ones are referred to by line numbers only. */
const MAX_SELECTION_CHARS = 6000

/** A path Claude can use: relative to the chat's folder when the file is inside it. */
function displayPath(uri: vscode.Uri, cwd?: string): string {
  if (uri.scheme !== 'file') return uri.toString()
  if (cwd) {
    const rel = relative(cwd, uri.fsPath)
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return rel.replace(/\\/g, '/')
  }
  return uri.fsPath
}

function fence(text: string, lang: string): string {
  const ticks = text.includes('```') ? '````' : '```'
  return `${ticks}${lang}\n${text.replace(/\s+$/, '')}\n${ticks}`
}

function lines(sel: vscode.Selection): string {
  const a = sel.start.line + 1
  // a selection that ends at the start of a line doesn't include that line
  const b = sel.end.character === 0 && sel.end.line > sel.start.line ? sel.end.line : sel.end.line + 1
  return a === b ? `line ${a}` : `lines ${a}-${b}`
}

/**
 * Sent with each message (not shown in the chat), like Claude Code's own IDE integration:
 * the active file, the cursor or selection, and the other files open in the editor.
 */
export function editorContext(cwd?: string): string | null {
  const ed = vscode.window.activeTextEditor
  if (!ed || ed.document.uri.scheme === 'output') return null
  const doc = ed.document
  const out: string[] = []
  const sel = ed.selection
  let line = `The user has ${displayPath(doc.uri, cwd)} (${doc.languageId}) open in VS Code`
  if (sel.isEmpty) line += `, cursor at line ${sel.active.line + 1}.`
  else line += `, with ${lines(sel)} selected.`
  out.push(line)
  if (!sel.isEmpty) {
    const text = doc.getText(sel)
    if (text.length <= MAX_SELECTION_CHARS) out.push('Selected text:\n' + fence(text, doc.languageId))
  }
  const others = vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .map((t) => (t.input instanceof vscode.TabInputText ? t.input.uri : undefined))
    .filter((u): u is vscode.Uri => !!u && u.scheme === 'file' && u.toString() !== doc.uri.toString())
  const unique = [...new Set(others.map((u) => displayPath(u, cwd)))].slice(0, 15)
  if (unique.length) out.push('Other open files: ' + unique.join(', '))
  return `<editor_context>\n${out.join('\n')}\nUse this only if it's relevant to the request.\n</editor_context>`
}

/** "Ask LocalClaude about this": the selection with where it came from, ready for your question. */
export function selectionPrompt(): string | null {
  const ed = vscode.window.activeTextEditor
  if (!ed || ed.selection.isEmpty) return null
  const doc = ed.document
  const where = doc.uri.scheme === 'file' ? doc.uri.fsPath : doc.uri.toString()
  return `In ${where} (${lines(ed.selection)}):\n\n${fence(doc.getText(ed.selection), doc.languageId)}\n\n`
}

/** "Fix problems": the errors and warnings VS Code shows for the active file. */
export function problemsPrompt(): string | null {
  const ed = vscode.window.activeTextEditor
  if (!ed) return null
  const diags = vscode.languages
    .getDiagnostics(ed.document.uri)
    .filter((d) => d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning)
    .sort((a, b) => a.severity - b.severity || a.range.start.line - b.range.start.line)
    .slice(0, 50)
  if (!diags.length) return null
  const where = ed.document.uri.scheme === 'file' ? ed.document.uri.fsPath : ed.document.uri.toString()
  const items = diags.map((d) => {
    const kind = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning'
    const src = d.source ? ` (${d.source}${d.code !== undefined ? ` ${typeof d.code === 'object' ? d.code.value : d.code}` : ''})` : ''
    return `- line ${d.range.start.line + 1}: ${kind}: ${d.message.replace(/\s+/g, ' ')}${src}`
  })
  return `Fix these problems in ${where}:\n\n${items.join('\n')}\n`
}
