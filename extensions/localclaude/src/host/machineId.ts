// Reads the OS machine identifier without extra dependencies.
// Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid (set at OS install)
// Linux:   /etc/machine-id (systemd) or /var/lib/dbus/machine-id
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'

export function readMachineId(): string {
  if (process.platform === 'win32') {
    const out = execFileSync('reg', ['query', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8',
      windowsHide: true
    })
    const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/.exec(out)
    if (m) return m[1].toLowerCase()
    throw new Error('MachineGuid not found')
  }
  if (process.platform === 'darwin') {
    const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' })
    const m = /"IOPlatformUUID" = "([^"]+)"/.exec(out)
    if (m) return m[1]
  }
  for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    if (existsSync(f)) {
      const id = readFileSync(f, 'utf8').trim()
      if (id) return id
    }
  }
  // Last resort (should not happen on normal desktops)
  return 'host:' + hostname()
}
