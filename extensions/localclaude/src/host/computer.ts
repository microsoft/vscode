// Computer use: an in-process MCP tool that lets Claude see the primary screen
// and drive the mouse and keyboard, like the Claude desktop app's computer use.
// Screenshots come from Electron's desktopCapturer. Input goes through a
// long-lived PowerShell helper calling user32 SendInput on Windows, and
// xdotool on Linux (X11).
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { BrowserWindow, desktopCapturer, screen } from 'electron'
import { ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process'
import { z } from 'zod'

/** Screenshots are scaled to fit this box; Claude clicks in screenshot pixels. */
const MAX_W = 1280
const MAX_H = 800
const SETTLE_MS = 450

// ---------------------------------------------------------------- Windows input helper
const WIN_HELPER_CS = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class LcInput {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] static extern short VkKeyScan(char c);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  static readonly Dictionary<string, ushort> Keys = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase) {
    {"ctrl",0x11},{"control",0x11},{"alt",0x12},{"shift",0x10},{"super",0x5B},{"win",0x5B},{"windows",0x5B},{"meta",0x5B},{"cmd",0x5B},
    {"return",0x0D},{"enter",0x0D},{"kp_enter",0x0D},{"tab",0x09},{"escape",0x1B},{"esc",0x1B},{"backspace",0x08},{"delete",0x2E},{"del",0x2E},
    {"insert",0x2D},{"home",0x24},{"end",0x23},{"page_up",0x21},{"pageup",0x21},{"prior",0x21},{"page_down",0x22},{"pagedown",0x22},{"next",0x22},
    {"up",0x26},{"down",0x28},{"left",0x25},{"right",0x27},{"space",0x20},{"menu",0x5D},{"caps_lock",0x14},{"print",0x2C},
    {"minus",0xBD},{"plus",0xBB},{"equal",0xBB},{"comma",0xBC},{"period",0xBE},{"slash",0xBF},{"semicolon",0xBA},{"apostrophe",0xDE},
    {"bracketleft",0xDB},{"bracketright",0xDD},{"backslash",0xDC},{"grave",0xC0},
    {"audiovolumeup",0xAF},{"audiovolumedown",0xAE},{"audiomute",0xAD}
  };

  static LcInput() {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { try { SetProcessDPIAware(); } catch {} }
  }

  static void Send(params INPUT[] inputs) {
    if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length)
      throw new Exception("SendInput was blocked (is an elevated window in front?)");
  }
  static INPUT Mouse(uint flags, uint data) { var i = new INPUT { type = 0 }; i.u.mi.dwFlags = flags; i.u.mi.mouseData = data; return i; }
  static INPUT Key(ushort vk, bool up) { var i = new INPUT { type = 1 }; i.u.ki.wVk = vk; i.u.ki.dwFlags = up ? 2u : 0u; return i; }
  static INPUT Uni(char c, bool up) { var i = new INPUT { type = 1 }; i.u.ki.wScan = c; i.u.ki.dwFlags = 4u | (up ? 2u : 0u); return i; }

  static void Move(int x, int y) { SetCursorPos(x, y); Thread.Sleep(30); }
  static uint Down(string b) { return b == "right" ? 0x0008u : b == "middle" ? 0x0020u : 0x0002u; }
  static uint Up(string b) { return b == "right" ? 0x0010u : b == "middle" ? 0x0040u : 0x0004u; }

  static ushort Vk(string name) {
    ushort vk;
    if (Keys.TryGetValue(name, out vk)) return vk;
    if (name.Length > 1 && (name[0] == 'F' || name[0] == 'f')) { int n; if (int.TryParse(name.Substring(1), out n) && n >= 1 && n <= 24) return (ushort)(0x6F + n); }
    if (name.Length == 1) {
      char c = name[0];
      if (c >= 'a' && c <= 'z') return (ushort)char.ToUpperInvariant(c);
      if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return (ushort)c;
      short s = VkKeyScan(c); if (s != -1) return (ushort)(s & 0xFF);
    }
    throw new Exception("Unknown key: " + name);
  }

  static void Combo(string combo) {
    var parts = combo.Split('+');
    var vks = new List<ushort>();
    foreach (var p in parts) if (p.Length > 0) vks.Add(Vk(p.Trim()));
    if (combo.EndsWith("+")) vks.Add(Vk("plus"));
    foreach (var v in vks) Send(Key(v, false));
    for (int i = vks.Count - 1; i >= 0; i--) Send(Key(vks[i], true));
  }

  public static string Run(string line) {
    var a = line.Split('|');
    switch (a[0]) {
      case "move": Move(int.Parse(a[1]), int.Parse(a[2])); return "";
      case "click": {
        Move(int.Parse(a[1]), int.Parse(a[2]));
        int n = int.Parse(a[4]);
        for (int i = 0; i < n; i++) { Send(Mouse(Down(a[3]), 0), Mouse(Up(a[3]), 0)); Thread.Sleep(40); }
        return "";
      }
      case "press": Move(int.Parse(a[1]), int.Parse(a[2])); Send(Mouse(Down("left"), 0)); return "";
      case "release": Move(int.Parse(a[1]), int.Parse(a[2])); Send(Mouse(Up("left"), 0)); return "";
      case "drag": {
        int x1 = int.Parse(a[1]), y1 = int.Parse(a[2]), x2 = int.Parse(a[3]), y2 = int.Parse(a[4]);
        Move(x1, y1); Send(Mouse(Down("left"), 0));
        for (int i = 1; i <= 12; i++) { SetCursorPos(x1 + (x2 - x1) * i / 12, y1 + (y2 - y1) * i / 12); Thread.Sleep(15); }
        Send(Mouse(Up("left"), 0)); return "";
      }
      case "scroll": {
        Move(int.Parse(a[1]), int.Parse(a[2]));
        int dx = int.Parse(a[3]), dy = int.Parse(a[4]);
        if (dy != 0) Send(Mouse(0x0800u, unchecked((uint)(-dy * 120))));
        if (dx != 0) Send(Mouse(0x01000u, unchecked((uint)(dx * 120))));
        return "";
      }
      case "type": {
        string text = Encoding.UTF8.GetString(Convert.FromBase64String(a[1]));
        foreach (char c in text.Replace("\r\n", "\n")) {
          if (c == '\n') { Send(Key(0x0D, false), Key(0x0D, true)); }
          else if (c == '\t') { Send(Key(0x09, false), Key(0x09, true)); }
          else Send(Uni(c, false), Uni(c, true));
          Thread.Sleep(8);
        }
        return "";
      }
      case "key": foreach (var combo in a[1].Split(' ')) if (combo.Length > 0) { Combo(combo); Thread.Sleep(40); } return "";
      case "keydown": Send(Key(Vk(a[1]), false)); return "";
      case "keyup": Send(Key(Vk(a[1]), true)); return "";
      case "pos": { POINT p; GetCursorPos(out p); return p.x + "," + p.y; }
      default: throw new Exception("unknown command " + a[0]);
    }
  }
}
`

const WIN_HELPER_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${WIN_HELPER_CS}
'@
[Console]::Out.WriteLine('ready')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try { $r = [LcInput]::Run($line); [Console]::Out.WriteLine('ok ' + $r) }
  catch { $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; [Console]::Out.WriteLine('err ' + ($e.Message -replace '\\s+', ' ')) }
}
`

