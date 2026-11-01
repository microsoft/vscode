// Where the UI loads artifact previews and chat images from. The desktop app used the
// artifact:// and lcimg:// protocols; inside VS Code the extension serves the same pages
// from a local address with a secret path (src/host/vscode/server.ts).
import { boot } from './env'

const enc = encodeURIComponent

/** An artifact version as a page (`design` adds the design canvas's comment mode). */
export function artifactUrl(sessionId: string, artifactId: string, version: number, ts: number | string, design = false): string {
  return `${boot.serverBase}/artifact/${enc(sessionId)}/${enc(artifactId)}/${version}?t=${enc(String(ts))}${design ? '&design=1' : ''}`
}

/** The page a design shows while Claude is still writing it. */
export function draftUrl(): string {
  return `${boot.serverBase}/draft/`
}

/** A chat image; `width` asks for a smaller copy. */
export function imageUrl(sessionId: string, imageId: string, width?: number): string {
  return `${boot.serverBase}/img/${enc(sessionId)}/${enc(imageId)}${width ? `?w=${width}` : ''}`
}
