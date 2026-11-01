// Git for the chat's folder: the branch and what's changed (shown in the header), and starting a
// chat in a new worktree so Claude can work on a branch without touching your checkout.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { GitStatus } from '../shared/types'

function git(cwd: string, args: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('git', args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim().split('\n').pop() || 'git failed'))
      else resolve(stdout)
    })
  )
}

/** Branch and changed files of the repository `cwd` is in, or null when it isn't in one (or git isn't installed). */
export async function gitStatus(cwd: string): Promise<GitStatus | null> {
  if (!cwd || !existsSync(cwd)) return null
  try {
    const [head, root, gitDir, commonDir, porcelain] = await Promise.all([
      git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
      git(cwd, ['rev-parse', '--show-toplevel']),
      git(cwd, ['rev-parse', '--absolute-git-dir']),
      git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']).catch(() => ''),
      git(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])
    ])
    const files = porcelain
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => ({ status: l.slice(0, 2).trim() || '?', path: l.slice(3).replace(/^"|"$/g, '') }))
    const branch = head.trim()
    return {
      branch: branch === 'HEAD' ? '(no branch)' : branch,
      root: root.trim(),
      changed: files.length,
      files: files.slice(0, 200),
      // a linked worktree has its own git dir inside the main repository's
      worktree: !!commonDir.trim() && gitDir.trim() !== commonDir.trim()
    }
  } catch {
    return null
  }
}

/** A branch name git accepts, from what you typed. */
export function branchName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[~^:?*[\\\x00-\x1f\x7f]+/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/\/{2,}/g, '/')
    .replace(/^[-/.]+|[/.]+$|\.lock$/g, '')
    .replace(/@\{/g, '')
}

/**
 * A new worktree on a new branch, next to the repository: <repo>-worktrees/<branch>.
 * Returns where it is. Your own checkout isn't touched.
 */
export async function createWorktree(cwd: string, name: string): Promise<{ path: string; branch: string }> {
  const branch = branchName(name)
  if (!branch) throw new Error('Choose a branch name.')
  await git(cwd, ['check-ref-format', '--branch', branch]).catch(() => {
    throw new Error(`"${branch}" isn't a valid branch name.`)
  })
  const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
  const path = join(dirname(root), `${basename(root)}-worktrees`, branch.replace(/[\\/]+/g, '-'))
  if (existsSync(path)) throw new Error(`A folder for "${branch}" already exists: ${path}`)
  await git(root, ['worktree', 'add', '-b', branch, path], 60_000)
  return { path, branch }
}
