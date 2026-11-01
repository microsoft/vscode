// Serves artifact previews and chat images to the LocalClaude webviews. The desktop app used
// custom protocols (artifact://, lcimg://) for this; VS Code webviews can't register protocols,
// so the same pages come from a small HTTP server on 127.0.0.1 instead.
//
// Only this machine can reach it (loopback only), and every path starts with a random secret,
// so other local pages and programs can't guess the addresses. Artifact pages get a different
// origin from the webview, which keeps them as isolated as the sandboxed artifact:// frames were.
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface ServerRoutes {
  /** The HTML for artifact <sessionId>/<artifactId>/<version>, or null if unknown. */
  artifact(sessionId: string, artifactId: string, version: number, design: boolean): string | null
  /** The page a design shows while Claude is still writing it. */
  draft(): string
  /** Image bytes (and type), optionally scaled down to `width`. */
  image(sessionId: string, imageId: string, width: number): { body: Buffer; type: string } | null
}

const ARTIFACT_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
}

export class LocalServer {
  private server: Server | undefined
  private readonly token = randomBytes(24).toString('hex')
  private port = 0

  constructor(private readonly routes: ServerRoutes) {}

  async start(): Promise<void> {
    if (this.server) return
    const server = createServer((req, res) => this.serve(req, res))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    this.port = (server.address() as AddressInfo).port
    this.server = server
  }

  stop(): void {
    this.server?.close()
    this.server = undefined
  }

  get origin(): string {
    return `http://127.0.0.1:${this.port}`
  }

  get listenPort(): number {
    return this.port
  }

  /** Base address the UI puts in front of artifact/ and img/ paths. */
  get base(): string {
    return `${this.origin}/${this.token}`
  }

  private serve(req: IncomingMessage, res: ServerResponse): void {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return this.fail(res, 405)
      const url = new URL(req.url ?? '/', this.origin)
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (parts.shift() !== this.token) return this.fail(res, 404)
      const kind = parts.shift()
      if (kind === 'draft') return this.send(res, 200, ARTIFACT_HEADERS, this.routes.draft())
      if (kind === 'artifact') {
        const [sessionId, artifactId, version] = parts
        const page = sessionId && artifactId ? this.routes.artifact(sessionId, artifactId, Number(version), url.searchParams.has('design')) : null
        return page === null ? this.fail(res, 404) : this.send(res, 200, ARTIFACT_HEADERS, page)
      }
      if (kind === 'img') {
        const [sessionId, imageId] = parts
        const w = Math.min(2000, Math.max(0, Number(url.searchParams.get('w')) || 0))
        const img = sessionId && imageId ? this.routes.image(sessionId, imageId, w) : null
        if (!img) return this.fail(res, 404)
        return this.send(res, 200, { 'content-type': img.type, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }, img.body)
      }
      this.fail(res, 404)
    } catch {
      this.fail(res, 500)
    }
  }

  private send(res: ServerResponse, status: number, headers: Record<string, string>, body: string | Buffer): void {
    res.writeHead(status, headers)
    res.end(res.req.method === 'HEAD' ? undefined : body)
  }

  private fail(res: ServerResponse, status: number): void {
    res.writeHead(status, { 'content-type': 'text/plain' })
    res.end(status === 404 ? 'Not found' : 'Error')
  }
}
