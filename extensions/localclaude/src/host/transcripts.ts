// Where Claude Code keeps chat transcripts, and whether one still exists.
// Claude Code deletes transcripts it hasn't touched for `cleanupPeriodDays` (30 by default),
// even ones LocalClaude still shows, so chats check before resuming.
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** ~/.claude/projects, or CLAUDE_CONFIG_DIR/projects when that's set. */
export function claudeProjectsDir(): string {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')
}

/** Claude Code's folder name for a working directory: every character other than a letter or digit becomes "-". */
export function projectDirName(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Whether Claude Code still has the transcript for this session. */
export function transcriptExists(sessionId: string, cwd: string, base = claudeProjectsDir()): boolean {
  const file = sessionId + '.jsonl'
  if (existsSync(join(base, projectDirName(cwd), file))) return true
  // Very long paths are shortened differently: look in every project folder before giving up.
  try {
    for (const d of readdirSync(base, { withFileTypes: true })) if (d.isDirectory() && existsSync(join(base, d.name, file))) return true
  } catch {
    /* no Claude Code data at all */
  }
  return false
}

/** Ids of every transcript on this machine (used when importing chats). */
export function transcriptIds(base = claudeProjectsDir()): Set<string> {
  const ids = new Set<string>()
  if (!existsSync(base)) return ids
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    try {
      for (const f of readdirSync(join(base, d.name))) if (f.endsWith('.jsonl')) ids.add(f.slice(0, -6))
    } catch {
      /* unreadable folder */
    }
  }
  return ids
}
