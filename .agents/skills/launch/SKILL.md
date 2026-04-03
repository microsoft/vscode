---
name: launch
description: "Launch and automate VS Code (Code OSS) using agent-browser via Chrome DevTools Protocol. Use when you need to interact with the VS Code UI, automate the chat panel, test UI features, or take screenshots of VS Code. Triggers include 'automate VS Code', 'interact with chat', 'test the UI', 'take a screenshot', 'launch Code OSS with debugging'."
metadata:
  allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
---

# VS Code Automation

Automate VS Code (Code OSS) using agent-browser. VS Code is built on Electron/Chromium and exposes a Chrome DevTools Protocol (CDP) port that agent-browser can connect to, enabling the same snapshot-interact workflow used for web pages.

## Prerequisites

- **`agent-browser` must be installed.** It's listed in devDependencies — run `npm install` in the repo root. Use `npx agent-browser` if it's not on your PATH, or install globally with `npm install -g agent-browser`.
- **For Code OSS (VS Code dev build):** The repo must be built before launching. `./scripts/code.sh` runs the build automatically if needed, or set `VSCODE_SKIP_PRELAUNCH=1` to skip the compile step if you've already built.
- **CSS selectors are internal implementation details.** Selectors like `.interactive-input-part`, `.interactive-input-editor`, and `.part.auxiliarybar` used in `eval` commands are VS Code internals that may change across versions. If they stop working, use `agent-browser snapshot -i` to re-discover the current DOM structure.

## Core Workflow

1. **Launch** Code OSS with remote debugging enabled
2. **Connect** agent-browser to the CDP port
3. **Snapshot** to discover interactive elements
4. **Interact** using element refs
5. **Re-snapshot** after navigation or state changes

> **📸 Take screenshots for a paper trail.** Use `agent-browser screenshot <path>` at key moments — after launch, before/after interactions, and when something goes wrong. Screenshots provide visual proof of what the UI looked like and are invaluable for debugging failures or documenting what was accomplished.
>
> Save screenshots inside a timestamped subfolder so each run is isolated and nothing gets overwritten:
>
> ```bash
> # Create a timestamped folder for this run's screenshots
> SCREENSHOT_DIR="/tmp/code-oss-screenshots/$(date +%Y-%m-%dT%H-%M-%S)"
> mkdir -p "$SCREENSHOT_DIR"
>
> # Save a screenshot (path is a positional argument — use ./ or absolute paths)
> # Bare filenames without ./ may be misinterpreted as CSS selectors
> agent-browser screenshot "$SCREENSHOT_DIR/after-launch.png"
> ```

```bash
# Launch Code OSS with remote debugging
./scripts/code.sh --remote-debugging-port=9224

# Wait for Code OSS to start, retry until connected
for i in 1 2 3 4 5; do agent-browser connect 9224 2>/dev/null && break || sleep 3; done

# Verify you're connected to the right target (not about:blank)
# If `tab` shows the wrong target, run `agent-browser close` and reconnect
agent-browser tab

# Discover UI elements
agent-browser snapshot -i

# Focus the chat input (macOS)
agent-browser press Control+Meta+i
```

## Connecting

```bash
# Connect to a specific port
agent-browser connect 9222

# Or use --cdp on each command
agent-browser --cdp 9222 snapshot -i

# Auto-discover a running Chromium-based app
agent-browser --auto-connect snapshot -i
```

After `connect`, all subsequent commands target the connected app without needing `--cdp`.

## Tab Management

Electron apps often have multiple windows or webviews. Use tab commands to list and switch between them:

```bash
# List all available targets (windows, webviews, etc.)
agent-browser tab

# Switch to a specific tab by index
agent-browser tab 2

# Switch by URL pattern
agent-browser tab --url "*settings*"
```

## Launching Code OSS (VS Code Dev Build)

The VS Code repository includes `scripts/code.sh` which launches Code OSS from source. It passes all arguments through to the Electron binary, so `--remote-debugging-port` works directly:

```bash
cd <repo-root>  # the root of your VS Code checkout
./scripts/code.sh --remote-debugging-port=9224
```

Wait for the window to fully initialize, then connect:

```bash
# Wait for Code OSS to start, retry until connected
for i in 1 2 3 4 5; do agent-browser connect 9224 2>/dev/null && break || sleep 3; done

# Verify you're connected to the right target (not about:blank)
# If `tab` shows the wrong target, run `agent-browser close` and reconnect
agent-browser tab
agent-browser snapshot -i
```

**Tips:**
- Set `VSCODE_SKIP_PRELAUNCH=1` to skip the compile step if you've already built: `VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh --remote-debugging-port=9224` (from the repo root)
- Code OSS uses the default user data directory. Unlike VS Code Insiders, you don't typically need `--user-data-dir` since there's usually only one Code OSS instance running.
- If you see "Sent env to running instance. Terminating..." it means Code OSS is already running and forwarded your args to the existing instance. Quit Code OSS and relaunch with the flag, or use `--user-data-dir=/tmp/code-oss-debug` to force a new instance.

## Launching the Agents App (Agents Window)

