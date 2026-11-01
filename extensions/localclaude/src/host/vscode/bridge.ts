// The IPC layer between LocalClaude's UI (running in VS Code webviews) and its main logic (running
// in the extension host). It mirrors Electron's ipcMain.handle / webContents.send, so the handlers
// are the same ones the desktop app registers.
//
// Webview -> host: { t: 'inv', id, ch, args }   answered with { t: 'res', id, ok, value | error }
// Host -> webview: { t: 'ev', ch, payload }
import * as vscode from 'vscode'
import type { WindowLike } from './electronShim'

type Handler = (...args: never[]) => unknown

interface InvokeMessage {
  t: 'inv'
  id: number
  ch: string
  args: unknown[]
}

export class Bridge {
  private handlers = new Map<string, Handler>()
  private webviews = new Set<vscode.Webview>()
  private lastActive: vscode.Webview | undefined
  /** Views whose app has said it's listening ('app:ready'), and what waits for the others. */
  private readyViews = new Set<vscode.Webview>()
  private queued = new Map<vscode.Webview, { ch: string; payload: unknown }[]>()

  handle(channel: string, fn: Handler): void {
    if (this.handlers.has(channel)) throw new Error(`Duplicate handler for ${channel}`)
    this.handlers.set(channel, fn)
  }

  /** Connect a webview; returns a disposable that disconnects it. */
  attach(webview: vscode.Webview): vscode.Disposable {
    this.webviews.add(webview)
    this.lastActive = webview
    const sub = webview.onDidReceiveMessage((m: unknown) => {
      if (!m || typeof m !== 'object') return
      const msg = m as Partial<InvokeMessage> & { t?: string }
      if (msg.t === 'inv' && typeof msg.id === 'number' && typeof msg.ch === 'string') {
        this.lastActive = webview
        if (msg.ch === 'app:ready') this.markReady(webview)
        void this.invoke(webview, msg as InvokeMessage)
      }
    })
    return new vscode.Disposable(() => {
      sub.dispose()
      this.webviews.delete(webview)
      this.readyViews.delete(webview)
      this.queued.delete(webview)
      if (this.lastActive === webview) this.lastActive = [...this.webviews].pop()
    })
  }

  private markReady(webview: vscode.Webview): void {
    this.readyViews.add(webview)
    const waiting = this.queued.get(webview) ?? []
    this.queued.delete(webview)
    for (const m of waiting) this.sendTo(webview, m.ch, m.payload)
  }

  private async invoke(webview: vscode.Webview, msg: InvokeMessage): Promise<void> {
    const fn = msg.ch === 'app:ready' ? () => undefined : this.handlers.get(msg.ch)
    let reply: Record<string, unknown>
    if (!fn) reply = { t: 'res', id: msg.id, ok: false, error: `No handler for ${msg.ch}` }
    else {
      try {
        const value = await (fn as (...a: unknown[]) => unknown)(...(Array.isArray(msg.args) ? msg.args : []))
        reply = { t: 'res', id: msg.id, ok: true, value }
      } catch (e) {
        reply = { t: 'res', id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
    try {
      await webview.postMessage(reply)
    } catch {
      /* the view was closed while the call ran */
    }
  }

  /** Like webContents.send: to every connected LocalClaude view. */
  send(channel: string, payload: unknown): void {
    for (const w of this.webviews) void w.postMessage({ t: 'ev', ch: channel, payload }).then(undefined, () => {})
  }

  /** To one view only (the one the user is looking at). */
  sendTo(webview: vscode.Webview | undefined, channel: string, payload: unknown): void {
    if (webview) void webview.postMessage({ t: 'ev', ch: channel, payload }).then(undefined, () => {})
  }

  /** To one view, as soon as its app is listening (a view that was just opened is still loading). */
  sendWhenReady(webview: vscode.Webview | undefined, channel: string, payload: unknown): void {
    if (!webview) return
    if (this.readyViews.has(webview)) return this.sendTo(webview, channel, payload)
    const list = this.queued.get(webview) ?? []
    list.push({ ch: channel, payload })
    this.queued.set(webview, list)
  }

  get active(): vscode.Webview | undefined {
    return this.lastActive
  }

  get connected(): boolean {
    return this.webviews.size > 0
  }

  /** A stand-in "window" for modules written against Electron's BrowserWindow (sign-in). */
  windowLike(): WindowLike {
    return {
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => this.send(channel, payload) }
    }
  }
}
