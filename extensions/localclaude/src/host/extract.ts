// Text out of the files people keep knowledge in: plain text and code, Markdown (Obsidian notes),
// PDF (pdf.js via unpdf), and Word, PowerPoint and Excel files (they're ZIPs of XML).
import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { readZip } from './zip'

/** Office and PDF files are bigger than the text in them, so they get a higher limit. */
export const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_DOC_FILE_BYTES = 40 * 1024 * 1024
const MAX_TEXT_CHARS = 3_000_000

export const DOC_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx']

export class ExtractError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function zipText(buf: Buffer, name: string): string | undefined {
  return readZip(buf, 400 * 1024 * 1024)
    .find((e) => e.name === name)
    ?.data.toString('utf8')
}

/** Word: paragraphs, with headings as Markdown headings and list items as bullets. */
export function docxText(buf: Buffer): string {
  const xml = zipText(buf, 'word/document.xml')
  if (xml === undefined) throw new ExtractError('not a Word document')
  const out: string[] = []
  for (const p of xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
    let text = ''
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) text += m[1] !== undefined ? m[1] : m[0].startsWith('<w:tab') ? '\t' : '\n'
    text = decodeXml(text).trimEnd()
    if (!text.trim()) {
      if (out.length && out[out.length - 1] !== '') out.push('')
      continue
    }
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? ''
    const level = /^Heading(\d)$/i.exec(style)?.[1]
    if (level) out.push('', '#'.repeat(Math.min(6, Number(level))) + ' ' + text.trim(), '')
    else if (/^Title$/i.test(style)) out.push('# ' + text.trim(), '')
    else if (/<w:numPr>/.test(p)) out.push('- ' + text.trim())
    else out.push(text)
  }
  return tidy(out.join('\n'))
}

/** PowerPoint: each slide's text, in order. */
export function pptxText(buf: Buffer): string {
  const entries = readZip(buf, 400 * 1024 * 1024)
  const slides = entries
    .map((e) => ({ e, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(e.name)?.[1]) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.n - b.n)
  if (!slides.length) throw new ExtractError('not a PowerPoint file')
  const out: string[] = []
  for (const { e, n } of slides) {
    const xml = e.data.toString('utf8')
    const lines = (xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []).map((p) => decodeXml([...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('')).trim()).filter(Boolean)
    out.push(`## Slide ${n}`, '', ...lines, '')
  }
  return tidy(out.join('\n'))
}

/** Excel: each sheet as rows of cells separated by " | " (shared strings resolved). */
export function xlsxText(buf: Buffer): string {
  const entries = readZip(buf, 400 * 1024 * 1024)
  const get = (name: string): string | undefined => entries.find((e) => e.name === name)?.data.toString('utf8')
  const workbook = get('xl/workbook.xml')
  if (workbook === undefined) throw new ExtractError('not an Excel file')
  const shared = (get('xl/sharedStrings.xml')?.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) => decodeXml([...si.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join('')))
  const names = [...workbook.matchAll(/<sheet\s[^>]*name="([^"]*)"/g)].map((m) => decodeXml(m[1]))
  const sheets = entries
    .map((e) => ({ e, n: Number(/^xl\/worksheets\/sheet(\d+)\.xml$/.exec(e.name)?.[1]) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.n - b.n)
  const out: string[] = []
  for (const { e, n } of sheets) {
    out.push(`## ${names[n - 1] ?? `Sheet ${n}`}`, '')
    let rows = 0
    for (const row of e.data.toString('utf8').match(/<row[\s>][\s\S]*?<\/row>/g) ?? []) {
      if (++rows > 20_000) {
        out.push('… (more rows)')
        break
      }
      const cells: string[] = []
      for (const c of row.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]
        const body = c[2] ?? ''
        const v = /<v>([^<]*)<\/v>/.exec(body)?.[1]
        let value = ''
        if (/\st="s"/.test(' ' + attrs)) value = shared[Number(v)] ?? ''
        else if (/\st="inlineStr"/.test(' ' + attrs)) value = decodeXml([...body.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(''))
        else if (v !== undefined) value = decodeXml(v)
        cells.push(value.replace(/\s+/g, ' ').trim())
      }
      while (cells.length && !cells[cells.length - 1]) cells.pop()
      if (cells.length) out.push(cells.join(' | '))
    }
    out.push('')
  }
  return tidy(out.join('\n'))
}

/** PDF: page by page, each starting with "[Page n]" so answers can point to a page. */
export async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  let doc: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    doc = await getDocumentProxy(new Uint8Array(buf), { verbosity: 0 })
  } catch (e) {
    throw new ExtractError(/password/i.test(String(e)) ? 'the PDF is password-protected' : 'not a readable PDF')
  }
  const { text } = await extractText(doc, { mergePages: false })
  const pages = (text as string[]).map((t, i) => `[Page ${i + 1}]\n${t.trim()}`)
  const joined = tidy(pages.join('\n\n'))
  if (!joined.replace(/\[Page \d+\]/g, '').trim()) throw new ExtractError('the PDF has no text (it may be scanned images)')
  return joined
}

function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Text that looks binary (NUL bytes) isn't used. */
export function plainText(buf: Buffer): string | null {
  if (buf.subarray(0, 8192).includes(0)) return null
  return buf.toString('utf8').replace(/^﻿/, '')
}

/** The text of a file for knowledge, or an ExtractError saying why it can't be used. */
export async function extractFile(path: string): Promise<string> {
  const ext = extname(path).toLowerCase()
  const doc = DOC_EXTENSIONS.includes(ext)
  const size = statSync(path).size
  const max = doc ? MAX_DOC_FILE_BYTES : MAX_TEXT_FILE_BYTES
  if (size > max) throw new ExtractError(`over ${max / 1024 / 1024} MB`)
  return extractBuffer(readFileSync(path), ext)
}

export async function extractBuffer(buf: Buffer, ext: string): Promise<string> {
  let text: string
  try {
    if (ext === '.pdf') text = await pdfText(buf)
    else if (ext === '.docx') text = docxText(buf)
    else if (ext === '.pptx') text = pptxText(buf)
    else if (ext === '.xlsx') text = xlsxText(buf)
    else {
      const t = plainText(buf)
      if (t === null) throw new ExtractError('not a text file')
      text = t
    }
  } catch (e) {
    if (e instanceof ExtractError) throw e
    throw new ExtractError(`couldn’t read it (${e instanceof Error ? e.message : String(e)})`)
  }
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) + '\n… (cut: the file is very long)' : text
}
