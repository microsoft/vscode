// Stands in for `electron` in the webview build: LocalClaude's preload (src/preload/index.ts)
// imports contextBridge, ipcRenderer and webUtils, and they work here on top of VS Code's
// webview messaging. See src/host/vscode/bridge.ts for the other end.

interface VsCodeApi {
  postMessage(msg: unknown): void
}
declare function acquireVsCodeApi(): VsCodeApi

const vscodeApi = acquireVsCodeApi()

// `never`: listeners declare the payload type they expect for their channel
type Listener = (event: unknown, payload: never) => void
const listeners = new Map<string, Set<Listener>>()
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let nextId = 1

window.addEventListener('message', (ev: MessageEvent) => {
  const m = ev.data as { t?: string; id?: number; ok?: boolean; value?: unknown; error?: string; ch?: string; payload?: unknown }
  if (!m || typeof m !== 'object') return
  if (m.t === 'res' && typeof m.id === 'number') {
    const p = pending.get(m.id)
    pending.delete(m.id)
    if (!p) return
    if (m.ok) p.resolve(m.value)
    else p.reject(new Error(m.error ?? 'Request failed'))
  } else if (m.t === 'ev' && typeof m.ch === 'string') {
    for (const fn of listeners.get(m.ch) ?? []) {
      try {
        fn(null, m.payload as never)
      } catch (e) {
        console.error(e)
      }
    }
  }
})

export const ipcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      vscodeApi.postMessage({ t: 'inv', id, ch: channel, args })
    })
  },
  on(channel: string, fn: Listener): void {
    let set = listeners.get(channel)
    if (!set) listeners.set(channel, (set = new Set()))
    set.add(fn)
  },
  removeListener(channel: string, fn: Listener): void {
    listeners.get(channel)?.delete(fn)
  }
}

export const contextBridge = {
  exposeInMainWorld(name: string, value: unknown): void {
    ;(window as unknown as Record<string, unknown>)[name] = value
  }
}

/** Largest file dropped from the OS that is copied over (files from the explorer are used where they are). */
const MAX_DROP_BYTES = 50 * 1024 * 1024

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export const webUtils = {
  /** Webviews don't see where a dropped file lives; use getPathsForDrop instead. */
  getPathForFile(_f: File): string {
    return ''
  },
  /**
   * Paths for what was dropped: files and folders from VS Code's explorer (as URIs), or files
   * from the OS, which are copied to a temporary folder because a webview can't see their path.
   * Reads the drop synchronously first: a DataTransfer is empty once the event is over.
   */
  async getPathsForDrop(dt: DataTransfer | null): Promise<string[]> {
    if (!dt) return []
    const uriText = dt.getData('application/vnd.code.uri-list') || dt.getData('text/uri-list')
    const files = Array.from(dt.files)
    const uris = uriText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
    if (uris.length) return (await ipcRenderer.invoke('files:fromUris', uris)) as string[]
    const small = files.filter((f) => f.size <= MAX_DROP_BYTES)
    if (!small.length) return []
    const payload = await Promise.all(small.map(async (f) => ({ name: f.name, base64: toBase64(await f.arrayBuffer()) })))
    return (await ipcRenderer.invoke('files:saveDropped', payload)) as string[]
  }
}
