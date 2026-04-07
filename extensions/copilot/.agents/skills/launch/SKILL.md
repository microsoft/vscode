---
name: launch
description: "Launch and automate VS Code Insiders with the Copilot Chat extension using agent-browser via Chrome DevTools Protocol. Use when you need to interact with the VS Code UI, automate the chat panel, test the extension UI, or take screenshots. Triggers include 'automate VS Code', 'interact with chat', 'test the UI', 'take a screenshot', 'launch with debugging'."
metadata:
  allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
---

# VS Code Extension Automation

Automate VS Code Insiders with the Copilot Chat extension using agent-browser. VS Code is built on Electron/Chromium and exposes a Chrome DevTools Protocol (CDP) port that agent-browser can connect to, enabling the same snapshot-interact workflow used for web pages.

## Prerequisites

- **`agent-browser` must be installed.** It's available in the project's devDependencies — run `npm install`. Use `npx agent-browser` if it's not on your PATH, or install globally with `npm install -g agent-browser`.
- **`code-insiders` is required.** This extension uses 58 proposed VS Code APIs and targets `vscode ^1.110.0-20260223`. VS Code Stable will **not** activate it — you must use VS Code Insiders.
- **The extension must be compiled first.** Use `npm run compile` for a one-shot build, or `npm run watch` for iterative development.
- **CSS selectors are internal implementation details.** Selectors like `.interactive-input-part`, `.monaco-editor`, and `.view-line` are VS Code internals that may change across versions. If automation breaks after a VS Code update, re-snapshot and check for selector changes.

## Core Workflow

1. **Build** the extension
2. **Launch** VS Code Insiders with the extension and remote debugging enabled
3. **Connect** agent-browser to the CDP port
4. **Snapshot** to discover interactive elements
5. **Interact** using element refs
6. **Re-snapshot** after navigation or state changes

> **📸 Take screenshots for a paper trail.** Use `agent-browser screenshot <path>` at key moments — after launch, before/after interactions, and when something goes wrong. Screenshots provide visual proof of what the UI looked like and are invaluable for debugging failures or documenting what was accomplished.
>
> Save screenshots inside `.vscode-ext-debug/screenshots/` (gitignored) using a timestamped subfolder so each run is isolated and nothing gets overwritten:
>
> ```bash
> # Create a timestamped folder for this run's screenshots
> SCREENSHOT_DIR=".vscode-ext-debug/screenshots/$(date +%Y-%m-%dT%H-%M-%S)"
> mkdir -p "$SCREENSHOT_DIR"
>
> # Windows (PowerShell):
> # $screenshotDir = ".vscode-ext-debug\screenshots\$(Get-Date -Format 'yyyy-MM-ddTHH-mm-ss')"
> # New-Item -ItemType Directory -Force -Path $screenshotDir
>
> # Save a screenshot (path is a positional argument — use ./ or absolute paths)
> # Bare filenames without ./ may be misinterpreted as CSS selectors
> agent-browser screenshot "$SCREENSHOT_DIR/after-launch.png"
> ```

```bash
# Build and launch with the extension
npm run compile
# Use a PERSISTENT user-data-dir so auth state is preserved across sessions.
# .vscode-ext-debug is relative to the project root — works in worktrees and is gitignored.
code-insiders --extensionDevelopmentPath="$PWD" --remote-debugging-port=9223 --user-data-dir="$PWD/.vscode-ext-debug"
# On Windows (PowerShell):
# code-insiders --extensionDevelopmentPath="$PWD" --remote-debugging-port=9223 --user-data-dir="$PWD\.vscode-ext-debug"

# Wait for VS Code to start, retry until connected
for i in 1 2 3 4 5; do agent-browser connect 9223 2>/dev/null && break || sleep 3; done

# Verify you're connected to the right target (not about:blank)
# If `tab` shows the wrong target, run `agent-browser close` and reconnect
agent-browser tab
agent-browser snapshot -i
```

## Connecting

```bash
# Connect to a specific port
agent-browser connect 9223

# Or use --cdp on each command
agent-browser --cdp 9223 snapshot -i

# Auto-discover a running Chromium-based app
agent-browser --auto-connect snapshot -i
```

After `connect`, all subsequent commands target the connected app without needing `--cdp`.

## Tab Management

VS Code uses multiple webviews internally. Use tab commands to list and switch between them:

```bash
# List all available targets (windows, webviews, etc.)
agent-browser tab

# Switch to a specific tab by index
agent-browser tab 2

# Switch by URL pattern
agent-browser tab --url "*settings*"
```

## Launching VS Code Extensions for Debugging

