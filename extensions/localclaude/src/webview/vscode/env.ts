// Runs before the app: what's different about living in a VS Code webview.
//  - "System" theme follows VS Code's color theme (VS Code puts vscode-dark / vscode-light on <body>).
//  - Addresses for artifact previews and chat images point at the local server (see urls.ts).

export interface Boot {
  platform: string
  serverBase: string
  place: 'sidebar' | 'editor'
}

declare global {
  interface Window {
    __lcBoot: Boot
  }
}

export const boot: Boot = window.__lcBoot ?? { platform: 'linux', serverBase: '', place: 'sidebar' }

function vscodeIsDark(): boolean {
  const c = document.body.classList
  return c.contains('vscode-dark') || (c.contains('vscode-high-contrast') && !c.contains('vscode-high-contrast-light'))
}

/** A MediaQueryList for "(prefers-color-scheme: dark)" that tracks VS Code's theme instead of the OS. */
function themeQuery(query: string): MediaQueryList {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  let matches = vscodeIsDark()
  const mql = {
    media: query,
    get matches() {
      return matches
    },
    onchange: null as ((e: MediaQueryListEvent) => void) | null,
    addEventListener: (_t: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_t: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
    addListener: (fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeListener: (fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
    dispatchEvent: () => true
  }
  new MutationObserver(() => {
    const now = vscodeIsDark()
    if (now === matches) return
    matches = now
    const ev = { matches, media: query } as MediaQueryListEvent
    for (const fn of listeners) fn(ev)
    mql.onchange?.(ev)
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] })
  return mql as unknown as MediaQueryList
}

const nativeMatchMedia = window.matchMedia.bind(window)
window.matchMedia = (query: string): MediaQueryList => (/prefers-color-scheme:\s*dark/.test(query) ? themeQuery(query) : nativeMatchMedia(query))
