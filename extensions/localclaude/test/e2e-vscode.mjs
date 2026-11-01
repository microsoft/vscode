// End-to-end test: LocalClaude running inside a real VS Code, driven through its UI with Playwright.
// Uses the scripted stand-in for Claude Code (LOCALCLAUDE_FAKE_AGENT=1), so no account or network is needed.
//
//   VSCODE_EXECUTABLE=/path/to/code xvfb-run -a node test/e2e-vscode.mjs
//
// Optional: LOCALCLAUDE_E2E_SHOTS=<folder> saves screenshots of each step.
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Playwright from this project or the machine (require, so NODE_PATH works too)
const { _electron: electron } = createRequire(import.meta.url)('playwright')

const extensionPath = new URL('..', import.meta.url).pathname
const executablePath = process.env.VSCODE_EXECUTABLE
if (!executablePath) throw new Error('Set VSCODE_EXECUTABLE to the VS Code (or Code - OSS) program to test with.')
const shots = process.env.LOCALCLAUDE_E2E_SHOTS
if (shots) mkdirSync(shots, { recursive: true })

const tmp = mkdtempSync(join(tmpdir(), 'localclaude-e2e-'))
const workspace = join(tmp, 'workspace')
mkdirSync(workspace)
writeFileSync(join(workspace, 'main.c'), '#include <stdio.h>\n\nint add(int a, int b) {\n  return a + b;\n}\n\nint main(void) {\n  printf("%d\\n", add(2, 3));\n  return 0;\n}\n')

const app = await electron.launch({
  executablePath,
  args: [
    workspace,
    `--extensionDevelopmentPath=${extensionPath}`,
    `--user-data-dir=${join(tmp, 'user-data')}`,
    `--extensions-dir=${join(tmp, 'extensions')}`,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-telemetry',
    '--no-sandbox'
  ],
  env: { ...process.env, LOCALCLAUDE_FAKE_AGENT: '1', LOCALCLAUDE_TEST_MODE: '1' }
})

const window = await app.firstWindow()
let failed = 0
let n = 0

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function shot(name) {
  if (shots) await window.screenshot({ path: join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) })
}

async function until(what, fn, timeout = 20000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      const v = await fn()
      if (v) return v
    } catch (e) {
      last = e
    }
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${last.message})` : ''}`)
}

/** Run a command from the command palette (focus moves out of the webview first, or it keeps the keys). */
async function command(title) {
  await window.click('.statusbar')
  await window.keyboard.press('F1')
  await window.waitForSelector('.quick-input-widget input', { state: 'visible' })
  await window.keyboard.type(title)
  await sleep(400)
  await window.keyboard.press('Enter')
}

/** The frame that runs LocalClaude's UI (inside VS Code's webview iframes), preferring the editor tab. */
async function appFrame(place) {
  return until(`the LocalClaude ${place} view`, async () => {
    for (const f of window.frames()) {
      try {
        if (await f.evaluate((p) => !!document.querySelector('#root') && document.body.classList.contains(`place-${p}`), place)) return f
      } catch {
        /* a frame that isn't ready yet */
      }
    }
    return null
  })
}

async function step(name, fn) {
  try {
    await fn()
    console.log(`✓ ${name}`)
    await shot(name.replace(/\W+/g, '-'))
  } catch (e) {
    failed++
    console.log(`✗ ${name}: ${e.message}`)
    await shot('FAILED-' + name.replace(/\W+/g, '-'))
  }
}

let ui
const text = () => ui.evaluate(() => document.body.innerText)

await step('VS Code starts with the extension', async () => {
  await window.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await until('the LocalClaude activity bar entry', () => window.$('.activitybar [aria-label^="LocalClaude"], .composite-bar [aria-label^="LocalClaude"]'), 30000)
})

await step('opens in an editor tab and shows the app', async () => {
  await command('LocalClaude: Open in Editor Tab')
  ui = await appFrame('editor')
  // a fresh install greets you with "Start a new chat"
  await until('the app (signed in through the test agent)', () =>
    ui.evaluate(() => {
      if (document.querySelector('textarea')) return true
      const start = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Start a new chat'))
      start?.click()
      return false
    })
  )
})

await step('a new chat gets a streamed reply', async () => {
  const ta = await ui.waitForSelector('textarea')
  await ta.fill('hello there')
  await ta.press('Enter')
  await until('the reply', async () => (await text()).includes('Echo: hello there'))
})

await step('the chat works in the workspace folder', async () => {
  const cwd = await until('the chat folder', () => ui.evaluate(() => [...document.querySelectorAll('[title]')].map((e) => e.getAttribute('title')).find((t) => t && t.includes('workspace'))))
  if (!cwd) throw new Error('the chat is not in the workspace folder')
})