To debug a VS Code extension via agent-browser, launch VS Code Insiders with `--extensionDevelopmentPath` pointing to your extension source and `--remote-debugging-port` for CDP. Use `--user-data-dir` to avoid conflicting with an already-running VS Code instance.

```bash
# Build the extension first (from the repo root)
npm run compile

# Launch VS Code Insiders with the extension and CDP
# IMPORTANT: Use a persistent directory (not /tmp) so auth state is preserved.
# .vscode-ext-debug is relative to the project root — works in worktrees and is gitignored.
code-insiders \
  --extensionDevelopmentPath="$PWD" \
  --remote-debugging-port=9223 \
  --user-data-dir="$PWD/.vscode-ext-debug"

# Wait for VS Code to start, retry until connected
for i in 1 2 3 4 5; do agent-browser connect 9223 2>/dev/null && break || sleep 3; done

# Verify you're connected to the right target (not about:blank)
# If `tab` shows the wrong target, run `agent-browser close` and reconnect
agent-browser tab
agent-browser snapshot -i
```

**Key flags:**
- `--extensionDevelopmentPath=<path>` — loads your extension from source (must be compiled first). Use `$PWD` when running from the repo root.
- `--remote-debugging-port=9223` — enables CDP (use 9223 to avoid conflicts with other apps on 9222)
- `--user-data-dir=<path>` — uses a separate profile so it starts a new process instead of sending to an existing VS Code instance. **Always use a persistent path** (e.g., `$PWD/.vscode-ext-debug`) rather than `/tmp/...` so authentication, settings, and extension state survive across sessions.

**Without `--user-data-dir`**, VS Code detects the running instance, forwards the args to it, and exits immediately — you'll see "Sent env to running instance. Terminating..." and CDP never starts.

> **⚠️ Authentication is required.** The Copilot Chat extension needs an authenticated GitHub session to function. Using a temp directory (e.g., `/tmp/...`) creates a fresh profile with no auth — the agent will hit a "Sign in to use Copilot" wall and model resolution will fail with "Language model unavailable."
>
> **Always use a persistent `--user-data-dir`** like `$PWD/.vscode-ext-debug`. On first use, launch once and sign in manually. Subsequent launches will reuse the auth session.

## Restarting After Code Changes

**After making changes to the extension source code, you must restart VS Code to pick up the new build.** The extension host loads the compiled bundle at startup — changes are not hot-reloaded.

### Restart Workflow

1. **Recompile** the extension
2. **Kill** the running VS Code instance (the one using your debug user-data-dir)
3. **Relaunch** VS Code with the same flags

```bash
# 1. Recompile
npm run compile

# 2. Kill the VS Code instance tied to this project's debug profile, then relaunch
# macOS / Linux:
kill $(ps ax -ww -o pid,command | grep "$PWD/.vscode-ext-debug" | grep -v grep | awk '{print $1}' | head -1)

# Windows (PowerShell):
# Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$PWD\.vscode-ext-debug*" } | ForEach-Object { Stop-Process -Id $_.ProcessId }

# 3. Relaunch
code-insiders \
  --extensionDevelopmentPath="$PWD" \
  --remote-debugging-port=9223 \
  --user-data-dir="$PWD/.vscode-ext-debug"

# 4. Reconnect agent-browser
for i in 1 2 3 4 5; do agent-browser connect 9223 2>/dev/null && break || sleep 3; done
agent-browser snapshot -i
```

> **Tip:** If you're iterating frequently, run `npm run watch` in a separate terminal so compilation happens automatically. You still need to kill and relaunch VS Code to load the new bundle.

## Interacting with Monaco Editor (Chat Input, Code Editors)

VS Code uses Monaco Editor for all text inputs including the Copilot Chat input. Monaco editors appear as textboxes in the accessibility snapshot but require specific agent-browser commands to interact with.

### What Works

#### `type @ref` — The Best Approach

The `type` command with a snapshot ref handles focus and input in one step:

```bash
# Snapshot to find the chat input ref
agent-browser snapshot -i
# Look for: textbox "The editor is not accessible..." [ref=e51]

# Type directly using the ref — handles focus automatically
agent-browser type @e51 "Hello from George!"

# Send the message
agent-browser press Enter

# Wait for the response to complete before re-snapshotting.
# Poll until the "Stop generating" button disappears:
for i in $(seq 1 30); do
  agent-browser snapshot -i 2>/dev/null | grep -q "Stop generating" || break
  sleep 1
done
agent-browser snapshot -i
```

This is the simplest and most reliable method. It works for both the main editor chat input and the sidebar chat panel.

