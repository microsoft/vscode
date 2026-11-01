// Images in chats: what you attach and what tools return (screenshots, image files Claude reads).
// The bytes are saved encrypted next to the chat; the chat history only keeps a small ImageRef,
// and the app shows them through lcimg://chat/<chat id>/<image id> (?w=480 for a thumbnail).
import { nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ChatMessage, ImageRef } from '../shared/types'

export const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

export interface ImageStore {
  saveImage(sessionId: string, id: string, data: Buffer): void
  loadImage(sessionId: string, id: string): Buffer | null
}

/** What the bytes really are (whatever the file or tool claimed). */
export function sniffImageType(b: Buffer): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 10 && b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif'
  if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Pixel size from the file header, so the chat can reserve space before the image loads. */
export function imageSize(b: Buffer, type = sniffImageType(b)): { width: number; height: number } | undefined {
  try {
    if (type === 'image/png' && b.length >= 24) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
    if (type === 'image/gif') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
    if (type === 'image/webp') {
      const chunk = b.toString('ascii', 12, 16)
      if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
      if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
      if (chunk === 'VP8L') {
        const bits = b.readUInt32LE(21)
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }
      }
    }
    if (type === 'image/jpeg') {
      // walk the segments to the frame header (SOF0..SOF15 except DHT/JPG/DAC)
      let i = 2
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return undefined
        const marker = b[i + 1]
        if (marker === 0xff) {
          i++
          continue
        }
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
          return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
        i += 2 + b.readUInt16BE(i + 2)
      }
    }
  } catch {
    /* truncated header */
  }
  return undefined
}

/** Save an image with a chat. Returns null for anything that isn't a PNG, JPEG, GIF or WebP. */
export function storeImage(store: ImageStore, sessionId: string, data: Buffer): ImageRef | null {
  const type = sniffImageType(data)
  if (!type) return null
  const id = randomUUID()
  store.saveImage(sessionId, id, data)
  const size = imageSize(data, type)
  return { id, mediaType: type, ...(size && size.width > 0 && size.height > 0 ? size : {}) }
}

/** Images in a tool result (the API's base64 blocks, or MCP's {data, mimeType}). */
export function resultImages(content: unknown): Buffer[] {
  if (!Array.isArray(content)) return []
  const out: Buffer[] = []
  for (const c of content as Record<string, unknown>[]) {
    if (c?.type !== 'image') continue
    const src = c.source as { type?: string; data?: unknown } | undefined
    const data = src?.type === 'base64' ? src.data : c.data
    if (typeof data === 'string' && data) out.push(Buffer.from(data, 'base64'))
  }
  return out
}

/** Every image a chat's history points to. */
export function referencedImages(history: ChatMessage[]): ImageRef[] {
  const out: ImageRef[] = []
  for (const m of history) {
    if (m.imageRefs) out.push(...m.imageRefs)
    for (const p of m.parts) if (p.kind === 'tool' && p.images) out.push(...p.images)
  }
  return out
}

// ---------------------------------------------------------------- thumbnails (main process only)
const thumbs = new Map<string, Buffer>()
const THUMB_CACHE = 300

/** A smaller copy for the chat (PNG and JPEG; other types are shown as they are). Cached. */
export function thumbnail(data: Buffer, width: number, key: string): Buffer {
  const type = sniffImageType(data)
  const size = imageSize(data, type)
  if ((type !== 'image/png' && type !== 'image/jpeg') || !size || size.width <= width * 1.25) return data
  const k = `${key}@${width}`
  const hit = thumbs.get(k)
  if (hit) {
    thumbs.delete(k)
    thumbs.set(k, hit)
    return hit
  }
  let out = data
  try {
    const img = nativeImage.createFromBuffer(data)
    if (!img.isEmpty()) {
      const small = img.resize({ width, quality: 'good' })
      out = type === 'image/jpeg' ? small.toJPEG(85) : small.toPNG()
    }
  } catch {
    /* serve the original */
  }
  thumbs.set(k, out)
  if (thumbs.size > THUMB_CACHE) thumbs.delete(thumbs.keys().next().value!)
  return out
}
