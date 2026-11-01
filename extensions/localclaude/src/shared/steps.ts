// Plain-English descriptions of what Claude did (tool calls and thinking), shared by
// the chat view and the Markdown exporter so both say the same thing.
import { diffStrings, linesFromPatch, type DiffLine } from './diff'
import type { ContentPart } from './types'

export type ToolPart = Extract<ContentPart, { kind: 'tool' }>
export type ThinkingPart = Extract<ContentPart, { kind: 'thinking' }>
export type Step = ToolPart | ThinkingPart

export const COMPUTER_TOOL = 'mcp__computer-use__computer'
/** Making or changing an artifact (shown as its card); reading one is an ordinary step. */
export const isArtifactTool = (name: string): boolean => name === 'mcp__artifacts__create_artifact' || name === 'mcp__artifacts__update_artifact'
export const isMemoryTool = (name: string): boolean => name.startsWith('mcp__memory__')
export const isChatsTool = (name: string): boolean => name.startsWith('mcp__chats__')

export function parsedInput(p: ToolPart): Record<string, unknown> {
  if (p.input && typeof p.input === 'object' && Object.keys(p.input as object).length) return p.input as Record<string, unknown>
  if (p.inputJsonPartial) {
    try {
      return JSON.parse(p.inputJsonPartial)
    } catch {
      /* still streaming */
    }
  }
  return {}
}

export const short = (s: unknown, n = 90): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}
export const fileName = (p: unknown): string => String(p ?? '').split(/[\\/]/).pop() || String(p ?? '')
export const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const host = (u: unknown): string => {
  try {
    return new URL(String(u)).host
  } catch {
    return short(u, 40)
  }
}

/** One line for a step, like the Claude app's activity list. `icon` names an Icon in the UI. */
export function stepText(p: Step): { icon: string; title: string; detail?: string } {
  if (p.kind === 'thinking') return { icon: 'bulb', title: p.text.trim() ? 'Thought process' : 'Thinking' }
  const input = parsedInput(p)
  const done = p.done
  const v = (past: string, now: string): string => (done ? past : now)
  switch (p.name) {
    case 'Read':
      return { icon: 'file', title: `${v('Read', 'Reading')} ${fileName(input.file_path)}` }
    case 'Write':
      return { icon: 'pencil', title: `${v('Wrote', 'Writing')} ${fileName(input.file_path)}` }
    case 'Edit':
    case 'MultiEdit':
      return { icon: 'pencil', title: `${v('Edited', 'Editing')} ${fileName(input.file_path)}` }
    case 'NotebookEdit':
      return { icon: 'pencil', title: `${v('Edited', 'Editing')} ${fileName(input.notebook_path)}` }
    case 'Bash':
    case 'PowerShell':
      return { icon: 'terminal', title: input.description ? cap(short(input.description, 80)) : v('Ran a command', 'Running a command'), detail: short(input.command, 200) }
    case 'Grep':
      return { icon: 'search', title: `${v('Searched for', 'Searching for')} “${short(input.pattern, 50)}”` }
    case 'Glob':
      return { icon: 'search', title: `${v('Found files matching', 'Finding files matching')} ${short(input.pattern, 50)}` }
    case 'WebSearch':
      return { icon: 'globe', title: `${v('Searched the web for', 'Searching the web for')} “${short(input.query, 60)}”` }
    case 'WebFetch':
      return { icon: 'globe', title: `${v('Fetched', 'Fetching')} ${host(input.url)}` }
    case 'Agent':
    case 'Task':
      return { icon: 'agent', title: cap(short(input.description ?? input.prompt ?? 'Subagent', 80)), detail: input.subagent_type ? String(input.subagent_type) : undefined }
    case 'TodoWrite':
      return { icon: 'list', title: v('Updated the task list', 'Updating the task list') }
    case 'Skill':
      return { icon: 'sparkle', title: `${v('Used', 'Using')} the ${short(input.skill ?? input.command, 40)} skill` }
    case 'AskUserQuestion':
      return { icon: 'question', title: 'Asked you a question' }
    case 'ExitPlanMode':
      return { icon: 'list', title: 'Proposed a plan' }
    case 'mcp__memory__remember':
      return { icon: 'memory', title: `${v('Saved to memory', 'Saving to memory')}: “${short(input.text, 70)}”` }
    case 'mcp__memory__forget':
      return { icon: 'memory', title: v('Removed a memory', 'Removing a memory') }
    case 'mcp__chats__search_chats':
      return { icon: 'search', title: `${v('Searched your chats for', 'Searching your chats for')} “${short(input.query, 50)}”` }
    case 'mcp__chats__read_chat':
      return { icon: 'chat', title: v('Read an earlier chat', 'Reading an earlier chat') }
    case COMPUTER_TOOL: {
      const c = input.coordinate as number[] | undefined
      const at = c ? ` at (${c.join(', ')})` : ''
      const a = String(input.action ?? '')
      const map: Record<string, [string, string]> = {
        screenshot: ['Took a screenshot', 'Taking a screenshot'],
        left_click: ['Clicked' + at, 'Clicking' + at],
        right_click: ['Right-clicked' + at, 'Right-clicking' + at],
        middle_click: ['Middle-clicked' + at, 'Middle-clicking' + at],
        double_click: ['Double-clicked' + at, 'Double-clicking' + at],
        triple_click: ['Triple-clicked' + at, 'Triple-clicking' + at],
        mouse_move: ['Moved the mouse' + at, 'Moving the mouse' + at],
        left_click_drag: ['Dragged' + at, 'Dragging' + at],
        scroll: [`Scrolled ${input.scroll_direction ?? 'down'}`, `Scrolling ${input.scroll_direction ?? 'down'}`],
        type: [`Typed “${short(input.text, 40)}”`, `Typing “${short(input.text, 40)}”`],
        key: [`Pressed ${short(input.text, 30)}`, `Pressing ${short(input.text, 30)}`],
        hold_key: [`Held ${short(input.text, 30)}`, `Holding ${short(input.text, 30)}`],
        wait: ['Waited', 'Waiting'],
        cursor_position: ['Checked the cursor position', 'Checking the cursor position']
      }
      const t = map[a] ?? ['Used the computer', 'Using the computer']
      return { icon: 'monitor', title: done ? t[0] : t[1] }
    }
    default:
      if (p.name.startsWith('mcp__')) {
        const [, server, ...tool] = p.name.split('__')
        return { icon: 'plug', title: `${v('Used', 'Using')} ${tool.join('__').replace(/_/g, ' ')}`, detail: server }
      }
      return { icon: 'sparkle', title: `${v('Used', 'Using')} ${p.name}`, detail: short(Object.values(input)[0], 80) }
  }
}

