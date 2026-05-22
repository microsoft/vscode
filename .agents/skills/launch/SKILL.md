---
name: launch
description: "Launch Code OSS (VS Code from sources) into an isolated throwaway profile with unique debug ports so you can drive it with @playwright/cli AND attach a Node debugger via dap-cli in the same session. Use when working on VS Code itself and you want to interact with the running workbench, automate chat or UI flows, test UI features, take screenshots, set breakpoints in the renderer / extension host / main process, or combine UI driving with debugging."
---

# Code OSS Dev - Launch + Debug

You're working on VS Code itself and you want to:

1. Launch a Code OSS build from sources that is **already signed in** (Copilot, GitHub, etc.) so chat / agent flows work end-to-end.
2. Drive it with `@playwright/cli` over CDP (UI automation).
3. Optionally attach a debugger via **dap-cli** to set breakpoints in the renderer, extension host, or main process.
4. Run multiple instances at once without port conflicts.

This skill provides a launcher that clones an authenticated user-data-dir to a throwaway temp folder, picks free ports for every debug surface, and prints them as JSON so you can pick them up programmatically.

The clone is **slim**: workspace storage, browser caches, file history, cached VSIX backups, and old logs are excluded by default. Auth tokens themselves live in the OS keychain (shared automatically) plus small files inside `User/globalStorage` - both of which *are* preserved.

## Prerequisites

