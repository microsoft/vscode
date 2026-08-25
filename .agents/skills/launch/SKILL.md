---
name: launch
description: "Launch Code OSS (VS Code from sources) into an isolated throwaway profile with unique debug ports so you can drive it with the repo's own UI automation library or @playwright/cli AND attach a Node debugger via dap-cli in the same session. Use when working on VS Code itself and you want to interact with the running workbench, automate chat or UI flows, test UI features, take screenshots, set breakpoints in the renderer / extension host / main process, or combine UI driving with debugging."
---

# Code OSS Dev - Launch + Debug

You're working on VS Code itself and you want to:

1. Launch a Code OSS build from sources that is **already signed in** (Copilot, GitHub, etc.) so chat / agent flows work end-to-end.
2. Drive it over CDP with the repo's own automation page objects (`test/automation`) or with `@playwright/cli`.
3. Optionally attach a debugger via **dap-cli** to set breakpoints in the renderer, extension host, or main process.
4. Run multiple instances at once without port conflicts.

This skill provides a launcher that clones an authenticated user-data-dir to a throwaway temp folder, picks free ports for every debug surface, and prints them as JSON so you can pick them up programmatically.

The clone is **slim**: workspace storage, browser caches, file history, cached VSIX backups, and old logs are excluded by default. On macOS, auth tokens live in the OS keychain plus small files inside `User/globalStorage` - both of which *are* preserved. On Windows the GitHub session lives in the **shared-data-dir** instead, which the launcher seeds separately (see [Windows authentication](#windows-authentication)).

## Prerequisites

- macOS, Linux, or Windows.
  - **macOS / Linux**: the launcher is a bash script (`scripts/launch.sh`) and depends on `rsync`, `nohup`, and Node on `PATH`. The example caller snippets below also use `jq` (parse the JSON output) and `lsof` (kill-by-port fallback) — install those if you plan to use them, but the launcher itself does not require them.
  - **Windows**: use `scripts\launch.ps1` instead. It needs no extra tooling beyond Node on `PATH`, and works on both Windows PowerShell 5.1 and PowerShell 7+. `jq` is not needed — parse the JSON with `ConvertFrom-Json`. If Node is managed with [fnm](https://github.com/Schniz/fnm), put it on `PATH` first:
    ```powershell
    fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
    fnm use   # picks up the repo's .nvmrc
    ```
- A VS Code checkout with `node_modules/` installed (`npm install` if missing — do **not** symlink from a sibling worktree; that breaks builds in subtle ways).
- A VS Code checkout with sources built. Run `npm run compile` once (one-shot) or `npm run watch` for incremental rebuilds. Both build the full client **and** all built-in extensions under `extensions/`. You must build the full product to run successfully, building just the client is not enough.
- An **authenticated** Code OSS profile to seed from. By default the launcher uses `~/.vscode-oss-dev` on macOS/Linux or `$env:USERPROFILE\.vscode-oss-dev` on Windows, which is the user-data-dir the repo's `launch.json` configs use - if the user has ever signed in to Copilot in a dev build, this should work. Only pass `--source-user-data-dir <path>` (or set `$CODE_OSS_DEV_AUTHED_USER_DATA_DIR`) when you specifically want to seed from a different profile (e.g. your regular `~/Library/Application Support/Code` install).
  - If Code OSS launches and needs a sign-in, don't give up! Use the questions tool to ask the user to sign in.
- `@playwright/cli` available (it's a devDependency in the vscode repo - `npm install` then use `npx @playwright/cli`).
- For debugger work: `dap-cli` on `PATH`. If debugger support would be useful but the `dap-cli` skill is not present, prompt the user to install it from https://github.com/roblourens/dap-cli.
- CSS selectors are internal implementation details. If a selector-based `eval` stops working, take a fresh `snapshot`, inspect the current DOM, and update the selector rather than assuming an old one still applies.

> The launcher **copies** the source profile to a temp dir and never mutates the original. Each launch gets its own isolated `--user-data-dir` and `--extensions-dir`.

> The launcher normalizes two settings in the launched profile's `User/settings.json`. `files.simpleDialog.enable: true` is required because VS Code's native OS file dialogs cannot be driven via `@playwright/cli` over CDP and are unreachable over SSH on headless macOS; the simple (quick-input) dialog can be navigated with `press` and clipboard paste. `editor.editContext: true` is required because `test/automation`'s page objects choose between `.native-edit-context` and `textarea` from `Code.editContextEnabled`, which is unconditionally true for a dev build — a profile that disabled the setting renders a `textarea` and every text-input helper waits on the wrong selector and times out. Language-specific overrides (a `"[typescript]"` block) are normalized too, since `editor.*` settings are `LANGUAGE_OVERRIDABLE` and would otherwise outrank the root value. Both overrides are per-launch and only affect throwaway profiles, and the launcher passes `--sync=off` so they can never reach the user's synced settings. The rewrite is user-scope only, so a workspace that sets `editor.editContext: false` in its own `.vscode/settings.json` still wins. `attach()` checks the editors the window restored and says so when it finds the mismatch, which turns the usual case into an actionable error instead of a 20s timeout - but a window that restores no editor has nothing to inspect, so if a text-input helper still times out, check the workspace and folder settings for that key.
> A forwarded folder or `.code-workspace` that overrides `files.simpleDialog.enable` is rejected before launch; workspace scope wins over the throwaway profile and would otherwise reopen an undriveable native dialog. Forwarded `--profile`, `--profile-temp`, `--transient`, launcher-owned path/debug options, and a second `--` delimiter are also rejected because they would run outside the prepared profile or hide its safety flags.
> A launch with no workspace path opens an empty window instead of restoring the source profile's last workspace, whose settings could override the automation profile.

> For unattended automation, pass `--disable-workspace-trust` so a trust dialog cannot block the flow or extension-host startup. The override is process-scoped and does not modify the source profile. Only use it with content you trust.

## Launch

The launcher script lives next to this SKILL.md at `scripts/launch.sh` (macOS/Linux) or `scripts\launch.ps1` (Windows). Resolve it relative to wherever this skill file is installed - do not hardcode an absolute path.

```bash
# LAUNCH=<dir-of-this-SKILL.md>/scripts/launch.sh
"$LAUNCH"                                    # default: workbench
"$LAUNCH" --agents                           # Agents window
"$LAUNCH" -- <workspace-path>                # forward extra args to code.sh
"$LAUNCH" --source-user-data-dir <path>      # pick a specific authed profile
"$LAUNCH" --repo <vscode-repo-root>          # if not run from the repo
"$LAUNCH" --clone-extensions                 # start with a copy of the source extensions/ (~few seconds)
"$LAUNCH" --full                             # skip slim excludes; copy everything
"$LAUNCH" --skip-prelaunch                   # reuse already-current build outputs
"$LAUNCH" --disable-workspace-trust          # avoid trust prompts for trusted automation inputs
```

On Windows, invoke the PowerShell launcher with the same flags:

```powershell
$skillDir = '<dir-of-this-SKILL.md>'
$launch = Join-Path $skillDir 'scripts\launch.ps1'
& $launch                                      # default: workbench
& $launch --agents                             # Agents window
& $launch -- --use-mock-keychain               # forward extra args to code.bat
& $launch --source-user-data-dir C:\path\to\profile
& $launch --repo C:\path\to\vscode
& $launch --clone-extensions
& $launch --full
& $launch --skip-prelaunch
& $launch --disable-workspace-trust
```

If the local execution policy blocks scripts, invoke it with `powershell -ExecutionPolicy Bypass -File <path-to-launch.ps1>`. The Windows implementation has the same profile isolation, slim-copy excludes, settings merge, port allocation, foreground pre-launch, and CDP-ready contract as the bash launcher; only the shell commands and path syntax differ.

### What gets copied (slim mode, the default)

The exclude list mirrors the one used by VS Code's own perf-test skill (`.github/skills/auto-perf-optimize`), which is known to keep Copilot auth and language-model availability working. Specifically `WebStorage/`, `Service Worker/`, `Local Storage/`, `Cookies`, `Network Persistent State`, `TransportSecurity`, `Trust Tokens`, `Preferences`, `machineid`, and the entire `User/globalStorage/` (which holds `state.vscdb`) are all preserved.

#### Windows authentication

Windows has no shared per-app keychain for these secrets, so they live in files on disk - but **not all in the user-data-dir**. The GitHub session is stored at `StorageScope.APPLICATION_SHARED` *only on Windows* (see `useSharedStorage` and `CROSS_APP_SHARED_SECRET_KEYS` in `src/vs/platform/secrets/common/secrets.ts`), which puts the two halves of the credential in **different directories**:

| Piece | Location |
|---|---|
| Encrypted GitHub session blob | `<shared-data-dir>/sharedStorage/state.vscdb` |
| DPAPI-wrapped decryption key (`os_crypt.encrypted_key`) | `<user-data-dir>/Local State` |

The launcher therefore seeds **both**: it copies the source profile *and* copies the source shared-data-dir into the run's throwaway `shared-data` dir. The source resolves the same way `IEnvironmentService.appSharedDataHome` does - `$env:CODE_OSS_DEV_AUTHED_SHARED_DATA_DIR` if set, else `$env:VSCODE_PORTABLE\shared-data` when running portable, else `~/<product.sharedDataFolderName>` (i.e. `%USERPROFILE%\.vscode-oss-shared`). It also verifies `Local State`, `machineid`, and `Network` survived the profile copy, and warns on stderr if neither database holds a GitHub session.

> This asymmetry is invisible on macOS/Linux, where the same token lands inside the profile. A Windows-only "always signed out" symptom is a shared-data-dir problem, **not** a profile problem: signing in against the source profile writes a perfectly good session, but before this seeding existed every launch handed Code OSS an empty shared dir and threw it away.

To (re)establish the source session: run `.\scripts\code.bat --user-data-dir=$env:USERPROFILE\.vscode-oss-dev` directly, sign in once, and close it. That writes the blob to `%USERPROFILE%\.vscode-oss-shared` and the key to the profile's `Local State`; later launches copy both and inherit the session.

> Profiles that predate the `APPLICATION_SHARED` migration can still hold the secret in `User/globalStorage/state.vscdb`. `ApplicationSharedStorageMain` registers application storage as a read fallback, so those profiles authenticate even with no shared-data-dir present - which is why a missing shared dir is reported as a fact rather than assumed fatal.

Excluded (transient, regenerable, or known-not-needed):
- `User/workspaceStorage/` - per-workspace state, **including stored chat sessions** (often multi-GB)
- `User/History/` - local file edit history
- `CachedExtensionVSIXs` - backup VSIXs (hundreds of MB)
- `logs`
- Chromium caches at the profile root: `Cache`, `Code Cache`, `CachedData`, `GPUCache`, `ShaderCache`, `Dawn*Cache`, `component_crx_cache`; and under the persistent integrated-browser partition: `Cache`, `Code Cache`, `GPUCache`, `Dawn*Cache`
- `Backups`, `blob_storage`, `BrowserMetrics`, `Crashpad`, `Session Storage`
- `Singleton*`, `*.lock`, `*.sock` (would conflict with the source instance)

The persistent integrated-browser partition keeps website state such as cookies, local and session storage, IndexedDB, WebStorage, service workers, and preferences; only its regenerable caches are excluded.

`extensions/` defaults to a **fresh empty directory** - fastest and conflict-free, but the launched instance starts with no third-party extensions installed. Pass `--clone-extensions` to copy the source extensions dir into the temp profile so the new instance is independent of the source. Pass `--full` to skip all excludes if you suspect the slim copy is missing something you need.

> **Why never share the source `extensions/` dir directly?** The extension management service writes a shared `.obsolete` file; two concurrent writers crash each other's shared background process. The launcher always uses an isolated extensions dir for the same reason it uses `--shared-data-dir` (see below).

> If the launched window says "language model unavailable" or otherwise looks unauthed, ask the user to sign in.

The script runs pre-launch (electron download, compile-if-missing, built-in extensions) **in the foreground**, then starts Code OSS detached and **blocks until the renderer's CDP endpoint is responding** (up to ~90s) before printing the JSON line on stdout. If anything fails — preLaunch errors, code.sh exits early, CDP never opens — the script exits non-zero and dumps the relevant log tail to stderr.

For repeated launches of the same prepared build, pass `--skip-prelaunch` after one successful normal launch. Only use it while a watch task keeps all output current or neither sources nor build outputs have changed; otherwise the new instance may run stale or incomplete code.

```json
{"pid":12345,"cdpPort":53111,"extHostPort":53112,"mainPort":53113,"agentHostPort":53114,"userDataDir":".../user-data","extensionsDir":".../extensions","sharedDataDir":".../shared-data","runDir":"...","logFile":".../code.log","repo":"...","agents":false,"timings":{"profileMs":231,"preLaunchMs":251,"cdpReadyMs":459,"totalMs":941}}
```

The additive `timings` object uses monotonic elapsed time to identify time spent preparing the isolated profile, running pre-launch, and starting Code OSS through CDP readiness. `totalMs` covers the complete launcher operation through readiness.

Capture it with `jq` — no retry loop needed, CDP is already up when the JSON is printed:

```bash
INFO=$("$LAUNCH" | tail -n1)
CDP=$(jq -r .cdpPort        <<<"$INFO")
EXT=$(jq -r .extHostPort    <<<"$INFO")
MAIN=$(jq -r .mainPort      <<<"$INFO")
AGENT=$(jq -r .agentHostPort <<<"$INFO")
LOG=$(jq -r .logFile        <<<"$INFO")
PID=$(jq -r .pid            <<<"$INFO")
```

On Windows, capture and parse the JSON without `jq`:

```powershell
$info = & $launch | Select-Object -Last 1 | ConvertFrom-Json
$cdp = $info.cdpPort
$ext = $info.extHostPort
$main = $info.mainPort
$agent = $info.agentHostPort
$log = $info.logFile
$codePid = $info.pid   # not `$pid`: that is PowerShell's own read-only PID
```

### What each port is for

| Port | Process | Use with |
|------|---------|----------|
| `cdpPort` (`--remote-debugging-port`) | Renderer (the workbench window) | `@playwright/cli` over CDP, also Chrome DevTools |
| `extHostPort` (`--inspect-extensions`) | Extension host (Node) | `dap-cli` (Node inspector protocol) |
| `mainPort` (`--inspect`) | Electron main process (Node) | `dap-cli` (Node inspector protocol) |
| `agentHostPort` (`--inspect-agenthost`) | Agent host process (Node) | `dap-cli` (Node inspector protocol) |

## Drive the UI

**Start here: [use the repo's own automation library](./automation-library.md)**
— the page objects the smoke tests use, with the retry and verification logic
each surface needs. It requires the smoke-test driver, so pass the flag **at
launch time** — it cannot be added to an already-running instance:

```bash
INFO=$("$LAUNCH" -- --enable-smoke-test-driver | tail -n1)
CDP=$(jq -r .cdpPort <<<"$INFO")
node /tmp/drive.ts "$CDP"          # the script below
```

```js
// /tmp/drive.ts - run from the repo root; Node executes the .ts directly,
// no build step. Takes the cdpPort as its first argument.
import { attach } from '<dir-of-this-SKILL.md>/scripts/attach.ts';

const session = await attach(process.argv[2], { window: 'workbench' });
await session.workbench.quickaccess.runCommand('workbench.action.chat.open');
await session.workbench.chat.waitForChatView();
await session.workbench.chat.sendMessage('Reply with exactly PONG.');
console.log(await session.workbench.chat.waitForResponseText(/PONG/i));
await session.detach();
```

**Check for a page object before hand-rolling selectors.** `workbench.*` covers
`chat`, `agentsWindow`, `quickaccess`, `quickinput`, `editors`, `explorer`,
`search`, `terminal`, `notebook`, `settingsEditor`, `debug`, `scm`, `extensions`,
`statusbar`, `problems`, `task`, `localization`, `activitybar`, `editor`,
`keybindingsEditor` — each with the retries that surface needs. If your task
names one of those surfaces, `ls test/automation/out/*.d.ts` and read its API
first, then reach it through `attach()` above — **not** `new Application(...)`,
which spawns a second Electron and will not talk to your running window, and not
`ts-node`, since `node` runs these `.ts` files directly. Skipping this step is
the single most expensive mistake with this skill:
in a user study, finding an extension's publisher took **7m40s and 40 raw CLI
calls** hand-rolling DOM queries, when
`workbench.extensions.searchForExtension('ms-toolsai.datawrangler')` already did
it. Read the signature before deciding a page object does not fit: that one
takes an extension **id**, and passing the display name fails with
`Extension ... is not found`, which reads like the surface is unsupported.

**Then read [automation-library.md](./automation-library.md)** — window choice,
controls with no page object, the integrated browser, and the gotchas (several
cost multiple runs to discover). Fall back to raw `@playwright/cli` below for
exploration (`snapshot`), screenshots, and anything the library misses;
`session.page` is a normal Playwright `Page`.

### Raw `@playwright/cli`

Use the dynamic `cdpPort` from the launch JSON. The normal loop is: attach, confirm the target, snapshot, interact, then re-snapshot after meaningful UI changes.

If you are unsure about Playwright CLI syntax, run `npx @playwright/cli --help` or `npx @playwright/cli <command> --help` instead of guessing option names.

> **Always pick a unique `PW_SESSION` name and pass it as `-s=$PW_SESSION`** on every `npx @playwright/cli ...` call. The CLI is backed by a persistent daemon (`cliDaemon.js`) keyed by session name; if two shells both omit `-s=`, they share the implicit `"default"` session and the most-recently-attached CDP "wins" for every subsequent command from either shell. The launch skill is built around isolation (per-instance UDD, ports, shared-data-dir), and this pattern keeps that isolation intact at the Playwright-driving layer too. **A note on the alternative `PLAYWRIGHT_CLI_SESSION` env var:** it's documented in the package README and works correctly for `open`-style workflows, but it interacts poorly with `attach --cdp=...` (the daemon ends up with both `--cdp=...` and `--endpoint=<env-value>`, and the latter wins, causing a `connect ENOENT` failure). Confirmed against `@playwright/cli@0.1.13`. Explicit `-s=NAME` works in all modes.

```bash
# At the top of your script / subagent prompt:
PW_SESSION="my-uniq-$$"        # any unique string; $$ is fine for one shell per agent

# launch.sh blocks until CDP is ready, so a single attach is enough.
npx @playwright/cli -s=$PW_SESSION attach --cdp=http://127.0.0.1:$CDP
npx @playwright/cli -s=$PW_SESSION tab-list
npx @playwright/cli -s=$PW_SESSION snapshot
```

After `attach`, later `@playwright/cli` commands keep using the connected app until you close or reattach — as long as you keep passing the same `-s=$PW_SESSION`.

### Selecting the right Electron target

Electron apps can expose multiple windows or webviews. If `tab-list` shows `about:blank`, a webview, or otherwise the wrong target, switch targets before interacting:

```bash
npx @playwright/cli -s=$PW_SESSION tab-list
npx @playwright/cli -s=$PW_SESSION tab-select 2
npx @playwright/cli -s=$PW_SESSION snapshot
```

If a target looks stale after relaunching, run `npx @playwright/cli -s=$PW_SESSION close`, attach again with `$CDP`, and re-check `tab-list`.

### Focusing the chat input

Use the `playwrightScripts/focus-chat-input.ts` script in both the regular
workbench and the Agents window. It performs the complete focus flow in one
Playwright call:

1. If a visible chat input is already focused, it does nothing.
2. If a visible chat input exists but is not focused, it focuses that input.
3. Otherwise, it invokes the platform chat-focus chord, waits for the input,
   and focuses it only if the chord did not already do so.

The script detects the platform from the browser page, prefers the active
Agents session, and excludes inline chat inputs. If the cloned profile has
customized the default chord, it falls back to the surface-specific command
through the Command Palette.

```bash
LAUNCH_DIR=<dir-of-this-SKILL.md>
FOCUS_CHAT="$LAUNCH_DIR/playwrightScripts/focus-chat-input.ts"
npx @playwright/cli -s=$PW_SESSION run-code --filename="$FOCUS_CHAT"
```

```powershell
$skillDir = '<dir-of-this-SKILL.md>'
$focusChat = Join-Path $skillDir 'playwrightScripts\focus-chat-input.ts'
npx @playwright/cli "-s=$pwSession" run-code "--filename=$focusChat"
```

The script returns
`{ focused, focusChanged, focusInvoked, shortcutInvoked, commandPaletteFallbackInvoked, selector }`.
`focusChanged` reports whether this script invocation moved focus into Chat,
while `focusInvoked` reports whether the script had to call `focus()` directly.
Both are `false` when the chat input was already focused. If the script fails,
take a fresh snapshot and resolve any blocking dialog or unavailable chat state
before retrying.

### Typing into Monaco (chat input, editors)

`fill` **silently fails** on Code OSS — it sets a value directly, and Monaco's
`native-edit-context` element only reacts to real input events. `page.keyboard.type()`
*does* work (it dispatches genuine per-key events), but it is one round-trip per
character, so prefer it only for short strings. For anything longer use:

- **`scripts/monaco-paste.sh` helper** (recommended — fast, no system clipboard, parallel-safe). Reads text from a positional arg or stdin and dispatches a `ClipboardEvent('paste')` with a `DataTransfer` payload into the focused chat-input Monaco editor. Honors `--session NAME` or `$PW_SESSION` env so it stays inside the same `-s=` session as everything else.

  ```bash
  LAUNCH_DIR=<dir-of-this-SKILL.md>           # the same dir that holds scripts/launch.sh
  FOCUS_CHAT="$LAUNCH_DIR/playwrightScripts/focus-chat-input.ts"
  PASTE="$LAUNCH_DIR/scripts/monaco-paste.sh"
  export PW_SESSION                            # helper reads this env var

  # Send a prompt:
  npx @playwright/cli -s=$PW_SESSION run-code --filename="$FOCUS_CHAT"
  "$PASTE" 'Please run `pwd && ls` using your terminal tool.'
  npx @playwright/cli -s=$PW_SESSION press Enter

  # Long / arbitrary text via stdin (avoids any shell-quoting headaches):
  printf 'multi-line prompt\nwith backticks `x`\nand emoji 🎉' | "$PASTE"

  # Append without clearing:
  "$PASTE" --append " continued text"

  # Skip the read-back check (useful when intentionally pasting more than the
  # chat input's ~600-character soft cap):
  "$PASTE" --no-verify "...long text..."

  # Or pass the session explicitly per call (if you don't want to export PW_SESSION):
  "$PASTE" --session "$PW_SESSION" "..."
  ```

  The helper prints a single JSON line on stdout: `{ok, actualLength, expectedLength, viewLineCount, firstViewLine, error?}`. Exit 0 on success, 1 on verify failure, 2 on argument errors. Tested reliable across 20+ sequential pastes including unicode (中文), emoji (🎉), backticks, ampersands, embedded quotes, and newlines.

  **Why a helper script and not just docs:** the inline recipe involves a multi-line `node -e` heredoc with embedded JS template literals, which is exactly the kind of code that gets miscopied. There are also three non-obvious correctness traps the helper handles internally:
  1. Monaco's `native-edit-context` ignores `fill` entirely; it only reacts to real input — paste events, per-key `press`, or `keyboard.type`.
  2. Monaco renders ASCII spaces as U+00A0 (NBSP) in the view-line DOM, so verification has to normalize before comparing.
  3. Monaco updates its DOM **asynchronously** after a paste event — a synchronous read-back inside the same `eval` returns stale state. The helper polls rendered view lines across paint cycles until the pasted prefix appears or verification times out.

- **Per-key `press`** (universal but slow — each press is a separate CLI invocation with Node startup cost):
  ```bash
  npx @playwright/cli -s=$PW_SESSION press H
  npx @playwright/cli -s=$PW_SESSION press i
  npx @playwright/cli -s=$PW_SESSION press Enter
  ```

- **Clipboard paste via `pbcopy`** (fast on macOS, **but `NSPasteboard` is system-wide so any concurrent shell that touches the pasteboard will collide**). Only use when nothing else on the machine is using the clipboard for the duration of the paste.
  ```bash
  LAUNCH_DIR=<dir-of-this-SKILL.md>
  FOCUS_CHAT="$LAUNCH_DIR/playwrightScripts/focus-chat-input.ts"
  printf '%s' "Your prompt here" | pbcopy
  npx @playwright/cli -s=$PW_SESSION run-code --filename="$FOCUS_CHAT"
  npx @playwright/cli -s=$PW_SESSION press Meta+v
  npx @playwright/cli -s=$PW_SESSION press Enter
  ```

### Parallel multi-instance pattern

Because the launch skill is built around isolation, the natural workload is **many agents on one machine, each driving their own Code OSS**. The pattern boils down to giving each agent a unique `PW_SESSION` and passing it everywhere:

```bash
LAUNCH_DIR=<dir-of-this-SKILL.md>
FOCUS_CHAT="$LAUNCH_DIR/playwrightScripts/focus-chat-input.ts"
PASTE="$LAUNCH_DIR/scripts/monaco-paste.sh"
export PW_SESSION

# In agent A's shell:
PW_SESSION="agent-A-$$"
INFO=$("$LAUNCH" --agents -- --use-mock-keychain | tail -n1)
CDP=$(jq -r .cdpPort <<<"$INFO")
npx @playwright/cli -s=$PW_SESSION attach --cdp=http://127.0.0.1:$CDP
npx @playwright/cli -s=$PW_SESSION run-code --filename="$FOCUS_CHAT"
"$PASTE" "prompt for A"   # helper picks up $PW_SESSION

# In agent B's shell (running concurrently):
PW_SESSION="agent-B-$$"
INFO=$("$LAUNCH" --agents -- --use-mock-keychain | tail -n1)
CDP=$(jq -r .cdpPort <<<"$INFO")
npx @playwright/cli -s=$PW_SESSION attach --cdp=http://127.0.0.1:$CDP
npx @playwright/cli -s=$PW_SESSION run-code --filename="$FOCUS_CHAT"
"$PASTE" "prompt for B"
```

Each agent gets its own `cliDaemon` bound to its own CDP, so the pastes / clicks / snapshots don't cross-contaminate. Verified live with two concurrent instances. **macOS Mach-ports caveat:** on macOS, beyond ~2–3 concurrent Code OSS instances Crashpad's exception handler tends to die with `mach_port_request_notification: invalid capability`. That's a separate, OS-level limit; it's not affected by the session name.

> **Cleanup for `cliDaemon` processes:** stop your session's daemon with `npx @playwright/cli -s=$PW_SESSION close`, or nuke all stale daemons (after killing all the Code OSS windows) with `npx @playwright/cli kill-all`. Session daemons live under `~/Library/Caches/ms-playwright/daemon/<hash>/`.

### Agents window selector differences

The Agents window does not use the regular workbench `.interactive-input-editor` wrapper. Selector checks that are scoped to that wrapper may return nothing even when the Agents chat input is focused.

```js
// Regular-workbench-specific selector; do not assume this exists in Agents.
document.querySelectorAll('.interactive-input-editor .view-line')

// More useful checks in Agents.
document.querySelectorAll('.view-line')
document.activeElement?.matches('.native-edit-context, textarea.inputarea')
```

The focus script accounts for these DOM differences and prioritizes the active
Agents session.

### Verifying and clearing chat text

For the regular workbench sidebar, this confirms that text landed in the Monaco input:

```bash
npx @playwright/cli -s=$PW_SESSION eval '
(() => {
  const sidebar = document.querySelector(".part.auxiliarybar");
  const viewLines = sidebar?.querySelectorAll(".interactive-input-editor .view-line") ?? [];
  return Array.from(viewLines).map(viewLine => viewLine.textContent).join("|");
})()'
```

For the Agents window, use a fresh snapshot plus the broader selector/focus checks above instead of assuming the regular sidebar wrapper is present.

To clear the focused Monaco input:

```bash
# macOS
npx @playwright/cli -s=$PW_SESSION press Meta+a
# Linux / Windows
npx @playwright/cli -s=$PW_SESSION press Control+a
npx @playwright/cli -s=$PW_SESSION press Backspace
```

If the focus script cannot reach Chat because the surface is not available yet,
take a snapshot and navigate the UI into a state where chat exists before
retrying. Avoid treating completed CLI commands as proof that text was entered.

### Screenshots (paper trail)

```bash
SHOTS="$PWD/screenshots/$(date +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$SHOTS"
npx @playwright/cli -s=$PW_SESSION screenshot --filename="$SHOTS/after-launch.png"
```

> Keep screenshots inside the workspace, not `/tmp`, so they survive for review.

For wide windows, `--full-page` can make layout easier to inspect, and element screenshots are useful when a snapshot gives a stable ref for the panel you care about:

```bash
npx @playwright/cli -s=$PW_SESSION screenshot --full-page --filename="$SHOTS/full-window.png"
npx @playwright/cli -s=$PW_SESSION screenshot e42 --filename="$SHOTS/panel.png"
```

On macOS, a screenshot "Permission denied" failure usually means the terminal lacks Screen Recording permission. Use text/state verification while resolving that permission issue.

## Debug with dap-cli

To set breakpoints in VS Code source while the window is running, attach `dap-cli` to one of the ports. If `dap-cli` would help but the corresponding skill is unavailable, prompt the user to install it from https://github.com/roblourens/dap-cli before continuing with debugger-specific steps.

**Read the `dap-cli` skill for the full attach/breakpoint/inspect workflow when it is available** - this skill only tells you which port to point it at:

- **Extension host** (most common - Copilot Chat extension, built-in extensions, your own extension under development) -> `extHostPort`
- **Main process** (Electron lifecycle, window/menu wiring, IPC) -> `mainPort`
- **Local agent host** (`src/vs/platform/agentHost/node/...`, agent session lifecycle, AHP wiring, Claude/Copilot agent providers) -> `agentHostPort`
- **Renderer** (the workbench itself, `src/vs/workbench/...`) -> `cdpPort`

You can run `@playwright/cli` and `dap-cli` against the **same window simultaneously** - drive the UI with one terminal, hit a breakpoint and inspect state in another.

## Multiple instances

Every launch picks fresh ports and a fresh temp `runDir`, so you can run as many concurrent Code OSS windows as your machine can handle. Each one's ports come back in its own JSON blob - keep them separate.

The launcher also passes `--shared-data-dir=<runDir>/shared-data`. This is **required** for multi-instance isolation: Code OSS keeps a fixed-path SQLite DB at `~/.<dataFolderName>-shared/sharedStorage/state.vscdb` that is *not* covered by `--user-data-dir`. Without overriding it, two concurrent instances would fight over the same file and one would die with "shared background process terminated unexpectedly". Each launch gets its own `shared-data` dir, **seeded from the source shared-data-dir** so the Windows GitHub session survives - see [Windows authentication](#windows-authentication) for why that copy matters.

## Restart after source changes

Workbench code is loaded when the Code OSS window starts; source changes are not hot-reloaded into an already-running instance. After the build output is current, kill the launched process, launch again, and reattach to the new `cdpPort` from the new JSON blob.

```bash
kill "$PID" 2>/dev/null || true
INFO=$("$LAUNCH" | tail -n1)
CDP=$(jq -r .cdpPort <<<"$INFO")
PID=$(jq -r .pid <<<"$INFO")
npx @playwright/cli -s=$PW_SESSION attach --cdp=http://127.0.0.1:$CDP
npx @playwright/cli -s=$PW_SESSION tab-list
npx @playwright/cli -s=$PW_SESSION snapshot
```

If you are iterating frequently, keep the repo build/watch task running separately so relaunches pick up already-generated output. After one successful normal launch, `--skip-prelaunch` avoids repeating the preparation while those outputs remain current.

## Cleanup

The launcher writes everything under a temp `runDir` (printed in the JSON). When you're done:

```bash
# Disconnect this session's playwright daemon (leaves other sessions' daemons alone)
npx @playwright/cli -s=$PW_SESSION close

# Or nuke any stale daemons left behind by crashed callers across all sessions:
# npx @playwright/cli kill-all

# Kill the Code OSS instance
kill "$PID" 2>/dev/null || true
# Or by port if you've lost the pid:
pids=$(lsof -t -i :$CDP); [ -n "$pids" ] && kill $pids
```

Code OSS is a full Electron app and easily eats 1-4 GB. Always clean up — but
**do not delete the profile yet**: removing it before the check below throws away
the logs of anything that survived the kill. The next section is the sequence to
actually finish with.

### Verify the cleanup actually worked

**Do not treat a completed `kill` as proof the instance is gone.** `$PID` is the
`code.sh` wrapper, and killing it does not reliably reap the Electron process
group it spawned; helper processes are frequently re-parented and survive. In a
run of seven subagent sessions, every one reported that it had cleaned up, yet
nine instances (13.7 GB RSS) and 341 MB of temp profiles were still alive
afterwards.

Always finish with an explicit check, and only then remove the profile:

```bash
kill "$PID" 2>/dev/null || true
sleep 3

# Anything still alive for THIS run? (match on the runDir, so other agents'
# concurrent instances are left untouched)
RUN_DIR=$(jq -r '.runDir // empty' <<<"$INFO")

# pgrep is what makes this check meaningful. Without it the lookups below fail
# with status 127, which is indistinguishable from "nothing matched", and the
# profile would be deleted without ever verifying the processes exited.
command -v pgrep >/dev/null || { echo "pgrep not found; cannot verify cleanup" >&2; return 2>/dev/null || exit 1; }

# Fail closed: an empty or malformed RUN_DIR would turn the pgrep below into a
# match-everything pattern (`pgrep -f ""` matches every process on Linux), and
# the kill that follows would hit unrelated processes. Canonicalize first -
# a glob matches `/` too, so `/tmp/code-oss-dev-x/../../home/you` would sail
# through a pattern check and then reach `rm -rf`. Compare the resolved
# basename instead, so only a real launcher run directory qualifies.
RUN_DIR=$(cd "$RUN_DIR" 2>/dev/null && pwd -P) || {
  echo "refusing to clean up: runDir does not exist" >&2; return 2>/dev/null || exit 1
}
# The basename alone does not prove ownership - a real directory such as
# ~/code-oss-dev-important would pass it and then be handed to `rm -rf`. Also
# require the canonical parent to be the launcher's own temp root: `$TMPDIR`,
# or `/tmp` when launch.sh fell back to it because `$TMPDIR` was too long.
run_parent=$(cd "$RUN_DIR/.." && pwd -P)
tmp_root=$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)
plain_tmp=$(cd /tmp 2>/dev/null && pwd -P)
case "$(basename "$RUN_DIR")" in
  code-oss-dev-*) ;;
  *) echo "refusing to clean up: bad runDir '$RUN_DIR'" >&2; return 2>/dev/null || exit 1 ;;
esac
if [ "$run_parent" != "$tmp_root" ] && [ "$run_parent" != "$plain_tmp" ]; then
  echo "refusing to clean up: '$RUN_DIR' is not under the launcher temp root" >&2
  return 2>/dev/null || exit 1
fi

# pgrep -f takes a regex, not a literal: an unescaped '+' or '[' from a custom
# TMPDIR can miss this run (deleting a profile whose processes are still alive)
# or broaden the match before the kill. Escape once, reuse everywhere.
RUN_RE=$(printf '%s' "$RUN_DIR" | sed 's/[][\.^$*+?(){}|\\]/\\&/g')

leftover=''
if leftover=$(pgrep -f "$RUN_RE"); then
  echo "$leftover" | xargs kill 2>/dev/null || true
  sleep 2
else
  pgrep_status=$?
  if [ "$pgrep_status" -gt 1 ]; then
    echo "pgrep failed with status $pgrep_status; keeping $RUN_DIR for diagnosis" >&2
    return 2>/dev/null || exit 1
  fi
fi

# Only discard the profile once nothing is left: a survivor still has the run's
# logs open, and deleting them removes the evidence you need to diagnose it.
if leftover=$(pgrep -f "$RUN_RE"); then
  echo "STILL RUNNING: $(printf '%s' "$leftover" | tr '\n' ' ')"
  echo "keeping $RUN_DIR for diagnosis"
else
  pgrep_status=$?
  if [ "$pgrep_status" -eq 1 ]; then
    rm -rf "$RUN_DIR"
  else
    echo "pgrep failed with status $pgrep_status; keeping $RUN_DIR for diagnosis" >&2
    return 2>/dev/null || exit 1
  fi
fi
```

On Windows, where neither Bash nor `pgrep` is available:

```powershell
Stop-Process -Id $codePid -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Resolve first: only a real launcher run directory may be removed. The Windows
# launcher names it `<temp>\code-oss-dev\<timestamp-pid>`, so the check is that
# it is a direct child of that base - the leaf is a timestamp, not a prefix.
$resolved = Resolve-Path -LiteralPath $info.runDir -ErrorAction SilentlyContinue
$runDir = if ($resolved) { $resolved.ProviderPath } else { $null }
$base = (Resolve-Path -LiteralPath (Join-Path $env:TEMP 'code-oss-dev') -ErrorAction SilentlyContinue)
$leaf = if ($runDir) { Split-Path -Leaf $runDir } else { '' }
if (-not $runDir -or -not $base -or (Split-Path -Parent $runDir) -ne $base.ProviderPath -or $leaf -notmatch '^\d{8}-\d{6}-\d+$') {
	throw "refusing to clean up: bad runDir '$($info.runDir)'"
}

# Match on the command line, so other agents' concurrent instances are left
# alone. Compare literally rather than with `-like`: a temp path containing
# `[` or `]` would be read as a wildcard character class, which can miss this
# instance (deleting a live profile) or match unrelated processes.
$needle = $runDir.ToLowerInvariant()
$survivors = { Get-CimInstance Win32_Process -ErrorAction Stop |
	Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) } }

try {
	$running = @(& $survivors)
} catch {
	throw "process enumeration failed; keeping $runDir for diagnosis: $($_.Exception.Message)"
}
$running | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# Only discard the profile once nothing is left: a survivor still holds the
# run's logs open, and deleting them removes the evidence you need.
try {
	$left = @(& $survivors)
} catch {
	throw "process enumeration failed; keeping $runDir for diagnosis: $($_.Exception.Message)"
}
if ($left) {
	Write-Host "STILL RUNNING: $($left.ProcessId -join ' ')"
	Write-Host "keeping $runDir for diagnosis"
} else {
	Remove-Item -LiteralPath $runDir -Recurse -Force -ErrorAction SilentlyContinue
}
```

To audit the whole machine after a batch of runs — total resident memory and
leaked profiles across every launch:

```bash
# Match the launcher's run-dir argument, so this works on Linux too rather than
# only matching the macOS app-bundle path.
ps aux | grep "[c]ode-oss-dev-" | awk '{s+=$6} END {printf "Code OSS RSS: %.1f GB\n", s/1024/1024}'
# Profiles live under the launcher's temp base, or /tmp when that base was too
# long for unix sockets. Canonicalize first so an unset TMPDIR (or one resolving
# to /tmp) does not count every profile twice.
tmp_root=$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)
plain_tmp=$(cd /tmp 2>/dev/null && pwd -P)
if [ "$tmp_root" = "$plain_tmp" ]; then
  du -shc "$tmp_root"/code-oss-dev-* 2>/dev/null
else
  du -shc "$tmp_root"/code-oss-dev-* "$plain_tmp"/code-oss-dev-* 2>/dev/null
fi | tail -1
```

Both should be empty/zero once every instance you own has exited. If you are
running concurrently with other agents, scope by `runDir` rather than killing
every `Code - OSS` process, and prune only your own `/tmp/code-oss-dev-*` dirs.

## Troubleshooting

- **`Daemon pid=...: listen EINVAL` from `@playwright/cli`** - the daemon's socket path (`TMPDIR` + a fixed ~33-char prefix + the `-s=` session name) exceeded the ~103-byte unix socket limit. macOS's default `TMPDIR` leaves only ~16 characters for the session name, so shorten `-s=` first. If you need a longer name, scope the override to the single command (`TMPDIR=/tmp npx @playwright/cli ...`) rather than `export`ing it, so the launcher keeps using your private per-user temp dir.
- **"Sent env to running instance. Terminating..."** - The dynamic `--user-data-dir` should prevent this. If you see it, another Code OSS is using the same profile path; pass `--source-user-data-dir` to a different source or check that the temp copy actually happened (`ls "$(jq -r .userDataDir <<<"$INFO")"`).
- **Renderer ESM errors / `import { Menu } from 'electron'`** - `ELECTRON_RUN_AS_NODE` is set in your env. The launcher unsets it for the child, but if you spawn `code.sh` yourself, do the same.
- **Built-in extension fails to load (`Cannot find module .../extensions/.../out/extension.js`)** - extensions weren't compiled. Run `npm run compile` (one-shot, also rebuilds all built-in extensions) or `npm run watch` (incremental). A common cause: you ran `npm run transpile-client` to satisfy unit tests, which populated `out/` but not `extensions/*/out/`, so preLaunch's "is `out/` missing?" check skipped the compile.
- **`launch.sh` exits non-zero with a log tail** - either pre-launch failed, `code.sh` died before CDP came up, or CDP never opened within 90s. The tail printed to stderr is from `runDir/code.log` - read it to diagnose.
- **Snapshot shows the wrong page or no expected controls** - use `tab-list`, switch with `tab-select <index>` if needed, then re-snapshot before interacting.
- **CLI typing commands complete but the input stays empty** - run `playwrightScripts/focus-chat-input.ts`, use `press` or clipboard paste rather than `fill` / `type`, and verify the input state before sending.
- **Auth missing in the launched window** - confirm the source profile is actually authed (`ls "$SOURCE_UDD"` should contain `User/`, and `ls "$SOURCE_UDD/User/globalStorage"` should show persisted extension state). **On Windows, check the shared-data-dir first**: the GitHub session blob lives in `%USERPROFILE%\.vscode-oss-shared\sharedStorage\state.vscdb`, not in the profile. The launcher logs `copying shared data: <src> -> <dst>` on stderr when it finds it, and warns `no shared-data-dir at <path>` when it doesn't. A missing or empty source shared-data-dir means signing in again against the source profile is what you need - see [Windows authentication](#windows-authentication).
