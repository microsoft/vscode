// A small log file for finding out what went wrong: <app data>/logs/main.log, started over at 2 MB
// (the previous one is kept as main.old.log). Chat content isn't logged, only what happened.
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const MAX_BYTES = 2 * 1024 * 1024
type Level = 'info' | 'warn' | 'error'

export function logFile(): string {
  return join(app.getPath('userData'), 'logs', 'main.log')
}

function text(p: unknown): string {
  if (p instanceof Error) return p.stack ?? p.message
  if (typeof p === 'string') return p
  try {
    return JSON.stringify(p)
  } catch {
    return String(p)
  }
}

export function log(level: Level, ...parts: unknown[]): void {
  try {
    const file = logFile()
    mkdirSync(dirname(file), { recursive: true })
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, file.replace(/\.log$/, '.old.log'))
    const line = parts.map(text).join(' ').slice(0, 8000)
    appendFileSync(file, `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${line}\n`)
  } catch {
    /* logging never gets in the way */
  }
}

/** Also keep warnings, errors and crashes from anywhere in the main process. */
export function captureMainProcess(): void {
  const warn = console.warn.bind(console)
  const error = console.error.bind(console)
  console.warn = (...a: unknown[]) => {
    log('warn', ...a)
    warn(...a)
  }
  console.error = (...a: unknown[]) => {
    log('error', ...a)
    error(...a)
  }
  // "monitor" listens without changing how Electron handles the crash
  process.on('uncaughtExceptionMonitor', (e) => log('error', 'uncaught exception:', e))
  process.on('unhandledRejection', (e) => log('error', 'unhandled promise rejection:', e))
}
