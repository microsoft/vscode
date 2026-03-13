---
name: vscode-cdp-automation
description: Hard-won lessons for automating VS Code (Code OSS) via Chrome DevTools Protocol and agent-browser. Covers CDP target selection, shadow DOM navigation, raw CDP via WebSocket, modifier key input, build setup, and common pitfalls. Use when launching Code OSS for UI testing, connecting via CDP, or troubleshooting agent-browser issues.
---

# VS Code CDP Automation — Troubleshooting & Best Practices

This skill captures lessons learned from automating VS Code (Code OSS) through Chrome DevTools Protocol (CDP) and `agent-browser`. These are hard-won patterns — future agents should not repeat these mistakes.

> **When to use this skill:** You are launching Code OSS with `--remote-debugging-port`, connecting via CDP or `agent-browser`, and need to interact with the VS Code UI programmatically. This complements the `vscode-playwright-mcp` tools used by the Demonstrate agent.

## 1. Launching Code OSS for CDP Automation

```bash
VSCODE_SKIP_PRELAUNCH=1 ./scripts/code.sh --remote-debugging-port=9224 <workspace>
```

**Key tips:**
- Use `VSCODE_SKIP_PRELAUNCH=1` to skip prerequisite checks and launch faster
- Use `--user-data-dir <path>` for isolated instances, but **keep paths short** — long paths cause socket errors
- **Wait 15–20 seconds** after launch before CDP targets appear
- Verify targets are available: `curl http://localhost:9224/json`

## 2. agent-browser Connects to the Wrong Target

**Problem:** When Code OSS has multiple CDP targets (the main window, DevTools, webviews, about:blank), `agent-browser connect <port>` often connects to the wrong one — typically `about:blank` or a background page.

**Workaround — switch tabs after connecting:**
```bash
agent-browser connect <port>
agent-browser tab --url "*vscode*"
```

**Better workaround — use raw CDP via Node.js** (see Section 5 below) for reliable target selection.

## 3. Context Menus Live in Shadow DOM

**Problem:** VS Code renders context menus inside shadow root hosts. This makes them invisible to `agent-browser snapshot`, and `agent-browser click @ref` on menu items often fails silently.

**Workaround — traverse shadow DOM manually:**
```javascript
// Find shadow root hosts
const hosts = document.querySelectorAll('.shadow-root-host');

// Traverse into each shadow root to find menu items
for (const host of hosts) {
  if (!host.shadowRoot) continue;
  const items = host.shadowRoot.querySelectorAll('.action-label');
  for (const item of items) {
    if (item.textContent.includes('Your Menu Item')) {
      const rect = item.getBoundingClientRect();
      // Use CDP Input.dispatchMouseEvent at rect center coordinates
    }
  }
}
```

**Pattern:** `document.querySelectorAll('.shadow-root-host')` → traverse `.shadowRoot` → find `.action-label` elements → get bounding rect → click via CDP `Input.dispatchMouseEvent` at exact coordinates.

## 4. Cmd+Click and Modifier Keys Require CDP Input Events

**Problem:** `agent-browser` has no native support for Cmd+click (used for multi-select in trees, Cmd+click on links, etc.).

**Solution — use CDP `Input.dispatchMouseEvent` with modifier flags:**

| Modifier | Flag value |
|----------|-----------|
| Alt      | 1         |
| Ctrl     | 2         |
| Meta/Cmd | 4         |
| Shift    | 8         |

```javascript
// Cmd+click at (x, y) for multi-select
await cdpSend('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: 350, y: 200,
  button: 'left',
  clickCount: 1,
  modifiers: 4  // Meta/Cmd
});
await cdpSend('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: 350, y: 200,
  button: 'left',
  modifiers: 4
});
```

For right-click (context menu): use `button: 'right'` with no modifiers.

## 5. Raw CDP via Node.js WebSocket

When `agent-browser` has persistent connection issues, use the `ws` module directly for full control:

```javascript
const WebSocket = require('ws');

// 1. Get available targets
// curl http://localhost:9224/json
// Find the target with "type": "page" and a title matching your VS Code window

// 2. Connect to the correct target
const ws = new WebSocket('ws://localhost:9224/devtools/page/<TARGET_ID>');

// 3. Send CDP commands
let msgId = 1;
function cdpSend(method, params = {}) {
  return new Promise((resolve) => {
    const id = msgId++;
    ws.on('message', function handler(data) {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        ws.removeListener('message', handler);
        resolve(msg.result);
      }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// Screenshot
const { data } = await cdpSend('Page.captureScreenshot', { format: 'png' });

// Evaluate JavaScript in the page
const result = await cdpSend('Runtime.evaluate', {
  expression: 'document.title',
  returnByValue: true
});

// Click at coordinates
await cdpSend('Input.dispatchMouseEvent', {
  type: 'mousePressed', x: 100, y: 200,
  button: 'left', clickCount: 1
});
await cdpSend('Input.dispatchMouseEvent', {
  type: 'mouseReleased', x: 100, y: 200,
  button: 'left'
});
```

**When to use raw CDP over agent-browser:**
- You need modifier keys (Cmd, Shift, Alt)
- You need right-click (context menu trigger)
- `agent-browser` connects to the wrong target repeatedly
- You need precise timing control between events
- Shadow DOM traversal requires `Runtime.evaluate`

## 6. Build & Compilation

### gulp watch requires increased heap size

```bash
NODE_OPTIONS="--max-old-space-size=8192" npx gulp watch
```

The default Node.js heap is too small for VS Code's incremental compilation. Without this, `gulp watch` will OOM.

### tsgo output is NOT compatible with the test runner

`tsgo --outDir out` produces output that causes `"Failed to fetch dynamically imported module"` errors in the Electron test runner. **Always use `gulp watch` or `gulp compile`** for building code that will be tested.

## 7. Workspace & Environment Pitfalls

### Large folders break empty-space testing

Opening a folder with 255+ files (e.g., `~/Downloads`) fills the entire virtualized tree, leaving no visible empty space. **Workaround:** Create a temp workspace with a few files when you need to test right-click-on-empty-space or similar scenarios.

### Cmd+W closes the window when it's the last tab

If you close the last editor tab with `Cmd+W`, the entire window closes.

**Workarounds:**
- Set `"window.closeWhenEmpty": false` in user settings before testing
- Use the tab close button (`.codicon-close`) via JavaScript click instead of the keyboard shortcut

## Quick Reference

| Situation | Solution |
|-----------|----------|
| `agent-browser` connects to about:blank | `agent-browser tab --url "*vscode*"` after connecting |
| Context menu items invisible to snapshot | Traverse shadow DOM with `Runtime.evaluate` |
| Need Cmd+click | CDP `Input.dispatchMouseEvent` with `modifiers: 4` |
| agent-browser unreliable | Use raw CDP via `ws` WebSocket module |
| gulp watch OOM | `NODE_OPTIONS="--max-old-space-size=8192"` |
| Test runner fails after tsgo build | Use `gulp watch` or `gulp compile` instead |
| No empty space in tree view | Create temp workspace with few files |
| Cmd+W closes window | Set `window.closeWhenEmpty: false` |
| CDP targets not appearing | Wait 15–20s after launch, check `/json` endpoint |
| Long user-data-dir path errors | Keep `--user-data-dir` paths short |
