// The page each LocalClaude webview loads: the same React app as the desktop window, with a
// Content-Security-Policy that only lets in the bundled script and styles, and the local server
// (artifact previews, chat images).
import { randomBytes } from 'node:crypto'
import type * as vscode from 'vscode'

export interface Boot {
  /** the host OS, for keyboard hints and paths */
  platform: string
  /** where artifact/ and img/ addresses start (the local server) */
  serverBase: string
  /** the side bar view or an editor tab */
  place: 'sidebar' | 'editor'
}

export function webviewHtml(opts: { webview: vscode.Webview; media: vscode.Uri; serverOrigin: string; serverBase: string; platform: string; place: Boot['place'] }): string {
  const { webview } = opts
  const nonce = randomBytes(16).toString('base64')
  const asset = (name: string): string => webview.asWebviewUri(opts.media.with({ path: `${opts.media.path}/${name}` })).toString()
  const src = webview.cspSource
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src ${src} 'unsafe-inline'`,
    `font-src ${src} data:`,
    `img-src ${src} data: blob: https: ${opts.serverOrigin}`,
    `frame-src ${opts.serverOrigin}`,
    `connect-src ${opts.serverOrigin}`
  ].join('; ')
  const boot: Boot = { platform: opts.platform, serverBase: opts.serverBase, place: opts.place }
  // JSON in a script tag: keep "</script>" and friends from ending it early
  const bootJson = JSON.stringify(boot).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LocalClaude</title>
    <link rel="stylesheet" href="${asset('webview.css')}" />
    <script nonce="${nonce}">window.__lcBoot = ${bootJson}</script>
  </head>
  <body class="in-vscode place-${opts.place}">
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${asset('webview.js')}"></script>
  </body>
</html>`
}