class WinHelper {
  private proc?: ChildProcessWithoutNullStreams
  private buf = ''
  private waiters: ((line: string) => void)[] = []
  private ready?: Promise<void>
  private chain: Promise<unknown> = Promise.resolve()

  private start(): Promise<void> {
    if (this.ready && this.proc && this.proc.exitCode === null) return this.ready
    const encoded = Buffer.from(WIN_HELPER_PS, 'utf16le').toString('base64')
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true })
    this.proc = proc
    this.buf = ''
    this.waiters = []
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d))
    proc.stdout.on('data', (d) => {
      this.buf += d.toString()
      let i
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).replace(/\r$/, '')
        this.buf = this.buf.slice(i + 1)
        this.waiters.shift()?.(line)
      }
    })
    this.ready = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('The input helper took too long to start.')), 30000)
      this.waiters.push((line) => {
        clearTimeout(t)
        if (line.trim() === 'ready') resolve()
        else reject(new Error('Input helper failed to start: ' + line))
      })
      proc.on('exit', (code) => {
        clearTimeout(t)
        for (const w of this.waiters.splice(0)) w('err helper exited')
        if (this.proc === proc) this.proc = undefined
        reject(new Error(`Input helper exited (${code}). ${stderr.trim().slice(0, 400)}`))
      })
    })
    this.ready.catch(() => {})
    return this.ready
  }

  run(cmd: string): Promise<string> {
    const job = this.chain.then(async () => {
      await this.start()
      const line = await new Promise<string>((resolve) => {
        this.waiters.push(resolve)
        this.proc!.stdin.write(cmd + '\n')
      })
      if (line.startsWith('ok')) return line.slice(3)
      throw new Error(line.replace(/^err\s*/, '') || 'input failed')
    })
    this.chain = job.catch(() => {})
    return job
  }

  stop(): void {
    this.proc?.kill()
    this.proc = undefined
    this.ready = undefined
  }
}

