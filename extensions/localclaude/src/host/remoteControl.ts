// Remote Control: Claude Code's `claude remote-control` server, run for one folder, so you can keep
// working from the Code tab of the Claude mobile app or claude.ai/code while Claude runs on this
// computer. LocalClaude starts and stops it, passes on your answer to its one-time question, trusts
// the folder when you ask (Claude Code won't serve a folder you haven't trusted) and shows the link.
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { RemoteSpawn, RemoteState } from '../shared/types'

// ---------------------------------------------------------------- folder trust (Claude Code's own record)
/** Claude Code's settings file, where trusted folders are listed. */
export function claudeConfigFile(): string {
  return process.env.LOCALCLAUDE_CLAUDE_CONFIG || join(process.env.CLAUDE_CONFIG_DIR || homedir(), '.claude.json')
}

/** The folder's full path (Windows short names like PARTHA~1 expanded), as Claude Code records it. */
function fullPath(folder: string): string {
  try {
    return realpathSync.native(resolve(folder))
  } catch {
    return resolve(folder)
  }
}
const sameKey = (p: string): string => {
  const k = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? k.toLowerCase() : k
}

/** Whether Claude Code trusts the folder (or a folder it's in). */
export function isFolderTrusted(folder: string, file = claudeConfigFile()): boolean {
  let projects: Record<string, { hasTrustDialogAccepted?: boolean }>
  try {
    projects = JSON.parse(readFileSync(file, 'utf8')).projects ?? {}
  } catch {
    return false
  }
  const trusted = new Set(
    Object.entries(projects)
      .filter(([, v]) => v?.hasTrustDialogAccepted)
      .map(([k]) => sameKey(k))
  )
  for (let p = fullPath(folder); ; p = dirname(p)) {
    if (trusted.has(sameKey(p))) return true
    if (dirname(p) === p) return false
  }
}

/** What accepting Claude Code's "trust this folder" prompt does: one flag in its settings file. */
export function trustFolder(folder: string, file = claudeConfigFile()): void {
  const key = fullPath(folder).replace(/\\/g, '/')
  const config = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { projects?: Record<string, object> }) : {}
  config.projects ??= {}
  config.projects[key] = { ...(config.projects[key] ?? {}), hasTrustDialogAccepted: true }
  // read just now and replaced in one step, so other settings written meanwhile aren't lost
  const tmp = file + '.localclaude-tmp'
  writeFileSync(tmp, JSON.stringify(config, null, 2))
  renameSync(tmp, file)
}

// ---------------------------------------------------------------- reading what the server prints
const URL_RE = /https:\/\/claude\.ai\/code\/[A-Za-z0-9_-]+/
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g

/** Fold a chunk of the server's output into the state: its question, trust, connection, link, problems. */
export function readRemoteOutput(state: RemoteState, chunk: string): RemoteState {
  const s: RemoteState = { ...state, log: [...state.log] }
  for (const raw of chunk.replace(ANSI, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/Enable Remote Control\?/i.test(line)) s.status = 'consent'
    else if (/Workspace not trusted/i.test(line)) {
      s.status = 'untrusted'
      s.error = undefined
    } else if (/^\W*Connecting\b/.test(line)) {
      if (s.status !== 'connected') s.status = 'connecting'
    } else if (/^\W*✔/.test(line) || /^\W*Connected\b/.test(line)) {
      s.status = 'connected'
      // "·✔︎· Connected · folder · branch" (or the session's name in place of "Connected")
      const parts = line.replace(/^\W*✔\S*\s*/, '').split(' · ')
      if (parts.length >= 3) s.where = parts.slice(-2).join(' · ')
    } else if (/^Error:/i.test(line)) {
      s.status = 'error'
      s.error = line.replace(/^Error:\s*/i, '')
    }
    const url = URL_RE.exec(line)?.[0]
    if (url) s.url = url
    const failed = /Session failed: (.+)$/.exec(line)?.[1]
    if (failed) s.problem = failed
    // the status block is printed again on every change: keep each line once
    if (!/space to show QR code|Press Ctrl\+C|^\(y\/n\)$/i.test(line) && !s.log.slice(-12).includes(line)) s.log.push(line)
  }
  s.log = s.log.slice(-80)
  return s
}

// ---------------------------------------------------------------- the server process
export interface RemoteCommand {
  bin: string
  args: string[]
  env: NodeJS.ProcessEnv
}
export interface RemoteOptions {
  cwd: string
  name?: string
  spawn: RemoteSpawn
  permissionMode?: string
}

export class RemoteControl {
  state: RemoteState = { status: 'off', log: [] }
  private proc: ChildProcess | null = null
  private last: RemoteOptions | null = null

  constructor(
    private emit: (s: RemoteState) => void,
    /** how to run Claude Code (null when it isn't installed) */
    private command: () => RemoteCommand | null
  ) {}

  private set(s: RemoteState): void {
    this.state = s
    this.emit(s)
  }

  get running(): boolean {
    return !!this.proc
  }

  start(opts: RemoteOptions): RemoteState {
    this.stop()
    this.last = opts
    const cmd = this.command()
    const base: RemoteState = { status: 'starting', cwd: opts.cwd, name: opts.name, spawn: opts.spawn, log: [], startedAt: Date.now() }
    if (!cmd) {
      this.set({ ...base, status: 'error', error: 'Claude Code isn’t installed with LocalClaude.' })
      return this.state
    }
    const args = [...cmd.args, 'remote-control', '--spawn', opts.spawn]
    if (opts.name) args.push('--name', opts.name)
    if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode)
    const posix = process.platform !== 'win32'
    let p: ChildProcess
    try {
      // its own process group on Linux, so stopping it also stops the sessions it started
      p = spawn(cmd.bin, args, { cwd: opts.cwd, env: cmd.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: posix })
    } catch (e) {
      this.set({ ...base, status: 'error', error: e instanceof Error ? e.message : String(e) })
      return this.state
    }
    this.proc = p
    this.set(base)
    const read = (d: Buffer): void => {
      if (this.proc === p) this.set(readRemoteOutput(this.state, d.toString('utf8')))
    }
    p.stdout?.on('data', read)
    p.stderr?.on('data', read)
    p.on('error', (e) => {
      if (this.proc !== p) return
      this.proc = null
      this.set({ ...this.state, status: 'error', error: e.message })
    })
    p.on('exit', (code) => {
      if (this.proc !== p) return
      this.proc = null
      const s = this.state
      // not trusted / an error it printed: keep that; otherwise it stopped (or its single session ended)
      if (s.status === 'untrusted' || s.status === 'error') return this.set(s)
      this.set(code && s.status !== 'consent' ? { ...s, status: 'error', error: `Remote Control stopped unexpectedly (exit code ${code}).` } : { ...s, status: 'off' })
    })
    return this.state
  }

  /** Your answer to "Enable Remote Control?" (asked once, the first time). */
  consent(yes: boolean): void {
    this.proc?.stdin?.write(yes ? 'y\n' : 'n\n')
    if (yes) this.set({ ...this.state, status: 'connecting' })
  }

  /** Trust the folder in Claude Code, then try again. */
  trustAndRetry(): RemoteState {
    if (!this.last) return this.state
    trustFolder(this.last.cwd)
    return this.start(this.last)
  }

  stop(): void {
    const p = this.proc
    if (!p) return
    this.proc = null
    if (p.pid) {
      if (process.platform === 'win32') execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {})
      else
        try {
          process.kill(-p.pid, 'SIGTERM')
        } catch {
          p.kill('SIGTERM')
        }
    }
    this.set({ ...this.state, status: 'off' })
  }
}
