# Driving the UI with the repo's automation library

Before hand-writing selectors, check whether `test/automation` covers the
surface. It is what the smoke tests use, and it encodes years of hard-won DOM
knowledge: retry loops for async-populated pickers, read-back verification after
typing, and workarounds for clicks absorbed by animating overlays.

It normally *spawns* Electron, but `scripts/attach.ts` points it at the instance
`launch.sh` already started:

```bash
# The driver the page objects call through only exists with this flag.
INFO=$("$LAUNCH" --disable-workspace-trust -- --enable-smoke-test-driver | tail -n1)
CDP=$(jq -r .cdpPort <<<"$INFO"); PID=$(jq -r .pid <<<"$INFO")
```

```js
// Write the script IN THE REPO ROOT so `playwright` resolves. No build step.
import { attach } from '<dir-of-this-file>/scripts/attach.ts';

const session = await attach(process.argv[2], { window: 'workbench' });
const { workbench, code, page } = session;

await workbench.quickaccess.runCommand('workbench.action.chat.open');
await workbench.chat.waitForChatView();
await workbench.chat.sendMessage('Reply with exactly PONG.');
console.log(await workbench.chat.waitForResponseText(/PONG/i));

await session.detach();   // closes CDP only; Code OSS keeps running
```

`attach(cdpPort, options)` returns `{ workbench, code, page, browser, detach }`.
Options: `window` (`'workbench' | 'agents' | 'any'`), `verbose` (stream the
retry logger to stderr — fastest way to see *why* a step fails), `repoRoot`,
`logsPath`, `timeoutMs`.
The default private `logsPath` is removed by `detach()`; pass one explicitly to
retain artifacts (caller-supplied paths are never removed).

After `detach()`, kill the `pid` from the launch JSON and **verify it died** —
see "Verify the cleanup actually worked" in SKILL.md. Killing `pid` alone
routinely leaves the Electron process group alive.

## Pick the right window first

`launch.sh` opens the regular workbench by default, the Agents window with
`--agents`. Different products, different surfaces:

| | Regular workbench | Agents window (`--agents`) |
|---|---|---|
| Page objects | `workbench.chat`, `quickaccess`, `editors`, `terminal`, ... | `workbench.agentsWindow` |
| Chat surface | sidebar / editor chat | session-based homepage |
| Session types | Copilot, Local, Cloud, Claude | Copilot, Claude — **no Local** |

Pass `window:` so a mismatch fails immediately rather than after a confusing
search. If an expected control is missing, check which window you launched.

> **Choose by the control you need, not by name-matching the task.** "Agent",
> "harness" and "session target" appear in *both* products. Anything involving
> the **Local** harness is a regular-workbench task — the Agents window has no
> Local session type, so `agentsWindow.selectSessionType('Local')` fails there
> with `Available: ` (empty list), which reads like a broken selector but is the
> API correctly reporting the wrong window. This cost one subagent its whole
> session. The workbench control is a toolbar button:
> `code.waitAndClick('[aria-label^="Set Session Target"]')` — but it is gated on
> `chatSessionIsEmpty`, so it disappears once the session has a turn in it.
> Read the target *before* sending anything, or start a fresh chat first.

## What you get

`workbench.*` has page objects for `chat`, `agentsWindow`, `quickaccess`,
`quickinput`, `editors`, `explorer`, `search`, `terminal`, `notebook`,
`settingsEditor`, `debug`, `scm`, `extensions`, `statusbar`, `problems`, `task`,
`localization`, `activitybar`, `editor`, `keybindingsEditor`. Read the `.d.ts`
files under `test/automation/out/` for the current API — the doc comments
explain known flakiness and how each method compensates.

Two habits worth forming:

- `quickaccess.runCommand(id)` beats clicking your way to a command and reports
  when one is not found. A command registered with `f1: false` is unreachable
  this way — a real result about the command, not a tooling failure.
- `code.waitAndClick(selector)` retries and waits for clickability, handling the
  animating-overlay case where a one-shot click silently does nothing.

