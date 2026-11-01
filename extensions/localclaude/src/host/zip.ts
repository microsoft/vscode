// Minimal ZIP writer and reader for exports and imports (deflate, UTF-8 names).
// No ZIP64, so archives must stay under 4 GB and 65,535 entries, plenty for chat exports.
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  data: Buffer | string
  mtime?: Date
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  }
}

const UTF8_NAMES = 0x0800

export function createZip(entries: ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error('Too many files for one ZIP archive')
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8')
    const raw = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : e.data
    const deflated = deflateRawSync(raw)
    const method = deflated.length < raw.length ? 8 : 0
    const body = method === 8 ? deflated : raw
    const crc = crc32(raw)
    const { time, date } = dosDateTime(e.mtime ?? new Date())

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(UTF8_NAMES, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    parts.push(local, name, body)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(UTF8_NAMES, 8)
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(time, 12)
    cd.writeUInt16LE(date, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(body.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)

    offset += local.length + name.length + body.length
    if (offset > 0xffffffff) throw new Error('Export is too large for a ZIP archive (over 4 GB)')
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dir, end])
}

/** Read every file in a ZIP archive (folders are skipped). */
export function readZip(buf: Buffer, maxBytes = 1024 * 1024 * 1024): { name: string; data: Buffer }[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out: { name: string; data: Buffer }[] = []
  let total = 0
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The ZIP file is damaged')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
    const raw = buf.subarray(start, start + size)
    if (!name.endsWith('/')) {
      let data: Buffer
      if (method === 0) data = Buffer.from(raw)
      else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(1, maxBytes - total) })
      else throw new Error(`Unsupported compression in ${name}`)
      total += data.length
      out.push({ name, data })
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}
