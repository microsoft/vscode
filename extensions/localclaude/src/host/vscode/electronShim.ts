// Stands in for the `electron` module when LocalClaude runs inside VS Code (esbuild aliases
// `electron` to this file). The LocalClaude modules keep importing what they always did; only the
// parts they use exist here, mapped to VS Code and Node. Anything that needs a real Electron
// window (screen capture, offscreen rendering) throws, and the callers either avoid it inside
// VS Code or have a VS Code version of their own.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import * as vscode from 'vscode'

let userData = ''
/** Key from VS Code's SecretStorage (the OS keychain), so vault files get a second, OS-held layer like Electron safeStorage. */
let keychainKey: Buffer | null = null
let backendName = 'none'
let version = '0.0.0'

const SECRET_NAME = 'localclaude.vaultKey'
/** How long the first start waits for the OS keychain (Linux without a keyring can take minutes to give up). */
const FIRST_TRY_MS = 10_000

const keychainName = (): string => (process.platform === 'win32' ? 'dpapi (VS Code)' : process.platform === 'darwin' ? 'keychain (VS Code)' : 'keyring (VS Code)')

function timeout<T>(p: Thenable<T>, ms: number): Promise<T> {
  return Promise.race([Promise.resolve(p), new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))])
}

/**
 * Must run before any LocalClaude module asks for paths or encryption.
 *
 * Whether the vault uses the OS keychain layer is decided once, on the first start, and kept in
 * keychain.json: data written with the keychain layer can only be read with it, so it must never
 * depend on whether the keychain happens to answer quickly on a later start.
 */
export async function initShim(context: vscode.ExtensionContext): Promise<void> {
  userData = context.globalStorageUri.fsPath
  version = String((context.extension.packageJSON as { version?: string }).version ?? version)
  mkdirSync(userData, { recursive: true })
  const marker = join(userData, 'keychain.json')
  let decided: boolean | undefined
  try {
    if (existsSync(marker)) decided = (JSON.parse(readFileSync(marker, 'utf8')) as { use?: boolean }).use
  } catch {
    decided = undefined
  }
  if (decided === false) return

  try {
    // first start: give the keychain a while; after that it already answered once, so wait for it
    const get = context.secrets.get(SECRET_NAME)
    let b64 = decided === undefined ? await timeout(get, FIRST_TRY_MS) : await get
    if (!b64) {
      if (decided === true) throw new Error('The vault key is missing from the OS keychain.')
      b64 = randomBytes(32).toString('base64')
      await timeout(context.secrets.store(SECRET_NAME, b64), FIRST_TRY_MS)
    }
    const key = Buffer.from(b64, 'base64')
    if (key.length !== 32) throw new Error('The vault key in the OS keychain is damaged.')
    keychainKey = key
    backendName = keychainName()
    if (decided === undefined) writeFileSync(marker, JSON.stringify({ use: true }))
  } catch (e) {
    keychainKey = null
    backendName = 'none'
    // no keychain on this machine: use the machine-bound encryption only, from now on
    if (decided === undefined) writeFileSync(marker, JSON.stringify({ use: false }))
    // the keychain held the key before: the vault can't be opened without it; the store reports that as a lock
    else console.warn('LocalClaude: OS keychain unavailable:', e)
  }
}

function folder(name: string): string {
  const home = homedir()
  return join(home, name)
}

export const app = {
  getPath(name: string): string {
    switch (name) {
      case 'userData':
        return userData || join(tmpdir(), 'localclaude')
      case 'home':
        return homedir()
      case 'temp':
        return tmpdir()
      case 'downloads':
        return folder('Downloads')
      case 'documents':
        return folder('Documents')
      default:
        return userData
    }
  },
  getVersion: (): string => version,
  getName: (): string => 'LocalClaude'
}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => keychainKey !== null,
  getSelectedStorageBackend: (): string => backendName,
  encryptString(plain: string): Buffer {
    if (!keychainKey) throw new Error('OS keychain encryption is not available')
    const iv = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', keychainKey, iv)
    const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
    return Buffer.concat([iv, c.getAuthTag(), body])
  },
  decryptString(buf: Buffer): string {
    if (!keychainKey) throw new Error('OS keychain encryption is not available')
    const d = createDecipheriv('aes-256-gcm', keychainKey, buf.subarray(0, 12))
    d.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
  }
}

export const shell = {
  async openExternal(url: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(url, true))
  },
  /** Opens a file or folder with the OS default app, like Electron's shell.openPath; returns '' on success. */
  async openPath(p: string): Promise<string> {
    try {
      await vscode.env.openExternal(vscode.Uri.file(p))
      return ''
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },
  showItemInFolder(p: string): void {
    void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p))
  }
}

/** The parts of Electron's NativeImage that LocalClaude uses. */
export interface NativeImageLike {
  isEmpty(): boolean
  getSize(): { width: number; height: number }
  resize(opts: { width?: number; height?: number; quality?: string }): NativeImageLike
  toPNG(): Buffer
  toJPEG(quality: number): Buffer
}

/** No image codec without Electron: an empty image, so callers serve the original bytes (no thumbnails). */
function emptyImage(): NativeImageLike {
  const img: NativeImageLike = {
    isEmpty: () => true,
    getSize: () => ({ width: 0, height: 0 }),
    resize: () => img,
    toPNG: () => Buffer.alloc(0),
    toJPEG: () => Buffer.alloc(0)
  }
  return img
}

export const nativeImage = {
  createFromBuffer: (_data: Buffer): NativeImageLike => emptyImage(),
  createFromBitmap: (_data: Buffer, _opts: { width: number; height: number }): NativeImageLike => emptyImage()
}

const NO_SCREEN = 'Computer use is not available inside VS Code: Claude would be able to click VS Code itself, including its own permission prompts.'

export const desktopCapturer = {
  getSources: async (_opts: { types: string[]; thumbnailSize?: { width: number; height: number } }): Promise<{ display_id: string; thumbnail: NativeImageLike }[]> => {
    throw new Error(NO_SCREEN)
  }
}

interface Display {
  id: number
  size: { width: number; height: number }
  scaleFactor: number
}

export const screen = {
  getPrimaryDisplay(): Display {
    throw new Error(NO_SCREEN)
  },
  screenToDipPoint(_p: { x: number; y: number }): { x: number; y: number } {
    throw new Error(NO_SCREEN)
  }
}

/**
 * The few modules that talk to "the window" (sign-in progress) get a stand-in whose
 * webContents.send() reaches every LocalClaude webview. See bridge.ts.
 */
export interface WindowLike {
  isDestroyed(): boolean
  webContents: { send(channel: string, payload?: unknown): void }
}

export class BrowserWindow {
  static getAllWindows(): BrowserWindow[] {
    return []
  }
  isDestroyed(): boolean {
    return true
  }
  isVisible(): boolean {
    return false
  }
  isMinimized(): boolean {
    return true
  }
  isFocused(): boolean {
    return false
  }
  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  webContents = { send: (_channel: string, _payload?: unknown): void => {} }
  constructor() {
    throw new Error('LocalClaude cannot open Electron windows inside VS Code.')
  }
}
