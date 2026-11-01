// A stand-in for `claude remote-control`, used only by the end-to-end tests (LOCALCLAUDE_FAKE_AGENT=1).
// It prints what the real server prints: the trust error for a folder that isn't trusted (in the
// settings file the tests use), the one-time question, then the connection and the link.
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RemoteCommand } from './remoteControl'

const SCRIPT = String.raw`
const fs = require('fs'), path = require('path')
const cwd = fs.realpathSync.native(process.cwd())
const key = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
let trusted = false
try {
  const projects = JSON.parse(fs.readFileSync(process.env.LOCALCLAUDE_CLAUDE_CONFIG, 'utf8')).projects || {}
  trusted = Object.entries(projects).some(([k, v]) => v && v.hasTrustDialogAccepted && key(k) === key(cwd))
} catch {}
if (!trusted) {
  process.stdout.write('Error: Workspace not trusted. Please run ' + '\x60claude\x60' + ' in ' + cwd + ' first to review and accept the workspace trust dialog.\n')
  process.exit(1)
}
const folder = path.basename(cwd)
process.stdout.write('Take this session with you and pick up right where you left off on any device.\nThe session keeps running on this machine. Press Ctrl+C to stop.\nEnable Remote Control? (y/n) ')
process.stdin.once('data', (d) => {
  if (String(d).trim().toLowerCase() !== 'y') process.exit(0)
  process.stdout.write('\n\x1b[2m·|·\x1b[0m Connecting · ' + folder + ' · main\n')
  setTimeout(() => {
    process.stdout.write('·✔︎· Connected · ' + folder + ' · main\n    Same directory · up to 32 sessions\nContinue coding in the Claude mobile app or https://claude.ai/code/session_e2eFake01\nspace to show QR code\n')
  }, 300)
})
setInterval(() => {}, 1000)
`

export function fakeRemoteCommand(): RemoteCommand {
  const file = join(tmpdir(), 'localclaude-fake-remote.cjs')
  writeFileSync(file, SCRIPT)
  return { bin: process.execPath, args: [file], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
}