The Agents app is a separate workbench mode launched with the `--agents` flag. It uses a dedicated user data directory to avoid conflicts with the main Code OSS instance.

```bash
cd <repo-root>  # the root of your VS Code checkout
./scripts/code.sh --agents --remote-debugging-port=9224
```

Wait for the window to fully initialize, then connect:

```bash
# Wait for Agents app to start, retry until connected
for i in 1 2 3 4 5; do agent-browser connect 9224 2>/dev/null && break || sleep 3; done

# Verify you're connected to the right target (not about:blank)
agent-browser tab
agent-browser snapshot -i
```

**Tips:**
- The `--agents` flag launches the Agents workbench instead of the standard VS Code workbench.
- Set `VSCODE_SKIP_PRELAUNCH=1` to skip the compile step if you've already built.

## Launching VS Code Extensions for Debugging

To debug a VS Code extension via agent-browser, launch VS Code Insiders with `--extensionDevelopmentPath` and `--remote-debugging-port`. Use `--user-data-dir` to avoid conflicting with an already-running instance.

```bash
# Build the extension first
cd <extension-repo-root>  # e.g., the root of your extension checkout
npm run compile

# Launch VS Code Insiders with the extension and CDP
code-insiders \
  --extensionDevelopmentPath="<extension-repo-root>" \
  --remote-debugging-port=9223 \
  --user-data-dir=/tmp/vscode-ext-debug

# Wait for VS Code to start, retry until connected
for i in 1 2 3 4 5; do agent-browser connect 9223 2>/dev/null && break || sleep 3; done

# Verify you're connected to the right target (not about:blank)
# If `tab` shows the wrong target, run `agent-browser close` and reconnect
agent-browser tab
agent-browser snapshot -i
```

**Key flags:**
- `--extensionDevelopmentPath=<path>` — loads your extension from source (must be compiled first)
- `--remote-debugging-port=9223` — enables CDP (use 9223 to avoid conflicts with other apps on 9222)
- `--user-data-dir=<path>` — uses a separate profile so it starts a new process instead of sending to an existing VS Code instance

**Without `--user-data-dir`**, VS Code detects the running instance, forwards the args to it, and exits immediately — you'll see "Sent env to running instance. Terminating..." and CDP never starts.

## Restarting After Code Changes

**After making changes to Code OSS source code, you must restart to pick up the new build.** The workbench loads the compiled JavaScript at startup — changes are not hot-reloaded.

### Restart Workflow

1. **Rebuild** the changed code
2. **Kill** the running Code OSS instance
3. **Relaunch** with the same flags

```bash
# 1. Ensure your build is up to date.
#    Normally you can skip a manual step here and let ./scripts/code.sh in step 3
#    trigger the build when needed (or run `npm run watch` in another terminal).

# 2. Kill the Code OSS instance listening on the debug port (if running)
pids=$(lsof -t -i :9224)
if [ -n "$pids" ]; then
	kill $pids
fi

# 3. Relaunch
./scripts/code.sh --remote-debugging-port=9224

# 4. Reconnect agent-browser
for i in 1 2 3 4 5; do agent-browser connect 9224 2>/dev/null && break || sleep 3; done
agent-browser tab
agent-browser snapshot -i
```

> **Tip:** If you're iterating frequently, run `npm run watch` in a separate terminal so compilation happens automatically. You still need to kill and relaunch Code OSS to load the new build.

## Interacting with Monaco Editor (Chat Input, Code Editors)

VS Code uses Monaco Editor for all text inputs including the Copilot Chat input. Monaco editors require specific agent-browser techniques — standard `click`, `fill`, and `keyboard type` commands may not work depending on the VS Code build.

### The Universal Pattern: Focus via Keyboard Shortcut + `press`

This works on **all** VS Code builds (Code OSS, Insiders, stable):

```bash
# 1. Open and focus the chat input with the keyboard shortcut
# macOS:
agent-browser press Control+Meta+i
# Linux / Windows:
agent-browser press Control+Alt+i

# 2. Type using individual press commands
agent-browser press H
agent-browser press e
agent-browser press l
agent-browser press l
agent-browser press o
agent-browser press Space  # Use "Space" for spaces
agent-browser press w
agent-browser press o
agent-browser press r
agent-browser press l
agent-browser press d

# Verify text appeared (optional)
agent-browser eval '
(() => {
  const sidebar = document.querySelector(".part.auxiliarybar");
  const viewLines = sidebar.querySelectorAll(".interactive-input-editor .view-line");
  return Array.from(viewLines).map(vl => vl.textContent).join("|");
})()'

# 3. Send the message (same on all platforms)
agent-browser press Enter
```

**Chat focus shortcut by platform:**
- **macOS:** `Ctrl+Cmd+I` → `agent-browser press Control+Meta+i`
- **Linux:** `Ctrl+Alt+I` → `agent-browser press Control+Alt+i`
- **Windows:** `Ctrl+Alt+I` → `agent-browser press Control+Alt+i`

This shortcut focuses the chat input and sets `document.activeElement` to a `DIV` with class `native-edit-context` — VS Code's native text editing surface that correctly processes key events from `agent-browser press`.

### `type @ref` — Works on Some Builds

