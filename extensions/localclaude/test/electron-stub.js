export const shell = { openExternal: async () => {} , openPath: async () => ''}
export class BrowserWindow { static getAllWindows() { return [] } }
export const app = { getPath: () => process.env.TEST_DATA, getVersion: () => '0' }
export const safeStorage = { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() }
export const nativeTheme = {}
export const desktopCapturer = { getSources: async () => [] }
export const screen = { getPrimaryDisplay: () => ({ id: 1, size: { width: 1920, height: 1080 }, scaleFactor: 1 }), screenToDipPoint: (p) => p }
export const clipboard = { writeText: () => {} }
export const Menu = { buildFromTemplate: () => ({ popup: () => {} }) }
export const nativeImage = { createFromBuffer: () => ({ isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }), resize: () => ({ toJPEG: () => Buffer.alloc(0) }), toJPEG: () => Buffer.alloc(0) }) }