await step('the editor context is sent to Claude but not shown in the chat', async () => {
  if ((await text()).includes('<editor_context>')) throw new Error('editor context is visible in the chat')
})

await step('an artifact opens with a preview from the local server', async () => {
  const ta = await ui.waitForSelector('textarea')
  await ta.fill('make artifact please')
  await ta.press('Enter')
  await until('the artifact panel', () => ui.evaluate(() => !!document.querySelector('.artifact-panel .artifact-frame')))
  const src = await ui.evaluate(() => document.querySelector('.artifact-panel iframe')?.getAttribute('src') ?? '')
  if (!/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{48}\/artifact\//.test(src)) throw new Error(`unexpected preview address: ${src}`)
  await until('the preview content', async () => {
    for (const f of window.frames()) {
      if (!f.url().includes('/artifact/')) continue
      try {
        if ((await f.evaluate(() => document.body.innerText.trim().length)) > 0) return true
      } catch {
        /* still loading */
      }
    }
    return false
  })
})

await step('the local server refuses addresses without its secret', async () => {
  const src = await ui.evaluate(() => document.querySelector('.artifact-panel iframe')?.getAttribute('src') ?? '')
  const { origin } = new URL(src)
  const res = await fetch(`${origin}/artifact/x/y/0`)
  if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`)
})

// With the editor tab hidden behind main.c, editor commands go to the side bar view
let side
await step('"Ask About Selection" opens the side bar and puts the selected code into the message box', async () => {
  await command('Go to File...')
  await window.keyboard.type('main.c')
  await sleep(500)
  await window.keyboard.press('Enter')
  await window.waitForSelector('.monaco-editor .view-lines', { timeout: 10000 })
  await sleep(500)
  await command('Select All')
  await command('LocalClaude: Ask About Selection')
  side = await appFrame('sidebar')
  await until('the selection in the message box', async () => {
    const value = await side.evaluate(() => document.querySelector('textarea')?.value ?? '')
    return value.includes('int add(int a, int b)') && value.includes('main.c')
  })
})

await step('"Add File to Chat" mentions the file', async () => {
  await command('LocalClaude: Add File to Chat')
  await until('the file mention', async () => /@\S*main\.c/.test(await side.evaluate(() => document.querySelector('textarea')?.value ?? '')))
})

await step('a message sent from the side bar gets a reply', async () => {
  const ta = await side.waitForSelector('textarea')
  await ta.fill('hello from the side bar')
  await ta.press('Enter')
  await until('the reply', async () => (await side.evaluate(() => document.body.innerText)).includes('Echo: hello from the side bar'))
})

await step('the editor context (main.c and its selection) is not shown in the chat', async () => {
  const shown = await side.evaluate(() => document.body.innerText)
  if (shown.includes('<editor_context>') || shown.includes('Use this only if')) throw new Error('editor context is visible in the chat')
})

await step('Settings: Claude-powered knowledge search is off, and turning it on shows its options', async () => {
  // the editor tab has room for the full layout
  await command('LocalClaude: Open in Editor Tab')
  await sleep(500)
  await ui.evaluate(() => document.querySelector('.account-settings')?.click())
  await until('the settings dialog', () => ui.evaluate(() => !!document.querySelector('.modal-heading')))
  await ui.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Memory & data')?.click())
  await until('the knowledge search switch', () => ui.evaluate(() => document.body.innerText.includes('Claude-powered knowledge search')))
  if (await ui.evaluate(() => !!document.querySelector('.smart-knowledge-options'))) throw new Error('options shown while it is off')
  await ui.evaluate(() => {
    const label = [...document.querySelectorAll('.smart-knowledge > label.toggle')][0]
    label.querySelector('input').click()
  })
  await until('its options', () => ui.evaluate(() => !!document.querySelector('.smart-knowledge-options')))
  const settings = await ui.evaluate(() => window.api.getSettings())
  if (!settings.smartKnowledge || !settings.smartRerank || !settings.smartResearcher || settings.smartContext || settings.smartModel !== 'haiku')
    throw new Error(`unexpected settings: ${JSON.stringify({ k: settings.smartKnowledge, r: settings.smartRerank, h: settings.smartResearcher, c: settings.smartContext, m: settings.smartModel })}`)
})

await app.close()
// keep the profile (with VS Code's logs) when something failed
if (failed) console.log(`VS Code profile and logs: ${tmp}`)
else rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n${failed} step(s) failed` : '\nall steps passed')
process.exit(failed ? 1 : 0)