On VS Code Insiders (extension debug mode), `type @ref` handles focus and input in one step:

```bash
agent-browser snapshot -i
# Look for: textbox "The editor is not accessible..." [ref=e62]
agent-browser type @e62 "Hello from George!"
```

> **Tip:** If `type @ref` silently drops text (the editor stays empty), the ref may be stale or the editor not yet ready. Re-snapshot to get a fresh ref and try again. You can verify text was entered using the snippet in "Verifying Text and Clearing" below.

However, **`type @ref` silently fails on Code OSS** — the command completes without error but no text appears. This also applies to `keyboard type` and `keyboard inserttext`. Always verify text appeared after typing, and fall back to the keyboard shortcut + `press` pattern if it didn't. The `press`-per-key approach works universally across all builds.

> **⚠️ Warning:** `keyboard type` can hang indefinitely in some focus states (e.g., after JS mouse events). If it doesn't return within a few seconds, interrupt it and fall back to `press` for individual keystrokes.

### Compatibility Matrix

| Method | VS Code Insiders | Code OSS |
|--------|-----------------|----------|
| `press` per key (after focus shortcut) | ✅ Works | ✅ Works |
| `type @ref` | ✅ Works | ❌ Silent fail |
| `keyboard type` (after focus) | ✅ Works | ❌ Silent fail |
| `keyboard inserttext` (after focus) | ✅ Works | ❌ Silent fail |
| `click @ref` | ❌ Blocked by overlay | ❌ Blocked by overlay |
| `fill @ref` | ❌ Element not visible | ❌ Element not visible |

### Fallback: Focus via JavaScript Mouse Events

If the keyboard shortcut doesn't work (e.g., chat panel isn't configured), you can focus the editor via JavaScript:

```bash
agent-browser eval '
(() => {
  const inputPart = document.querySelector(".interactive-input-part");
  const editor = inputPart.querySelector(".monaco-editor");
  const rect = editor.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  editor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
  editor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
  editor.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  return "activeElement: " + document.activeElement?.className;
})()'

# Then use press for each character
agent-browser press H
agent-browser press e
# ...
```

### Verifying Text and Clearing

```bash
# Verify text in the chat input
agent-browser eval '
(() => {
  const sidebar = document.querySelector(".part.auxiliarybar");
  const viewLines = sidebar.querySelectorAll(".interactive-input-editor .view-line");
  return Array.from(viewLines).map(vl => vl.textContent).join("|");
})()'

# Clear the input (Select All + Backspace)
# macOS:
agent-browser press Meta+a
# Linux / Windows:
agent-browser press Control+a
# Then delete:
agent-browser press Backspace
```

### Screenshot Tips for VS Code

On ultrawide monitors, the chat sidebar may be in the far-right corner of the CDP screenshot. Options:
- Use `agent-browser screenshot --full` to capture the entire window
- Use element screenshots: `agent-browser screenshot ".part.auxiliarybar" sidebar.png`
- Use `agent-browser screenshot --annotate` to see labeled element positions
- Maximize the sidebar first: click the "Maximize Secondary Side Bar" button

> **macOS:** If `agent-browser screenshot` returns "Permission denied", your terminal needs Screen Recording permission. Grant it in **System Settings → Privacy & Security → Screen Recording**. As a fallback, use the `eval` verification snippet to confirm text was entered — this doesn't require screen permissions.

## Troubleshooting

### "Connection refused" or "Cannot connect"

- Make sure Code OSS was launched with `--remote-debugging-port=NNNN`
- If Code OSS was already running, quit and relaunch with the flag
- Check that the port isn't in use by another process:
  - macOS / Linux: `lsof -i :9224`
  - Windows: `netstat -ano | findstr 9224`

### Elements not appearing in snapshot

- VS Code uses multiple webviews. Use `agent-browser tab` to list targets and switch to the right one
- Use `agent-browser snapshot -i -C` to include cursor-interactive elements (divs with onclick handlers)

### Cannot type in Monaco Editor inputs

- Use `agent-browser press` for individual keystrokes after focusing the input. Focus the chat input with the keyboard shortcut (macOS: `Ctrl+Cmd+I`, Linux/Windows: `Ctrl+Alt+I`).
- `type @ref`, `keyboard type`, and `keyboard inserttext` work on VS Code Insiders but **silently fail on Code OSS** — they complete without error but no text appears. The `press`-per-key approach works universally.
- See the "Interacting with Monaco Editor" section above for the full compatibility matrix.

## Cleanup

**Always kill the Code OSS instance when you're done.** Code OSS is a full Electron app that consumes significant memory (often 1–4 GB+). Leaving it running wastes resources and holds the CDP port.

```bash
# Disconnect agent-browser
agent-browser close

# Kill the Code OSS instance listening on the debug port (if running)
# macOS / Linux:
pids=$(lsof -t -i :9224)
if [ -n "$pids" ]; then
	kill $pids
fi

# Windows:
# taskkill /F /PID <PID>
# Or use Task Manager to end "Code - OSS"
```

Verify it's gone:
```bash
# Confirm no process is listening on the debug port
lsof -i :9224  # should return nothing
```
