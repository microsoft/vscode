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

`attach()` takes the `cdpPort` from the launch JSON and returns
`{ workbench, code, page, browser, detach }`. Options: `window`
(`'workbench' | 'agents' | 'any'`), `verbose` (stream the automation logger's
per-retry output to stderr — the fastest way to see *why* a step is failing),
`repoRoot`, `logsPath`, and `timeoutMs`.

`detach()` only closes the CDP connection. Kill the instance with the `pid`
from the launch JSON as usual.

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
- **Do not over-scope a selector when enumerating a popup.** Menu rows are not
  reliably nested under `.context-view`, so `.context-view .monaco-list-row`
  can return an empty list for a popup that is plainly on screen. Query
  `.monaco-list-row` and filter, or use a page object.
- **Not every surface exists in every window.** The Agents window has no Local
  session type, for instance. `workbench.agentsWindow.isSessionTypeAvailable(label)`
  answers that question directly instead of leaving you to infer it from a
  failure.
- **Some providers register asynchronously**, seconds after the window is
  usable. An agent-host session type that is missing right after launch may
  simply not have registered yet, so poll before concluding it is unavailable
  (`isSessionTypeAvailable` already re-opens the picker on each attempt for
  exactly this reason). This is *not* a symptom of a missing
  `--clone-extensions`: the built-in providers are present without it.