## Finding a control with no page object

Don't guess selectors. Ask the window what is on screen and work from real
labels. Chat toolbar buttons are `.action-label`, and `aria-label` is the text:

```js
await session.page.evaluate(() =>
    Array.from(document.querySelectorAll('.interactive-session .action-label'))
        .map(el => el.getAttribute('aria-label')).filter(Boolean));
// => [..., 'Set Session Target - Copilot', 'Configure Tools...', ...]
```

That yields a stable hook — `.action-label[aria-label^="Set Session Target"]` —
which reads like the UI instead of encoding DOM structure.

## Editor find widget

There is no page object for it, and it is the one surface where `fill` works —
the find input is a plain `<textarea>`, not Monaco. Whole flow:

```js
const FIND = '.editor-widget.find-widget.visible';
await page.keyboard.press('Meta+f');              // Control+f off macOS
await page.waitForSelector(FIND);
await page.fill(`${FIND} .monaco-findInput textarea`, 'vscode');
const matchCase = page.locator(`${FIND} .monaco-custom-toggle[aria-label^="Match Case"]`);
const matchCaseOn = await matchCase.evaluate(el =>
    el.getAttribute('aria-checked') === 'true' || el.classList.contains('checked'));
if (matchCaseOn) { await matchCase.click(); }      // This search wants case-insensitive.
// '1 of 81' | 'No results'. Updates synchronously with the input.
await page.textContent(`${FIND} .matchesCount`);
```

`aria-label` prefixes for the other toggles: `Match Whole Word`, `Use Regular
Expression`, `Find in Selection`, `Preserve Case`. Assert on `.matchesCount`
rather than on the highlight decorations.

## When to use raw @playwright/cli

The library is the better default; reach for the CLI to explore (`snapshot`),
to screenshot, or for a surface with no page object you touch once or twice.
They compose: `session.page` is a normal Playwright `Page`.

## Gotchas

- **`--enable-smoke-test-driver` is mandatory.** Without it `window.driver` is
  never registered (`setupDriver` in `src/vs/workbench/browser/window.ts`) and
  every page object fails. `attach()` checks and tells you.
- **`test/automation` must be compiled** — `npm --prefix test/automation run
  compile`. The root `npm run compile` does not build this package. `attach()` reports
  a missing `out/`.
- **Toolbar toggles must be read, not blindly clicked.** Controls like the
  integrated browser's *Add Element to Chat* carry `checked` in `className` when
  active, so an unconditional click switches the mode *off*:

  ```js
  const isOn = () => page.evaluate(() => (document.querySelector(
      '.action-label[aria-label^="Add Element to Chat"]')?.className || '').includes('checked'));
  if (!(await isOn())) { await code.waitAndClick('.action-label[aria-label^="Add Element to Chat"]'); }
  ```

- **Scope list queries to the part you mean — `.monaco-list-row` is everywhere.**
  The under-scoped case is dangerous because it returns a plausible *wrong*
  answer instead of an error: reading Source Control with
  `.pane-body .monaco-list-row` returned four rows that were actually chat
  sessions in the auxiliary bar, while `.part.sidebar` gave the true zero.
  Over-scoping fails the other way — menu rows aren't reliably under
  `.context-view`. Anchor on the part (`.part.sidebar`, `.part.panel`,
  `.part.auxiliarybar`) and treat a suspiciously tidy result as worth re-checking.
- **Commands opening a native dialog time out.** `runCommand` waits for quick
  input to *close*, so `workbench.action.files.openFolder` throws after ~20s with
  the dialog up. Pass the folder to `launch.sh -- <path>` instead; note that
  opening a folder reloads the window and drops CDP, so reattach.
- **Editor tab `aria-label` is not the tab title.** Untitled editors are
  labelled from *content*: a file starting `<!DOCTYPE html>` gets
  `aria-label="<!DOCTYPE html> • Untitled-1"`, so `[aria-label^="Untitled-1"]`
  never matches. Match on `textContent`, or act on `.tab.active`.
