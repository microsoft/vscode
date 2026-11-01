// Password-protected backups of everything: chats with their images, projects, memory and artifacts.
// LocalClaude's own data only opens on this machine; a backup opens on any computer with your password.
//
// A .lcbackup file is "LCBK1\n" + salt + iv + GCM tag + AES-256-GCM(ZIP), with the key derived from
// your password by scrypt. The ZIP holds the same localclaude-backup.json and images/ an export has,
// so restoring goes through the normal import.
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildBackup } from './exporter'
import { IMAGE_EXT, referencedImages } from './images'
import type { SecureStore } from './store'
import { createZip, type ZipEntry } from './zip'

export const BACKUP_EXT = 'lcbackup'
export const MIN_PASSWORD = 8
const MAGIC = Buffer.from('LCBK1\n')
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

type Store = Parameters<typeof buildBackup>[0] & Pick<SecureStore, 'loadImage'>

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password.normalize('NFC'), salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))))
}

export function isEncryptedBackup(buf: Buffer): boolean {
  return buf.length > MAGIC.length + 44 && buf.subarray(0, MAGIC.length).equals(MAGIC)
}

export async function encryptBackup(data: Buffer, password: string): Promise<Buffer> {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', await deriveKey(password, salt), iv)
  const body = Buffer.concat([c.update(data), c.final()])
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body])
}

export async function decryptBackup(buf: Buffer, password: string): Promise<Buffer> {
  if (!isEncryptedBackup(buf)) throw new Error('This is not a LocalClaude backup.')
  let o = MAGIC.length
  const salt = buf.subarray(o, (o += 16))
  const iv = buf.subarray(o, (o += 12))
  const tag = buf.subarray(o, (o += 16))
  const d = createDecipheriv('aes-256-gcm', await deriveKey(password, salt), iv)
  d.setAuthTag(tag)
  try {
    return Buffer.concat([d.update(buf.subarray(o)), d.final()])
  } catch {
    throw new Error('Wrong password, or the backup file is damaged.')
  }
}

/** The ZIP inside a backup: the backup JSON and every image the chats point to. */
export function backupZip(store: Store): Buffer {
  const backup = buildBackup(store, {})
  const entries: ZipEntry[] = [{ name: 'localclaude-backup.json', data: JSON.stringify(backup) }]
  const added = new Set<string>()
  for (const s of backup.sessions)
    for (const img of referencedImages(s.history)) {
      if (added.has(img.id)) continue
      const data = store.loadImage(s.meta.id, img.id)
      if (!data) continue
      added.add(img.id)
      entries.push({ name: `images/${img.id}.${IMAGE_EXT[img.mediaType] ?? 'png'}`, data })
    }
  return createZip(entries)
}

export async function createBackup(store: Store, password: string): Promise<Buffer> {
  return encryptBackup(backupZip(store), password)
}

// ---------------------------------------------------------------- automatic backups
const pad = (n: number): string => String(n).padStart(2, '0')
/** "LocalClaude backup 2026-10-06 2130.lcbackup": sorts by date, and only these files get cleaned up. */
export function backupFileName(d = new Date()): string {
  return `LocalClaude backup ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}.${BACKUP_EXT}`
}
const AUTO_NAME = /^LocalClaude backup (\d{4}-\d\d-\d\d \d{4})(?: \((\d+)\))?\.lcbackup$/
/** date, then the (2), (3)… of backups made in the same minute */
const autoKey = (f: string): string => {
  const m = AUTO_NAME.exec(f)!
  return m[1] + String(Number(m[2] ?? 1)).padStart(4, '0')
}

const INTERVAL = { daily: 24 * 3600_000, weekly: 7 * 24 * 3600_000 }
/** Whether an automatic backup is due (a little early is fine: the app may not run at the exact hour). */
export function backupDue(lastAt: number | undefined, every: keyof typeof INTERVAL, now = Date.now()): boolean {
  return !lastAt || now - lastAt >= INTERVAL[every] - 3600_000
}

/** Delete the oldest automatic backups in `dir`, keeping the newest `keep`. Other files are never touched. */
export function pruneBackups(dir: string, keep: number): string[] {
  const ours = readdirSync(dir)
    .filter((f) => AUTO_NAME.test(f))
    .sort((a, b) => autoKey(b).localeCompare(autoKey(a)))
  const old = ours.slice(Math.max(1, keep))
  for (const f of old) rmSync(join(dir, f), { force: true })
  return old
}

/** Write a backup into `dir` (for automatic backups) and clean up old ones. */
export async function writeBackupTo(store: Store, dir: string, password: string, keep: number, now = new Date()): Promise<{ path: string; size: number }> {
  mkdirSync(dir, { recursive: true })
  const data = await createBackup(store, password)
  let path = join(dir, backupFileName(now))
  for (let n = 2; existsSync(path); n++) path = join(dir, backupFileName(now).replace(/\.lcbackup$/, ` (${n}).lcbackup`))
  // write next to it first, so a half-written backup never replaces a good one
  writeFileSync(path + '.tmp', data)
  renameSync(path + '.tmp', path)
  pruneBackups(dir, keep)
  return { path, size: data.length }
}