> **Tip:** If `type @ref` silently drops text (the editor stays empty), the ref may be stale or the editor not yet ready. Re-snapshot to get a fresh ref and try again. You can verify text was entered using the snippet in "Verifying Text in Monaco" below.

#### `keyboard type` / `keyboard inserttext` — After Focus

If focus is already on a Monaco editor, `keyboard type` and `keyboard inserttext` both work:

> **⚠️ Warning:** `keyboard type` can hang indefinitely in some focus states (e.g., after JS mouse events). If it doesn't return within a few seconds, interrupt it and fall back to `press` for individual keystrokes.

```bash
# Focus first (via type @ref, or JS mouse events, or a prior interaction)
agent-browser type @e51 ""
# Then keyboard type works for subsequent input
agent-browser keyboard type "More text here"
agent-browser keyboard inserttext "And this too"
```

#### `press` — Individual Keystrokes

Always works when focus is on a Monaco editor. Useful for special keys, keyboard shortcuts, and as a universal fallback for typing text character by character:

```bash
# Type text character by character (works on all builds)
agent-browser press H
agent-browser press e
agent-browser press l
agent-browser press l
agent-browser press o
agent-browser press Space  # Use "Space" for spaces

# Select all
# macOS:
agent-browser press Meta+a
# Linux / Windows:
agent-browser press Control+a

agent-browser press Backspace    # Delete selection
agent-browser press Enter        # Send message / new line

# Send to new chat
# macOS:
agent-browser press Meta+Shift+Enter
# Linux / Windows:
agent-browser press Control+Shift+Enter
```

### What Does NOT Work

| Method | Result | Reason |
|--------|--------|--------|
| `click @ref` | "Element blocked by another element" | Monaco overlays a transparent div over the textarea |
| `fill @ref "text"` | "Element not found or not visible" | The textbox is not a standard fillable input |
| `document.execCommand("insertText")` via `eval` | No effect | Monaco intercepts and discards execCommand |
| Setting `textarea.value` + dispatching `input` event via `eval` | No effect | Monaco doesn't read from the textarea's value property |

### Fallback: Focus via JavaScript Mouse Events

If `type @ref` doesn't work (e.g., ref is stale), you can focus the editor via JavaScript:

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

# After JS focus, keyboard type and press work
agent-browser keyboard type "Text after JS focus"
```

After JS mouse events, `document.activeElement` becomes a `DIV` with class `native-edit-context` — this is VS Code's native text editing surface.

### Verifying Text in Monaco

Monaco renders text in `.view-line` elements, not the textarea:

```bash
agent-browser eval '
(() => {
  const inputPart = document.querySelector(".interactive-input-part");
  return Array.from(inputPart.querySelectorAll(".view-line")).map(vl => vl.textContent).join("|");
})()'
```

### Clearing Monaco Input

```bash
# macOS:
agent-browser press Meta+a
# Linux / Windows:
agent-browser press Control+a

agent-browser press Backspace
```

## Troubleshooting

### "Connection refused" or "Cannot connect"

- Make sure VS Code Insiders was launched with `--remote-debugging-port=9223`
- If VS Code was already running, quit and relaunch with the flag
- Check that the port isn't in use by another process:
  - macOS / Linux: `lsof -i :9223`
  - Windows: `netstat -ano | findstr 9223`

### Elements not appearing in snapshot

- VS Code uses multiple webviews. Use `agent-browser tab` to list targets and switch to the right one
- Use `agent-browser snapshot -i -C` to include cursor-interactive elements (divs with onclick handlers)

### Cannot type in Monaco inputs

- Standard `click` and `fill` don't work on Monaco editors — see the "Interacting with Monaco Editor" section above for the full compatibility matrix
- `type @ref` is the best approach; individual `press` commands work everywhere; `keyboard type` and `keyboard inserttext` work after focus is established

### Screenshots fail with "Permission denied" (macOS)

If `agent-browser screenshot` returns "Permission denied", your terminal needs Screen Recording permission. Grant it in **System Settings → Privacy & Security → Screen Recording**. As a fallback, use the `eval` verification snippet to confirm text was entered — this doesn't require screen permissions.

## Cleanup

**Always kill the debug VS Code instance when you're done.** Leaving it running wastes resources and holds the CDP port.

```bash
# Disconnect agent-browser
agent-browser close

# Kill the debug VS Code instance
# macOS / Linux:
kill $(ps ax -ww -o pid,command | grep "$PWD/.vscode-ext-debug" | grep -v grep | awk '{print $1}' | head -1)

# Windows (PowerShell):
# Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$PWD\.vscode-ext-debug*" } | ForEach-Object { Stop-Process -Id $_.ProcessId }
```
