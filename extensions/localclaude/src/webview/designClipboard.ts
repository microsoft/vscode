// Copy frames from a LocalClaude design so they paste into a claude.ai Design canvas.
// claude.ai's canvas reads the clipboard's HTML for <span data-appifact-object="BASE64(JSON)">, where the JSON is
// { appifact: 1, kind: 'design-artboards', data: { v: 1, stamp, artboards: [{ src, stem, dx, dy, w, h, title }], files, assets } }
// and `src` is one artboard's .dc.html source. Frames here are ordinary HTML pages, so each is rewritten as a .dc.html:
// its styles go in <helmet>, its content in <x-dc> inside a root at the frame's size.

export interface ClipFrame {
  id: string
  title: string
  html: string
  x: number
  y: number
  w: number
  h: number
}

export interface DesignClip {
  html: string
  text: string
  frames: number
  /** frames left out, with why (e.g. imported from Claude Design: they're already there) */
  skipped: string[]
  /** scripts that don't carry (a Design Component page can't hold a page's own scripts) */
  scriptsDropped: number
}

const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const escText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** {{ is a template hole in a Design Component; written in text, it must not be one */
const noHoles = (s: string): string => s.replace(/\{\{/g, '&#123;{')

/** One frame as a .dc.html artboard source (null: not an ordinary page). */
export function toDcSource(html: string, title: string, w: number, h: number): { src: string; scripts: number } | null {
  // a frame imported from Claude Design is already a Design Component (rendered by a small script)
  if (/<template[^>]*data-dc-(main|name)/.test(html)) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const helmet: string[] = []
  for (const l of doc.querySelectorAll('link')) {
    const href = l.getAttribute('href') ?? ''
    if (l.rel === 'preconnect' && FONTS.test(href + '/')) helmet.push(`<link rel="preconnect" href="${escAttr(href)}">`)
    else if (l.rel === 'stylesheet' && FONTS.test(href)) helmet.push(`<link href="${escAttr(href)}" rel="stylesheet">`)
  }
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n').trim()
  helmet.push(`<style>\nbody{margin:0}\n${css}\n</style>`)
  let scripts = 0
  for (const s of [...doc.body.querySelectorAll('script')]) {
    scripts++
    s.remove()
  }
  for (const el of doc.body.querySelectorAll('*'))
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name)
  doc.body.querySelectorAll('style, iframe, object, embed').forEach((n) => n.remove())
  const bodyStyle = (doc.body.getAttribute('style') ?? '').trim()
  const root = `<div style="width: ${w}px; height: ${h}px; position: relative; overflow: hidden; ${bodyStyle.replace(/"/g, "'")}">\n${noHoles(doc.body.innerHTML)}\n</div>`
  const lang = escAttr(doc.documentElement.getAttribute('lang') || 'en')
  const src = [
    '<!doctype html>',
    `<html lang="${lang}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escText(title)}</title>`,
    '<script src="./support.js"></script>',
    '</head>',
    '<body>',
    '<x-dc>',
    `<helmet>\n${helmet.join('\n')}\n</helmet>`,
    root,
    '</x-dc>',
    `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>`,
    'class Component extends DCLogic {',
    '  renderVals() {',
    '    return {};',
    '  }',
    '}',
    '</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n')
  return { src, scripts }
}

function b64(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768))
  return btoa(bin)
}

const stemOf = (id: string, used: Set<string>): string => {
  let base = id.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9_]+/, '') || 'frame'
  base = base.replace(/\.dc\.html$/i, '')
  let s = base
  for (let n = 2; used.has(s); n++) s = `${base}-${n}`
  used.add(s)
  return s
}

/** The clipboard contents for these frames, laid out as they are on the board. */
export function buildDesignClip(frames: ClipFrame[]): DesignClip | null {
  const used = new Set<string>()
  const skipped: string[] = []
  let scriptsDropped = 0
  const minX = Math.min(...frames.map((f) => f.x))
  const minY = Math.min(...frames.map((f) => f.y))
  const artboards = frames.flatMap((f) => {
    const dc = toDcSource(f.html, f.title, f.w, f.h)
    if (!dc) {
      skipped.push(f.title)
      return []
    }
    scriptsDropped += dc.scripts
    return [{ src: dc.src, stem: stemOf(f.id, used), dx: f.x - minX, dy: f.y - minY, w: f.w, h: f.h, title: f.title }]
  })
  if (!artboards.length) return null
  const stamp = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  const text = artboards.map((a) => a.title).join(', ')
  const object = { appifact: 1, kind: 'design-artboards', data: { v: 1, stamp, artboards, files: {}, assets: {} } }
  const html = `<span data-appifact-object="${b64(JSON.stringify(object))}">${escText(text)}</span>`
  return { html, text, frames: artboards.length, skipped, scriptsDropped }
}

/** Put a clip on the clipboard (the way the Design canvas does: from a copy event, so the HTML isn't rewritten). */
export function writeClip(clip: DesignClip): boolean {
  const el = document.createElement('textarea')
  el.value = ' '
  el.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(el)
  const keep = document.activeElement as HTMLElement | null
  el.select()
  const onCopy = (e: ClipboardEvent): void => {
    e.clipboardData?.setData('text/plain', clip.text)
    e.clipboardData?.setData('text/html', clip.html)
    e.preventDefault()
  }
  document.addEventListener('copy', onCopy, { capture: true, once: true })
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    /* not allowed */
  }
  document.removeEventListener('copy', onCopy, { capture: true })
  el.remove()
  keep?.focus?.({ preventScroll: true })
  return ok
}
