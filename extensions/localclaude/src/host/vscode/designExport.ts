// Exports designs as PDF or PNG inside VS Code. The desktop app rendered pages in a hidden
// Electron window; an extension can't open one, so the page is rendered by a Chromium-based
// browser already on this computer (Edge, Chrome, Chromium or Brave) running headless, driven over
// the DevTools protocol. Same steps as before: load, wait for fonts, then print or capture.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Chromium can't capture taller images than this in one go. */
const MAX_PNG_PX = 16000

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let configuredBrowser = ''
/** From the localclaude.browserPath setting. */
export function setBrowserPath(p: string): void {
  configuredBrowser = p.trim()
}

function onPath(names: string[]): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const n of names) {
      const p = join(dir, n)
      if (dir && existsSync(p)) return p
    }
  }
  return undefined
}

/** A Chromium-based browser to render with, or undefined if none is installed. */
export function findBrowser(): string | undefined {
  for (const p of [configuredBrowser, process.env.LOCALCLAUDE_BROWSER ?? '']) if (p && existsSync(p)) return p
  if (process.platform === 'win32') {
    const roots = [process.env['PROGRAMFILES(X86)'], process.env.PROGRAMFILES, process.env.LOCALAPPDATA].filter((r): r is string => !!r)
    const rel = ['Microsoft\\Edge\\Application\\msedge.exe', 'Google\\Chrome\\Application\\chrome.exe', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe', 'Chromium\\Application\\chrome.exe']
    for (const r of rel) for (const root of roots) if (existsSync(join(root, r))) return join(root, r)
    return undefined
  }
  if (process.platform === 'darwin') {
    const apps = ['Google Chrome', 'Microsoft Edge', 'Chromium', 'Brave Browser']
    for (const a of apps) {
      const p = `/Applications/${a}.app/Contents/MacOS/${a}`
      if (existsSync(p)) return p
    }
    return undefined
  }
  return onPath(['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge-stable', 'microsoft-edge', 'brave-browser']) ?? (existsSync('/snap/bin/chromium') ? '/snap/bin/chromium' : undefined)
}

const NO_BROWSER =
  'PDF and PNG export needs Microsoft Edge, Google Chrome, Chromium or Brave on this computer. Install one, or set "localclaude.browserPath" in VS Code settings to its program file.'

type CdpResult = Record<string, unknown>

/** A minimal DevTools protocol client over one WebSocket, with flat target sessions. */
class Cdp {
  private nextId = 1
  private pending = new Map<number, { resolve: (v: CdpResult) => void; reject: (e: Error) => void }>()
  private listeners = new Set<(method: string, params: CdpResult, sessionId?: string) => void>()

  private constructor(private ws: WebSocket) {
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: CdpResult; error?: { message: string }; method?: string; params?: CdpResult; sessionId?: string }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) p?.reject(new Error(msg.error.message))
        else p?.resolve(msg.result ?? {})
      } else if (msg.method) for (const l of this.listeners) l(msg.method, msg.params ?? {}, msg.sessionId)
    })
    ws.addEventListener('close', () => {
      for (const p of this.pending.values()) p.reject(new Error('The browser closed the connection.'))
      this.pending.clear()
    })
  }

  static connect(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.addEventListener('open', () => resolve(new Cdp(ws)), { once: true })
      ws.addEventListener('error', () => reject(new Error('Could not connect to the browser.')), { once: true })
    })
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<CdpResult> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  once(method: string, sessionId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(t)
        this.listeners.delete(l)
        resolve()
      }
      const l = (m: string, _p: CdpResult, s?: string): void => {
        if (m === method && s === sessionId) done()
      }
      const t = setTimeout(done, timeoutMs)
      this.listeners.add(l)
    })
  }

  close(): void {
    try {
      this.ws.close()
    } catch {
      /* already closed */
    }
  }
}

function launch(bin: string, profile: string): Promise<{ proc: ChildProcess; endpoint: string }> {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--hide-scrollbars',
    '--mute-audio',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank'
  ]
  // Chromium refuses to start its sandbox as root (containers, some Linux setups)
  if (typeof process.getuid === 'function' && process.getuid() === 0) args.unshift('--no-sandbox')
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let err = ''
    const t = setTimeout(() => {
      proc.kill()
      reject(new Error('The browser did not start in time.'))
    }, 20_000)
    proc.stderr!.on('data', (d: Buffer) => {
      err += d.toString()
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err)
      if (m) {
        clearTimeout(t)
        resolve({ proc, endpoint: m[1] })
      }
    })
    proc.on('error', (e) => {
      clearTimeout(t)
      reject(e)
    })
    proc.on('exit', (code) => {
      clearTimeout(t)
      reject(new Error(`The browser exited (${code}) before it was ready. ${err.trim().split('\n').pop() ?? ''}`))
    })
  })
}

