import type { DiffHunk } from './types'

export interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'gap'
  text: string
  oldNo?: number
  newNo?: number
}

/** Flatten Claude Code's structured patch into numbered rows. */
export function linesFromPatch(hunks: DiffHunk[]): DiffLine[] {
  const out: DiffLine[] = []
  hunks.forEach((h, i) => {
    if (i > 0) out.push({ kind: 'gap', text: '' })
    let o = h.oldStart
    let n = h.newStart
    for (const raw of h.lines) {
      const sign = raw[0]
      const text = raw.slice(1)
      if (sign === '+') out.push({ kind: 'add', text, newNo: n++ })
      else if (sign === '-') out.push({ kind: 'del', text, oldNo: o++ })
      else if (sign === '\\') continue // "\ No newline at end of file"
      else out.push({ kind: 'ctx', text, oldNo: o++, newNo: n++ })
    }
  })
  return out
}

/** Line diff of two snippets (LCS), used while an edit streams in or for older chats without a patch. */
export function diffStrings(a: string, b: string, maxLines = 400): DiffLine[] {
  const A = a.split('\n').slice(0, maxLines)
  const B = b.split('\n').slice(0, maxLines)
  const m = A.length
  const n = B.length
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (A[i] === B[j]) {
      out.push({ kind: 'ctx', text: A[i], oldNo: i + 1, newNo: j + 1 })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: 'del', text: A[i], oldNo: ++i })
    else out.push({ kind: 'add', text: B[j], newNo: ++j })
  }
  while (i < m) out.push({ kind: 'del', text: A[i], oldNo: ++i })
  while (j < n) out.push({ kind: 'add', text: B[j], newNo: ++j })
  return out
}

export function countChanges(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.kind === 'add') added++
    else if (l.kind === 'del') removed++
  }
  return { added, removed }
}