- macOS or Linux. The launcher is a bash script and depends on `rsync`, `lsof`, `jq`, `nohup`, and Node on `PATH`.
- A VS Code checkout with sources built. Run `npm run watch` in another terminal (or rely on `./scripts/code.sh` to compile the first time).
- An **authenticated** Code OSS profile to seed from. By default the launcher uses `~/.vscode-oss-dev`, which is the user-data-dir the repo's `launch.json` configs use - if the user has ever signed in to Copilot in a dev build, this should work. Only pass `--source-user-data-dir <path>` (or set `$CODE_OSS_DEV_AUTHED_USER_DATA_DIR`) when you specifically want to seed from a different profile (e.g. your regular `~/Library/Application Support/Code` install).
- `@playwright/cli` available (it's a devDependency in the vscode repo - `npm install` then use `npx @playwright/cli`).
- For debugger work: `dap-cli` on `PATH`. If debugger support would be useful but the `dap-cli` skill is not present, prompt the user to install it from https://github.com/roblourens/dap-cli.
- CSS selectors are internal implementation details. If a selector-based `eval` stops working, take a fresh `snapshot`, inspect the current DOM, and update the selector rather than assuming an old one still applies.

> The launcher **copies** the source profile to a temp dir and never mutates the original. Each launch gets its own isolated `--user-data-dir` and `--extensions-dir`.

## Launch

The launcher script lives next to this SKILL.md at `scripts/launch.sh`. Resolve it relative to wherever this skill file is installed - do not hardcode an absolute path.

```bash
# LAUNCH=<dir-of-this-SKILL.md>/scripts/launch.sh
"$LAUNCH"                                    # default: workbench
"$LAUNCH" --agents                           # Agents window
"$LAUNCH" -- <workspace-path>                # forward extra args to code.sh
"$LAUNCH" --source-user-data-dir <path>      # pick a specific authed profile
"$LAUNCH" --repo <vscode-repo-root>          # if not run from the repo
"$LAUNCH" --clone-extensions                 # start with a copy of the source extensions/ (~few seconds)
"$LAUNCH" --full                             # skip slim excludes; copy everything
```

### What gets copied (slim mode, the default)

The exclude list mirrors the one used by VS Code's own perf-test skill (`.github/skills/auto-perf-optimize`), which is known to keep Copilot auth and language-model availability working. Specifically `WebStorage/`, `Service Worker/`, `Local Storage/`, `Cookies`, `Network Persistent State`, `TransportSecurity`, `Trust Tokens`, `Preferences`, `machineid`, and the entire `User/globalStorage/` (which holds `state.vscdb` - where extension `SecretStorage` blobs live, encrypted with the OS keychain key) are all preserved. Auth tokens themselves stay in the OS keychain, which is per-user, so they follow automatically.

Excluded (transient, regenerable, or known-not-needed):
- `User/workspaceStorage/` - per-workspace state, **including stored chat sessions** (often multi-GB)
- `User/History/` - local file edit history
- `CachedExtensionVSIXs` - backup VSIXs (hundreds of MB)
- `logs`
- Chromium caches: `Cache`, `Code Cache`, `CachedData`, `GPUCache`, `ShaderCache`, `Dawn*Cache`, `component_crx_cache`
- `Backups`, `blob_storage`, `BrowserMetrics`, `Crashpad`, `Session Storage`
- `Singleton*`, `*.lock`, `*.sock` (would conflict with the source instance)

`extensions/` defaults to a **fresh empty directory** - fastest and conflict-free, but the launched instance starts with no third-party extensions installed. Pass `--clone-extensions` to copy the source extensions dir into the temp profile so the new instance is independent of the source. Pass `--full` to skip all excludes if you suspect the slim copy is missing something you need.

> **Why never share the source `extensions/` dir directly?** The extension management service writes a shared `.obsolete` file; two concurrent writers crash each other's shared background process. The launcher always uses an isolated extensions dir for the same reason it uses `--shared-data-dir` (see below).

> If the launched window says "language model unavailable" or otherwise looks unauthed, ask the user to sign in.

The script prints one JSON line on stdout (logs go to stderr):

```json
{"pid":12345,"cdpPort":53111,"extHostPort":53112,"mainPort":53113,"agentHostPort":53114,"userDataDir":".../user-data","extensionsDir":".../extensions","sharedDataDir":".../shared-data","runDir":"...","logFile":".../code.log","repo":"...","agents":false}
```

Capture it with `jq`:

```bash
INFO=$("$LAUNCH" | tail -n1)
CDP=$(jq -r .cdpPort        <<<"$INFO")
EXT=$(jq -r .extHostPort    <<<"$INFO")
MAIN=$(jq -r .mainPort      <<<"$INFO")
AGENT=$(jq -r .agentHostPort <<<"$INFO")
LOG=$(jq -r .logFile        <<<"$INFO")
PID=$(jq -r .pid            <<<"$INFO")
```

### What each port is for

| Port | Process | Use with |
|------|---------|----------|
| `cdpPort` (`--remote-debugging-port`) | Renderer (the workbench window) | `@playwright/cli` over CDP, also Chrome DevTools |
| `extHostPort` (`--inspect-extensions`) | Extension host (Node) | `dap-cli` (Node inspector protocol) |
| `mainPort` (`--inspect`) | Electron main process (Node) | `dap-cli` (Node inspector protocol) |
| `agentHostPort` (`--inspect-agenthost`) | Agent host process (Node) | `dap-cli` (Node inspector protocol) |

## Drive the UI with @playwright/cli

Use the dynamic `cdpPort` from the launch JSON. The normal loop is: attach, confirm the target, snapshot, interact, then re-snapshot after meaningful UI changes.

```bash
# Wait for Code OSS to start, retry until attached
for i in 1 2 3 4 5; do
	npx @playwright/cli attach --cdp=http://127.0.0.1:$CDP 2>/dev/null && break || sleep 3
done

npx @playwright/cli tab-list
npx @playwright/cli snapshot
```

After `attach`, later `@playwright/cli` commands keep using the connected app until you close or reattach.

### Selecting the right Electron target

Electron apps can expose multiple windows or webviews. If `tab-list` shows `about:blank`, a webview, or otherwise the wrong target, switch targets before interacting:

```bash
npx @playwright/cli tab-list
npx @playwright/cli tab-select 2
npx @playwright/cli snapshot
```

If a target looks stale after relaunching, run `npx @playwright/cli close`, attach again with `$CDP`, and re-check `tab-list`.

### Focusing the chat input (works on Code OSS, including the Agents window)

```bash
# macOS
npx @playwright/cli press Control+Meta+i
# Linux / Windows
npx @playwright/cli press Control+Alt+i
```

### Typing into Monaco (chat input, editors)

`fill` and `type` **silently fail** on Code OSS. Prefer focus-via-shortcut plus either per-key `press` or clipboard paste, and verify text when the scenario depends on the exact prompt.

- **Per-key `press`** (universal but slow):
  ```bash
  npx @playwright/cli press H
  npx @playwright/cli press i
  npx @playwright/cli press Enter
  ```
- **Clipboard paste** (fast, macOS):
  ```bash
  printf '%s' "Your prompt here" | pbcopy
  npx @playwright/cli press Control+Meta+i   # focus chat input
  npx @playwright/cli press Meta+v           # paste
  npx @playwright/cli press Enter
  ```

The focus shortcut should leave `document.activeElement` on VS Code's `native-edit-context` editing surface. That is a useful sanity check when key presses appear to do nothing.

### Agents window selector differences

The Agents window does not use the regular workbench `.interactive-input-editor` wrapper. Selector checks that are scoped to that wrapper may return nothing even when the Agents chat input is focused.

```js
// Regular-workbench-specific selector; do not assume this exists in Agents.
document.querySelectorAll('.interactive-input-editor .view-line')

// More useful checks in Agents.
document.querySelectorAll('.view-line')
document.activeElement?.className === 'native-edit-context'
```

The `Control+Meta+i` / `Control+Alt+i` focus shortcut still works; only the DOM shape after focus differs.

### Verifying and clearing chat text

For the regular workbench sidebar, this confirms that text landed in the Monaco input:

```bash
npx @playwright/cli eval '
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
npx @playwright/cli press Meta+a
# Linux / Windows
npx @playwright/cli press Control+a
npx @playwright/cli press Backspace
```

If the keyboard shortcut cannot focus chat because the surface is not available yet, take a snapshot and navigate the UI into a state where chat exists before retrying. Avoid treating completed CLI commands as proof that text was entered.

### Screenshots (paper trail)

```bash
SHOTS="$PWD/screenshots/$(date +%Y-%m-%dT%H-%M-%S)"
mkdir -p "$SHOTS"
npx @playwright/cli screenshot --filename="$SHOTS/after-launch.png"
```

> Keep screenshots inside the workspace, not `/tmp`, so they survive for review.

For wide windows, `--full-page` can make layout easier to inspect, and element screenshots are useful when a snapshot gives a stable ref for the panel you care about:

```bash
npx @playwright/cli screenshot --full-page --filename="$SHOTS/full-window.png"
npx @playwright/cli screenshot e42 --filename="$SHOTS/panel.png"
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

The launcher also passes `--shared-data-dir=<runDir>/shared-data`. This is **required** for multi-instance isolation: Code OSS keeps a fixed-path SQLite DB at `~/.<dataFolderName>-shared/sharedStorage/state.vscdb` that is *not* covered by `--user-data-dir`. Without overriding it, two concurrent instances would fight over the same file and one would die with "shared background process terminated unexpectedly". Each launch gets its own `shared-data` dir.

## Restart after source changes

Workbench code is loaded when the Code OSS window starts; source changes are not hot-reloaded into an already-running instance. After the build output is current, kill the launched process, launch again, and reattach to the new `cdpPort` from the new JSON blob.

```bash
kill "$PID" 2>/dev/null || true
INFO=$("$LAUNCH" | tail -n1)
CDP=$(jq -r .cdpPort <<<"$INFO")
PID=$(jq -r .pid <<<"$INFO")
for i in 1 2 3 4 5; do
  npx @playwright/cli attach --cdp=http://127.0.0.1:$CDP 2>/dev/null && break || sleep 3
done
npx @playwright/cli tab-list
npx @playwright/cli snapshot
```

If you are iterating frequently, keep the repo build/watch task running separately so relaunches pick up already-generated output.

## Cleanup

The launcher writes everything under a temp `runDir` (printed in the JSON). When you're done:

```bash
# Disconnect playwright
npx @playwright/cli close

# Kill the Code OSS instance
kill "$PID" 2>/dev/null || true
# Or by port if you've lost the pid:
pids=$(lsof -t -i :$CDP); [ -n "$pids" ] && kill $pids

# Remove the throwaway profile
rm -rf "$(dirname "$LOG")"
```

Code OSS is a full Electron app and easily eats 1-4 GB. Always clean up.

## Troubleshooting

- **"Sent env to running instance. Terminating..."** - The dynamic `--user-data-dir` should prevent this. If you see it, another Code OSS is using the same profile path; pass `--source-user-data-dir` to a different source or check that the temp copy actually happened (`ls "$(jq -r .userDataDir <<<"$INFO")"`).
- **Renderer ESM errors / `import { Menu } from 'electron'`** - `ELECTRON_RUN_AS_NODE` is set in your env. The launcher unsets it for the child, but if you spawn `code.sh` yourself, do the same.
- **Built-in extension fails to load (`Cannot find module .../extensions/.../out/extension.js`)** - extensions weren't compiled. Run `npm run watch-extensions` (or `npm run compile-extensions`).
- **CDP connect refused** - give it a few seconds; the launcher returns before the renderer is ready. Use the retry loop above.
- **Snapshot shows the wrong page or no expected controls** - use `tab-list`, switch with `tab-select <index>` if needed, then re-snapshot before interacting.
- **CLI typing commands complete but the input stays empty** - focus chat with the platform shortcut, use `press` or clipboard paste rather than `fill` / `type`, then verify the input state before sending.
- **Auth missing in the launched window** - confirm the source profile is actually authed (`ls "$SOURCE_UDD"` should contain `User/`, and `ls "$SOURCE_UDD/User/globalStorage"` should show persisted extension state). Some auth lives in the OS keychain - that's per-user, so it follows automatically as long as you're running as the same user.