interface Page {
  cdp: Cdp
  session: string
  setSize(width: number, height: number, scale: number): Promise<void>
  evaluate<T>(expression: string): Promise<T>
}

/** Render a page in a headless browser tab of this size, then hand the tab to `use`. */
async function rendered<T>(html: string, size: { width: number; height: number }, use: (page: Page) => Promise<T>): Promise<T> {
  const bin = findBrowser()
  if (!bin) throw new Error(NO_BROWSER)
  const dir = join(tmpdir(), 'localclaude-design-export')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, randomUUID() + '.html')
  writeFileSync(file, html)
  const profile = mkdtempSync(join(tmpdir(), 'localclaude-browser-'))
  let proc: ChildProcess | undefined
  let cdp: Cdp | undefined
  try {
    const started = await launch(bin, profile)
    proc = started.proc
    cdp = await Cdp.connect(started.endpoint)
    const { targetId } = (await cdp.send('Target.createTarget', { url: 'about:blank' })) as { targetId: string }
    const { sessionId } = (await cdp.send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string }
    const c = cdp
    const page: Page = {
      cdp: c,
      session: sessionId,
      setSize: async (width, height, scale) => {
        await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId)
      },
      evaluate: async <R>(expression: string): Promise<R> => {
        const r = (await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)) as { result?: { value?: R } }
        return r.result?.value as R
      }
    }
    await c.send('Page.enable', {}, sessionId)
    await page.setSize(size.width, size.height, 1)
    const loaded = c.once('Page.loadEventFired', sessionId, 20_000)
    await c.send('Page.navigate', { url: pathToFileURL(file).href }, sessionId)
    await loaded
    // scripts, images and web fonts (also in frames), but not forever
    const fonts = `Promise.all([document, ...[...document.querySelectorAll('iframe')].map((f) => { try { return f.contentDocument } catch { return null } })].filter(Boolean).map((d) => d.fonts.ready)).then(() => true)`
    await Promise.race([page.evaluate(fonts), sleep(5_000)]).catch(() => {})
    // animations and late layout settle
    await sleep(400)
    return await use(page)
  } finally {
    cdp?.close()
    proc?.kill()
    rmSync(file, { force: true })
    // the browser may still hold files for a moment
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 2_000)
  }
}

const b64 = (r: CdpResult): Buffer => Buffer.from(String(r.data ?? ''), 'base64')

/**
 * One page as PDF or PNG. `exact`: a frame with a fixed size (a phone screen, a slide), exported at exactly
 * width × height; otherwise a PNG is the whole page (at least `height` tall) and a PDF follows the page's own print size.
 */
export async function exportDesign(page: string, opts: { format: 'pdf' | 'png'; width: number; height?: number; slides?: boolean; exact?: boolean }): Promise<Buffer> {
  if (opts.format === 'pdf' && opts.exact && opts.height) return exportFramesPdf([{ html: page, width: opts.width, height: opts.height }])
  return rendered(page, { width: opts.width, height: opts.height || 900 }, async (p) => {
    if (opts.format === 'pdf') {
      // slides are 1920×1080 px; other pages say their size in CSS, or get A4
      const paper = opts.slides ? { paperWidth: 20, paperHeight: 11.25 } : { paperWidth: 8.27, paperHeight: 11.69 }
      return b64(await p.cdp.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, ...paper, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 }, p.session))
    }
    let height = opts.height || 900
    if (!opts.exact) {
      // the whole page (or the screen, when the page is shorter)
      const [pageH, screenH] = await p.evaluate<number[]>('[Math.ceil(document.documentElement.scrollHeight), innerHeight]')
      height = pageH > screenH + 1 ? pageH : height
    }
    height = Math.max(64, Math.min(MAX_PNG_PX, height))
    // twice the pixels when it fits
    const scale = height * 2 <= MAX_PNG_PX ? 2 : 1
    await p.setSize(opts.width, height, scale)
    await sleep(500)
    return b64(await p.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: opts.width, height, scale: 1 } }, p.session))
  })
}

const attr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** Several frames as one PDF, a page per frame at the frame's size (a deck's slides, a set of screens). */
export async function exportFramesPdf(pages: { html: string; width: number; height: number }[]): Promise<Buffer> {
  const css = pages.map((p, i) => `@page f${i}{size:${p.width}px ${p.height}px;margin:0}`).join('')
  const doc =
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}html,body{margin:0}iframe{display:block;border:0}iframe:not(:last-child){break-after:page}</style></head><body>` +
    pages.map((p, i) => `<iframe style="width:${p.width}px;height:${p.height}px;page:f${i}" srcdoc="${attr(p.html)}"></iframe>`).join('') +
    '</body></html>'
  const width = Math.max(...pages.map((p) => p.width))
  return rendered(doc, { width, height: 900 }, async (p) =>
    b64(await p.cdp.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 }, p.session))
  )
}
