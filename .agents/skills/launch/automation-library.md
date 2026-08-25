# Driving the UI with the repo's automation library

Before hand-writing selectors, check whether `test/automation` already covers
the surface. It is the library the smoke tests use, and it encodes years of
hard-won knowledge about VS Code's DOM: retry loops for async-populated
pickers, read-back verification after typing, and workarounds for clicks that
get absorbed by animating overlays.

It normally *spawns* its own Electron, but it can attach to the instance
`launch.sh` already started. `scripts/attach.ts` does that:

```bash
# 1. The driver the page objects call through is only registered with this flag.
INFO=$("$LAUNCH" --disable-workspace-trust -- --enable-smoke-test-driver | tail -n1)
CDP=$(jq -r .cdpPort <<<"$INFO")
PID=$(jq -r .pid <<<"$INFO")
```

```js
// 2. Write a throwaway script IN THE REPO ROOT so `playwright` resolves.
import { attach } from '<dir-of-this-file>/scripts/attach.ts';

const session = await attach(process.argv[2], { window: 'workbench' });
const { workbench, code, page } = session;

await workbench.quickaccess.runCommand('workbench.action.chat.open');
await workbench.chat.waitForChatView();
await workbench.chat.sendMessage('Reply with exactly PONG.');
console.log(await workbench.chat.waitForResponseText(/PONG/i));

await session.detach();   // disconnects CDP; Code OSS keeps running
```

### Pick the right window first

`launch.sh` opens the regular workbench by default and the Agents window with
`--agents`. They are different products with different surfaces, and a task
aimed at one will quietly produce misleading results in the other:

| | Regular workbench (default) | Agents window (`--agents`) |
|---|---|---|
| Page objects | `workbench.chat`, `quickaccess`, `editors`, `terminal`, ... | `workbench.agentsWindow` |
| Chat surface | sidebar / editor chat | session-based homepage |
| Session types | Copilot, Local, Cloud, Claude | Copilot, Claude — **no Local** |

Pass `window: 'workbench'` or `window: 'agents'` to `attach()` so a mismatch
fails immediately instead of after a confusing search. If a control you expect
is missing, check which window you launched before concluding the control does
not exist.

> **Do not pick the window by name-matching the task.** "Agent", "harness", and
> "session target" all appear in *both* products, so a task phrased around
> agents is not automatically an Agents-window task. Choose by the *control*
> you need. In particular, anything involving the **Local** harness is a
> regular-workbench task: the Agents window genuinely has no Local session
> type, so `agentsWindow.selectSessionType('Local')` there fails with
> `Available: ` (an empty list) — which looks like a broken selector but is the
> API correctly reporting the wrong window. In one subagent run this cost the
> whole session. The workbench control is a toolbar button labelled
> `Set Session Target - <current>`, reachable with
> `code.waitAndClick('[aria-label^="Set Session Target"]')`.

`attach()` takes the `cdpPort` from the launch JSON and returns
`{ workbench, code, page, browser, detach }`. Options: `window`
(`'workbench' | 'agents' | 'any'`), `verbose` (stream the automation logger's
per-retry output to stderr — the fastest way to see *why* a step is failing),
`repoRoot`, `logsPath`, and `timeoutMs`.

`detach()` only closes the CDP connection; the Code OSS process keeps running.
Kill it with the `pid` from the launch JSON and then **verify it actually
died** — see "Verify the cleanup actually worked" in SKILL.md. Killing `pid`
alone routinely leaves the Electron process group alive.

### What you get

`workbench.*` exposes page objects for `chat`, `agentsWindow`, `quickaccess`,
`quickinput`, `editors`, `explorer`, `search`, `terminal`, `notebook`,
`settingsEditor`, `debug`, `scm`, `extensions`, `statusbar`, `problems`,
`task`, `localization`, `activitybar`, `editor`, and `keybindingsEditor`.
Read the `.d.ts` files under `test/automation/out/` for the current API of a
surface — the doc comments explain known flakiness and how each method
compensates for it.

Two habits worth forming:

- `workbench.quickaccess.runCommand(id)` is more reliable than clicking your
  way to a command, and it reports when a command is not found. A command
  registered with `f1: false` is not reachable this way — that is a real
  result about the command, not a failure of the tooling.
- `code.waitAndClick(selector)` retries and waits for the element to be
  clickable, which handles the animating-overlay case that makes a one-shot
  click silently do nothing.

### Finding a control that has no page object

Do not guess selectors. Ask the running window what is on screen, then work
from the real labels. Toolbar buttons in chat are `.action-label` elements and
their `aria-label` is the text you want:

```js
await session.page.evaluate(() =>
    Array.from(document.querySelectorAll('.interactive-session .action-label'))
        .map(el => el.getAttribute('aria-label'))
        .filter(Boolean));
// => [..., 'Set Session Target - Copilot', 'Configure Tools...', ...]
```

