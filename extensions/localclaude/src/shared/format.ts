// Small formatting helpers shared by the UI, the exporter and the main process.
import type { Artifact, ArtifactType } from './types'

export const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  html: 'Web page',
  react: 'Interactive app',
  svg: 'Image',
  mermaid: 'Diagram',
  markdown: 'Document',
  code: 'Code'
}

/** A Markdown code fence long enough that backticks inside the content can't close it. */
export function fenced(content: string, lang = ''): string {
  const longest = Math.max(2, ...(content.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${lang}\n${content.replace(/\n$/, '')}\n${fence}`
}

/** Highlighting language for an artifact's source. */
export function artifactLang(a: Pick<Artifact, 'type' | 'language'>): string {
  return { html: 'html', react: 'jsx', svg: 'xml', mermaid: 'mermaid', markdown: 'markdown', code: a.language ?? '' }[a.type]
}

const CODE_EXT: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  bash: 'sh',
  shell: 'sh',
  sh: 'sh',
  powershell: 'ps1',
  csharp: 'cs',
  'c#': 'cs',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  java: 'java',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  sql: 'sql',
  json: 'json',
  yaml: 'yml',
  css: 'css',
  html: 'html',
  kotlin: 'kt',
  swift: 'swift',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  scala: 'scala'
}

/** File extension for saving an artifact. */
export function artifactExt(a: Pick<Artifact, 'type' | 'language'>): string {
  if (a.type === 'code') return CODE_EXT[(a.language ?? '').toLowerCase()] ?? 'txt'
  return { html: 'html', react: 'jsx', svg: 'svg', markdown: 'md', mermaid: 'mmd' }[a.type]
}

/** A name that is safe as a file or folder name on Windows, macOS and Linux. */
export function safeFileName(name: string, max = 80): string {
  // eslint-disable-next-line no-control-regex
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.]+$/g, '')
  const cut = s.slice(0, max).trim()
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cut) || !cut ? `_${cut}` : cut
}

/** Rough token count for text (about 4 characters per token for English). */
export const estimateTokens = (chars: number): number => Math.round(chars / 4)