const winHelper = new WinHelper()

function xdotool(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('xdotool', args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        reject(new Error('xdotool is not installed. Install it (e.g. sudo apt install xdotool). Computer use needs an X11 session.'))
      else reject(new Error(stderr.trim() || err.message))
    })
  })
}

// ---------------------------------------------------------------- platform-neutral input
type Button = 'left' | 'right' | 'middle'

const input = {
  async click(x: number, y: number, button: Button, count: number): Promise<void> {
    if (process.platform === 'win32') await winHelper.run(`click|${x}|${y}|${button}|${count}`)
    else await xdotool(['mousemove', '--sync', `${x}`, `${y}`, 'click', '--repeat', `${count}`, '--delay', '60', button === 'right' ? '3' : button === 'middle' ? '2' : '1'])
  },
  async move(x: number, y: number): Promise<void> {
    if (process.platform === 'win32') await winHelper.run(`move|${x}|${y}`)
    else await xdotool(['mousemove', '--sync', `${x}`, `${y}`])
  },
  async press(x: number, y: number, down: boolean): Promise<void> {
    if (process.platform === 'win32') await winHelper.run(`${down ? 'press' : 'release'}|${x}|${y}`)
    else await xdotool(['mousemove', '--sync', `${x}`, `${y}`, down ? 'mousedown' : 'mouseup', '1'])
  },
  async drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    if (process.platform === 'win32') await winHelper.run(`drag|${x1}|${y1}|${x2}|${y2}`)
    else await xdotool(['mousemove', '--sync', `${x1}`, `${y1}`, 'mousedown', '1', 'mousemove', '--sync', `${x2}`, `${y2}`, 'mouseup', '1'])
  },
  async scroll(x: number, y: number, dx: number, dy: number): Promise<void> {
    if (process.platform === 'win32') return void (await winHelper.run(`scroll|${x}|${y}|${dx}|${dy}`))
    const args = ['mousemove', '--sync', `${x}`, `${y}`]
    if (dy) args.push('click', '--repeat', `${Math.abs(dy)}`, dy > 0 ? '5' : '4')
    if (dx) args.push('click', '--repeat', `${Math.abs(dx)}`, dx > 0 ? '7' : '6')
    await xdotool(args)
  },
  async type(text: string): Promise<void> {
    if (process.platform === 'win32') await winHelper.run(`type|${Buffer.from(text, 'utf8').toString('base64')}`)
    else await xdotool(['type', '--delay', '12', '--', text])
  },
  async key(combo: string): Promise<void> {
    if (process.platform === 'win32') await winHelper.run(`key|${combo.trim().replace(/\|/g, '')}`)
    else await xdotool(['key', '--', ...combo.trim().split(/\s+/)])
  },
  async holdKey(key: string, down: boolean): Promise<void> {
    if (process.platform === 'win32') await winHelper.run(`${down ? 'keydown' : 'keyup'}|${key.replace(/\|/g, '')}`)
    else await xdotool([down ? 'keydown' : 'keyup', key])
  },
  async cursor(): Promise<{ x: number; y: number }> {
    if (process.platform === 'win32') {
      const [x, y] = (await winHelper.run('pos')).split(',').map(Number)
      return { x, y }
    }
    const out = await xdotool(['getmouselocation', '--shell'])
    return { x: Number(/X=(\d+)/.exec(out)?.[1] ?? 0), y: Number(/Y=(\d+)/.exec(out)?.[1] ?? 0) }
  }
}

// ---------------------------------------------------------------- screen geometry & capture
interface Geometry {
  physW: number
  physH: number
  imgW: number
  imgH: number
}