Now you have a stable hook — `.action-label[aria-label^="Set Session Target"]` —
that reads like the UI instead of encoding DOM structure. The same idea works
for any surface: enumerate the labelled elements, then select by label.

### When to use raw @playwright/cli instead

The automation library is the better default, but reach for the CLI when:

- You are exploring and want `snapshot` to see what is on screen.
- The surface has no page object and you only need one or two interactions.
- You want a screenshot for a paper trail (`screenshot --filename=...`).

The two compose: attach the library for the flows it covers, and drop to
`session.page` (a normal Playwright `Page`) for anything it does not.

### Gotchas

- **`--enable-smoke-test-driver` is mandatory.** Without it `window.driver` is
  never registered (see `setupDriver` in `src/vs/workbench/browser/window.ts`)
  and every page object fails. `attach()` checks this up front and tells you.
- **`test/automation` must be compiled.** `npm run compile` covers it;
  `attach()` reports if `out/` is missing.
- **Lists select on `mousedown`, not `click`.** For menus and pickers without a
  helper, prefer keyboard navigation and verify the focused row before
  committing:

  ```js
  await page.keyboard.press('ArrowDown');
  const focused = await page.evaluate(() =>
      document.querySelector('.monaco-list-row.focused')?.textContent?.trim());
  // assert `focused` is what you expect, then press Enter
  ```

- **Snapshot refs go stale** against virtualized lists. Re-query immediately
  before interacting.
- **Scope list queries to the part you mean — `.monaco-list-row` is everywhere.**
  This bites in both directions, and the under-scoped case is the dangerous one
  because it returns a plausible wrong answer instead of an error. Reading
  Source Control with `.pane-body .monaco-list-row` returned four rows that were
  actually chat sessions in the auxiliary bar; scoping to `.part.sidebar` gave
  the true answer of zero. Over-scoping fails the other way: menu rows are not
  reliably nested under `.context-view`, so `.context-view .monaco-list-row` can
  come back empty for a popup that is plainly on screen. Anchor on the part
  (`.part.sidebar`, `.part.panel`, `.part.auxiliarybar`) and filter from there,
  and treat a suspiciously well-formed result as worth a second look.
- **Not every surface exists in every window.** The Agents window has no Local
  session type, for instance. `workbench.agentsWindow.isSessionTypeAvailable(label)`
  answers that question directly instead of leaving you to infer it from a
  failure.
- **Editor tab `aria-label` is not the tab title.** An untitled editor is
  labelled from its *content*, so a file whose first line is `<!DOCTYPE html>`
  gets `aria-label="<!DOCTYPE html> • Untitled-1"` and a
  `[aria-label^="Untitled-1"]` selector never matches. Enumerate the tabs and
  match on `textContent`, or just act on `.tab.active`.
- **Toolbar toggles must be read, not blindly clicked.** Controls such as the
  integrated browser's *Add Element to Chat* carry `checked` in their class
  when active, so an unconditional click can switch the mode *off*. Check
  first, then click only if needed:

  ```js
  const isOn = () => page.evaluate(() => (document.querySelector(
      '.action-label[aria-label^="Add Element to Chat"]')?.className || '').includes('checked'));
  if (!(await isOn())) { await code.waitAndClick('.action-label[aria-label^="Add Element to Chat"]'); }
  ```

- **Commands that open a native dialog will time out.** `runCommand` waits for
  the quick input to *close*, so `workbench.action.files.openFolder` throws
  after ~20s even though the dialog is up. Launch with the folder as an
  argument instead (`launch.sh -- <path>`), and remember that opening a folder
  reloads the window and drops the CDP connection — reattach afterwards.
- **Some providers register asynchronously**, seconds after the window is
  usable. An agent-host session type that is missing right after launch may
  simply not have registered yet, so poll before concluding it is unavailable
  (`isSessionTypeAvailable` already re-opens the picker on each attempt for
  exactly this reason). This is *not* a symptom of a missing
  `--clone-extensions`: the built-in providers are present without it.

### The integrated browser is a separate CDP page

Page content shown in the integrated browser is **its own CDP target**, not
part of the workbench document, so `session.page.evaluate` cannot see it and
mouse events aimed at workbench coordinates will not reach it. Pick the content
page off the browser and drive it directly:

```js
const pages = session.browser.contexts().flatMap(c => c.pages());
const content = pages.find(p => !p.url().startsWith('vscode-file://'));  // the page under test
await content.evaluate(() => document.querySelector('h1')?.textContent);
```

This is what makes *Add Element to Chat* automatable end to end: enable the
picker from the workbench toolbar, then click the element **in the content
page**. The picker turns itself off once an element is chosen, and the
attachment shows up as a `.chat-attached-context-attachment` chip in chat.