- **Lists select on `mousedown`, not `click`.** Without a helper, prefer
  keyboard navigation and verify the focused row before committing:

  ```js
  await page.keyboard.press('ArrowDown');
  const focused = await page.evaluate(() =>
      document.querySelector('.monaco-list-row.focused')?.textContent?.trim());
  ```

- **`keyboard.type` works on Monaco; `fill` does not.** `fill` sets a value
  directly and times out against `native-edit-context`, but `keyboard.type` and
  `locator.type` dispatch real key events and land text in editors and the chat
  input alike. It is one round-trip per character — fine for a short string, use
  `scripts/monaco-paste.sh` for a prompt. Focus first via a command
  (`workbench.action.chat.open`); clicking `.interactive-input-editor
  .native-edit-context` times out, and a failed focus makes typing look broken
  when it is not.
- **Snapshot refs go stale** against virtualized lists. Re-query before acting.
- **Some providers register seconds after the window is usable.** A missing
  session type may just not have registered yet, so poll
  (`isSessionTypeAvailable` re-opens the picker each attempt). This is *not* a
  missing `--clone-extensions`; built-in providers are present without it.

## The integrated browser is a separate CDP page

Integrated-browser content is **its own CDP target**, so `session.page.evaluate`
cannot see it and workbench-coordinate clicks never reach it. This is what makes
*Add Element to Chat* automatable: enable the picker from the workbench toolbar,
then click the element **in the content page**.

**Every tab is a separate page**, and page order does not follow open order, so
match on URL and fail loudly when the match is not unique:

```js
function contentPage(session, urlSubstring) {
    const pages = session.browser.contexts().flatMap(c => c.pages());
    const matches = pages.filter(p => p.url().includes(urlSubstring));
    if (matches.length !== 1) {
        throw new Error(`Expected exactly 1 page matching '${urlSubstring}', found ${matches.length}: `
            + matches.map(p => p.url()).join(', '));
    }
    return matches[0];
}
await contentPage(session, 'demo.html').evaluate(() => document.querySelector('h1')?.textContent);
```

`http://localhost:...` is unremarkable here — loopback pages are ordinary CDP
targets. What bites is that URL matching stops discriminating when tabs *share*
a URL, the normal state for a dev server. Titles don't rescue you either.

When you control the opening, capture the handle as you open it; it survives
in-tab navigation and reloads, so it stays valid across hot reloads. Do **not**
use `ctx.waitForEvent('page')`: opening a second tab first emits a transient
blank page that is closed again, so you get a dead target and the next call
fails with `Target page, context or browser has been closed`. Diff the page list:

```js
async function openBrowserTab(session, url) {
    // Scan every context, like contentPage does, rather than assuming the new
    // target lands in the workbench's own context.
    const allPages = () => session.browser.contexts().flatMap(c => c.pages());
    const seen = new Set(allPages());
    // keepOpen: the command swaps the Command Palette for the URL picker, so
    // the default "wait for quick input to close" never settles. Then target
    // that picker's input directly instead of typing blind - this is what
    // test/smoke's own browserView test does.
    await session.workbench.quickaccess.runCommand('workbench.action.browser.open', { keepOpen: true });
    const addressInput = session.page.locator('.quick-input-widget:visible input[placeholder*="enter URL"]');
    await addressInput.waitFor();
    await addressInput.fill(url);
    await addressInput.press('Enter');

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        // Match on "created by this action", not on the requested URL: the
        // tab may already have redirected (http->https, an auth hop) by the
        // time it is first observed. Only the transient blank target is
        // filtered out.
        const fresh = allPages().filter(p =>
            !seen.has(p) && !p.isClosed() && p.url() !== 'about:blank');
        if (fresh.length) {
            const page = fresh[fresh.length - 1];
            await page.waitForLoadState('domcontentloaded').catch(() => { });
            if (!page.isClosed()) { return page; }
        }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`No new integrated-browser page for ${url}`);
}
```

Use `contentPage` when URLs are distinct, `openBrowserTab` when they are not.