let lastGeom: Geometry | undefined

function primaryGeometry(): { physW: number; physH: number; scale: number } {
  const d = screen.getPrimaryDisplay()
  return { physW: Math.round(d.size.width * d.scaleFactor), physH: Math.round(d.size.height * d.scaleFactor), scale: d.scaleFactor }
}

async function capture(): Promise<{ jpeg: Buffer; geom: Geometry }> {
  const { physW, physH } = primaryGeometry()
  const fit = Math.min(1, MAX_W / physW, MAX_H / physH)
  const want = { width: Math.round(physW * fit), height: Math.round(physH * fit) }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: want })
  const primaryId = String(screen.getPrimaryDisplay().id)
  const src = sources.find((s) => s.display_id === primaryId) ?? sources[0]
  if (!src || src.thumbnail.isEmpty()) throw new Error('Could not capture the screen (on Linux, computer use needs an X11 session).')
  let img = src.thumbnail
  const sz = img.getSize()
  if (sz.width !== want.width || sz.height !== want.height) img = img.resize(want)
  const geom = { physW, physH, imgW: img.getSize().width, imgH: img.getSize().height }
  lastGeom = geom
  return { jpeg: img.toJPEG(80), geom }
}

/** Screenshot pixel → physical screen pixel. */
function toPhysical(c: [number, number]): { x: number; y: number } {
  const g = lastGeom
  if (!g) throw new Error('Take a screenshot first so coordinates can be mapped to the screen.')
  const [x, y] = c
  if (x < 0 || y < 0 || x > g.imgW || y > g.imgH) throw new Error(`Coordinate (${x}, ${y}) is outside the screenshot (${g.imgW}×${g.imgH}).`)
  return { x: Math.round((x * g.physW) / g.imgW), y: Math.round((y * g.physH) / g.imgH) }
}

// ---------------------------------------------------------------- self-protection
// Claude must never operate LocalClaude itself: a click there could approve its
// own permission prompts.
function appWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
}

function assertNotOnApp(p: { x: number; y: number }): void {
  const w = appWindow()
  if (!w || !w.isVisible() || w.isMinimized()) return
  const { scale } = primaryGeometry()
  const dip = process.platform === 'win32' ? screen.screenToDipPoint(p) : { x: p.x / scale, y: p.y / scale }
  const b = w.getBounds()
  if (dip.x >= b.x && dip.x < b.x + b.width && dip.y >= b.y && dip.y < b.y + b.height) {
    throw new Error(
      'That point is on the LocalClaude window. Claude is not allowed to control LocalClaude itself. Ask the user to minimize LocalClaude or move it to another monitor, then take a new screenshot.'
    )
  }
}

function assertAppNotFocused(): void {
  const w = appWindow()
  if (w && w.isFocused() && !w.isMinimized()) {
    throw new Error(
      'LocalClaude is the focused window, so keystrokes would go into LocalClaude itself, which is not allowed. Click on the target window first (or ask the user to minimize LocalClaude).'
    )
  }
}

// ---------------------------------------------------------------- the MCP tool
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const ACTIONS = [
  'screenshot',
  'left_click',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'mouse_move',
  'left_click_drag',
  'left_mouse_down',
  'left_mouse_up',
  'scroll',
  'type',
  'key',
  'hold_key',
  'wait',
  'cursor_position'
] as const

const coord = z.tuple([z.number(), z.number()])

async function screenshotResult(note?: string) {
  const { jpeg, geom } = await capture()
  return {
    content: [
      { type: 'text' as const, text: `${note ? note + ' ' : ''}Screenshot ${geom.imgW}×${geom.imgH} (coordinates are in these pixels).` },
      { type: 'image' as const, data: jpeg.toString('base64'), mimeType: 'image/jpeg' }
    ]
  }
}

function fail(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true }
}