/** The change an Edit/Write made, as diff lines (numbered when Claude Code reported a real patch). */
export function editDiff(part: ToolPart, input: Record<string, unknown>): { lines: DiffLine[]; numbered: boolean } | null {
  if (part.patch?.length) return { lines: linesFromPatch(part.patch), numbered: true }
  if ((part.name === 'Edit' || part.name === 'MultiEdit') && typeof input.old_string === 'string')
    return { lines: diffStrings(String(input.old_string), String(input.new_string ?? '')), numbered: false }
  if (part.name === 'MultiEdit' && Array.isArray(input.edits)) {
    const lines = (input.edits as { old_string?: string; new_string?: string }[]).flatMap((e, i) => [
      ...(i ? [{ kind: 'gap' as const, text: '' }] : []),
      ...diffStrings(String(e.old_string ?? ''), String(e.new_string ?? ''))
    ])
    return { lines, numbered: false }
  }
  if (part.name === 'Write' && typeof input.content === 'string')
    return { lines: String(input.content).split('\n').map((text, i) => ({ kind: 'add' as const, text, newNo: i + 1 })), numbered: true }
  return null
}

/** "Read 2 files, edited signup.ts, ran a command" */
export function summarize(steps: Step[]): string {
  const reads = new Set<string>()
  const edits = new Set<string>()
  let cmds = 0
  let searches = 0
  let web = 0
  let fetches = 0
  let computer = 0
  let agents = 0
  let tools = 0
  let todos = false
  let memory = false
  let pastChats = false
  let thought = false
  for (const s of steps) {
    if (s.kind === 'thinking') {
      thought = true
      continue
    }
    const i = parsedInput(s)
    switch (s.name) {
      case 'Read':
        reads.add(String(i.file_path ?? ''))
        break
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
        edits.add(fileName(i.file_path))
        break
      case 'NotebookEdit':
        edits.add(fileName(i.notebook_path))
        break
      case 'Bash':
      case 'PowerShell':
        cmds++
        break
      case 'Grep':
      case 'Glob':
        searches++
        break
      case 'WebSearch':
        web++
        break
      case 'WebFetch':
        fetches++
        break
      case 'Agent':
      case 'Task':
        agents++
        break
      case 'TodoWrite':
        todos = true
        break
      case COMPUTER_TOOL:
        computer++
        break
      default:
        if (isMemoryTool(s.name)) memory = true
        else if (isChatsTool(s.name)) pastChats = true
        else tools++
    }
  }
  const out: string[] = []
  if (reads.size) out.push(reads.size === 1 ? `read ${fileName([...reads][0])}` : `read ${reads.size} files`)
  if (searches) out.push(searches === 1 ? 'searched the code' : `searched the code ${searches} times`)
  if (web) out.push(web === 1 ? 'searched the web' : `ran ${web} web searches`)
  if (fetches) out.push(`fetched ${plural(fetches, 'page')}`)
  if (edits.size) out.push(edits.size <= 2 ? `edited ${[...edits].join(' and ')}` : `edited ${edits.size} files`)
  if (cmds) out.push(cmds === 1 ? 'ran a command' : `ran ${cmds} commands`)
  if (computer) out.push(`used the computer (${plural(computer, 'action')})`)
  if (agents) out.push(agents === 1 ? 'ran an agent' : `ran ${agents} agents`)
  if (tools) out.push(`used ${plural(tools, 'tool')}`)
  if (todos) out.push('updated tasks')
  if (memory) out.push('updated memory')
  if (pastChats) out.push('looked through past chats')
  if (!out.length) return thought ? 'Thought process' : 'Worked'
  return cap(out.join(', '))
}