export function createComputerServer() {
  return createSdkMcpServer({
    name: 'computer-use',
    version: '1.0.0',
    instructions:
      'Use the computer tool to see and operate this computer (the primary display). Start with a screenshot, act using pixel coordinates from the latest screenshot, and check the screenshot returned after each action. Prefer keyboard shortcuts when reliable. Never operate the LocalClaude window itself.',
    tools: [
      tool(
        'computer',
        `See and control this computer's primary screen, mouse and keyboard (${process.platform === 'win32' ? 'Windows' : 'Linux'}). ` +
          'Actions: screenshot; left_click/right_click/middle_click/double_click/triple_click at coordinate; mouse_move; left_click_drag from start_coordinate to coordinate; ' +
          'left_mouse_down/left_mouse_up at coordinate; scroll at coordinate with scroll_direction (up/down/left/right) and scroll_amount (notches); ' +
          'type text; key with xdotool-style names like "ctrl+c", "Return", "alt+Tab", "super" (space-separate several combos); hold_key text for duration seconds; wait duration seconds; cursor_position. ' +
          'Coordinates are [x, y] in pixels of the most recent screenshot. Every action except cursor_position returns a fresh screenshot.',
        {
          action: z.enum(ACTIONS),
          coordinate: coord.optional().describe('[x, y] in screenshot pixels'),
          start_coordinate: coord.optional().describe('Drag start [x, y] for left_click_drag'),
          text: z.string().optional().describe('Text to type, key combo for key/hold_key'),
          scroll_direction: z.enum(['up', 'down', 'left', 'right']).optional(),
          scroll_amount: z.number().int().min(1).max(30).optional(),
          duration: z.number().min(0).max(30).optional().describe('Seconds, for wait and hold_key')
        },
        async (args) => {
          try {
            const need = (c: [number, number] | undefined, what = 'coordinate'): { x: number; y: number } => {
              if (!c) throw new Error(`${args.action} needs ${what}.`)
              const p = toPhysical(c)
              assertNotOnApp(p)
              return p
            }
            switch (args.action) {
              case 'screenshot':
                return await screenshotResult()
              case 'cursor_position': {
                const p = await input.cursor()
                const g = lastGeom
                const x = g ? Math.round((p.x * g.imgW) / g.physW) : p.x
                const y = g ? Math.round((p.y * g.imgH) / g.physH) : p.y
                return { content: [{ type: 'text' as const, text: `Cursor at [${x}, ${y}] (screenshot pixels).` }] }
              }
              case 'left_click':
              case 'right_click':
              case 'middle_click':
              case 'double_click':
              case 'triple_click': {
                const p = need(args.coordinate)
                const button: Button = args.action === 'right_click' ? 'right' : args.action === 'middle_click' ? 'middle' : 'left'
                const count = args.action === 'double_click' ? 2 : args.action === 'triple_click' ? 3 : 1
                await input.click(p.x, p.y, button, count)
                break
              }
              case 'mouse_move': {
                const p = need(args.coordinate)
                await input.move(p.x, p.y)
                break
              }
              case 'left_mouse_down':
              case 'left_mouse_up': {
                const p = need(args.coordinate)
                await input.press(p.x, p.y, args.action === 'left_mouse_down')
                break
              }
              case 'left_click_drag': {
                const a = need(args.start_coordinate, 'start_coordinate')
                const b = need(args.coordinate)
                await input.drag(a.x, a.y, b.x, b.y)
                break
              }
              case 'scroll': {
                const p = need(args.coordinate)
                const n = args.scroll_amount ?? 3
                const dir = args.scroll_direction ?? 'down'
                await input.scroll(p.x, p.y, dir === 'left' ? -n : dir === 'right' ? n : 0, dir === 'up' ? -n : dir === 'down' ? n : 0)
                break
              }
              case 'type':
                if (!args.text) throw new Error('type needs text.')
                assertAppNotFocused()
                await input.type(args.text)
                break
              case 'key':
                if (!args.text) throw new Error('key needs text, e.g. "ctrl+s".')
                assertAppNotFocused()
                await input.key(args.text)
                break
              case 'hold_key': {
                if (!args.text) throw new Error('hold_key needs text.')
                assertAppNotFocused()
                await input.holdKey(args.text, true)
                await sleep(Math.min(args.duration ?? 1, 30) * 1000)
                await input.holdKey(args.text, false)
                break
              }
              case 'wait':
                await sleep(Math.min(args.duration ?? 1, 30) * 1000)
                break
            }
            await sleep(SETTLE_MS)
            return await screenshotResult('Done.')
          } catch (e) {
            return fail(e instanceof Error ? e.message : String(e))
          }
        },
        { annotations: { title: 'Computer', destructiveHint: true, openWorldHint: true } }
      )
    ]
  })
}

export function stopComputerHelper(): void {
  winHelper.stop()
}
