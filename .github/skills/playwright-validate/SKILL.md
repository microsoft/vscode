---
name: playwright-validate
description: "Validate UI changes visually using the vscode-automation-mcp server. Use when: verifying a UI change was implemented correctly, taking proof screenshots, visual regression checks, confirming layout or styling changes, iterating on UI until it matches requirements. Covers launching a VS Code dev build, navigating to the changed UI, taking screenshots, and iterating until the screenshot proves the change is correct."
---

# VS Code Automation Visual Validation

Validate that your UI changes are correctly implemented by using the **vscode-automation-mcp** server to launch a VS Code dev build, interact with the UI, and capture proof screenshots.

## When to Use

- After implementing a UI change (new component, layout fix, styling update, theme change)
- To prove a change was implemented correctly before marking work complete
- To visually debug why a UI element doesn't look right
- To iterate on a change until the visual output matches requirements

## Prerequisites

1. **The `vscode-automation-mcp` MCP server must be running.** It is defined in `.vscode/mcp.json` under the name `vscode-automation-mcp`. Start it from the Command Palette: `MCP: List Servers → vscode-automation-mcp → Start Server`, or it may already be running.
2. **Dependencies must be installed** — run `npm install` at the repo root if not already done.

## Procedure

### Step 1: Load the MCP Tools

Use `tool_search_tool_regex` with the pattern `mcp_vscode-automa` to discover and load the vscode-automation-mcp tools. The key tools are prefixed with `mcp_vscode-automa_vscode_automation_`.

### Step 2: Start the VS Code Dev Build

Call `mcp_vscode-automa_vscode_automation_start` to launch a VS Code Electron window:

```
mcp_vscode-automa_vscode_automation_start({})
```

Optionally provide a `workspacePath` to open a specific folder, or `recordVideo: true` to record a session video.

Wait for the tool to confirm VS Code started successfully before proceeding.

### Step 3: Navigate to the Changed UI

Use the automation tools to interact with VS Code and reach the area you changed:

- `mcp_vscode-automa_vscode_automation_run_command` — Run any VS Code command by ID (e.g., `workbench.action.openSettings`)
- `mcp_vscode-automa_vscode_automation_quick_open` — Open Quick Open and type a filename
- `mcp_vscode-automa_vscode_automation_quick_access` — Open the Command Palette and run a command by name
- `mcp_vscode-automa_vscode_automation_window_click` — Click on a UI element using a CSS selector
- `mcp_vscode-automa_vscode_automation_window_type` — Type text into a UI element
- `mcp_vscode-automa_vscode_automation_window_snapshot` — Take an accessibility snapshot to discover UI elements
- `mcp_vscode-automa_vscode_automation_open_file` — Open a specific file in the editor

Common navigation patterns:
- **Open Command Palette**: Use `mcp_vscode-automa_vscode_automation_quick_access` with the command name
- **Open Settings**: Run command `workbench.action.openSettings`
- **Open a specific view**: Use `mcp_vscode-automa_vscode_automation_run_command` with the view's command ID
- **Open a file**: Use `mcp_vscode-automa_vscode_automation_open_file` with the file path

### Step 4: Take a Screenshot

Use `mcp_vscode-automa_vscode_automation_window_screenshot` to capture the current state of the VS Code window:

```
mcp_vscode-automa_vscode_automation_window_screenshot({})
```

Optionally pass `fullPage: true` for a full scrollable screenshot.

Review the screenshot carefully:
- Does the changed UI element appear correctly?
- Are colors, spacing, alignment, and typography correct?
- Does it match the expected design?

### Step 5: Iterate If Needed

If the screenshot does NOT prove the change is correct:

1. Identify what's wrong from the screenshot
2. Go back to the source code and fix the issue
3. Restart VS Code to pick up changes: `mcp_vscode-automa_vscode_automation_restart`
4. Repeat Steps 3-4 until the screenshot proves correctness

### Step 6: Report Proof

Once the screenshot confirms the change is correct:
- Report to the user what the screenshot shows
- Confirm that the visual output matches the requirements

### Step 7: Clean Up

Stop the VS Code instance when done:
```
mcp_vscode-automa_vscode_automation_stop({})
```

## Tool Reference

| Tool | Purpose |
|------|---------|
| `mcp_vscode-automa_vscode_automation_start` | Launch a VS Code dev build |
| `mcp_vscode-automa_vscode_automation_stop` | Stop the VS Code instance |
| `mcp_vscode-automa_vscode_automation_restart` | Restart VS Code (picks up code changes) |
| `mcp_vscode-automa_vscode_automation_window_screenshot` | Capture a screenshot of the VS Code window |
| `mcp_vscode-automa_vscode_automation_window_snapshot` | Get accessibility snapshot for element discovery |
| `mcp_vscode-automa_vscode_automation_window_click` | Click a UI element by CSS selector |
| `mcp_vscode-automa_vscode_automation_window_type` | Type text into a UI element |
| `mcp_vscode-automa_vscode_automation_window_hover` | Hover over an element |
| `mcp_vscode-automa_vscode_automation_window_evaluate` | Run JavaScript in the VS Code window |
| `mcp_vscode-automa_vscode_automation_run_command` | Execute a VS Code command by ID |
| `mcp_vscode-automa_vscode_automation_quick_access` | Open Command Palette and type a command |
| `mcp_vscode-automa_vscode_automation_quick_open` | Open Quick Open (Ctrl+P) |
| `mcp_vscode-automa_vscode_automation_open_file` | Open a file in the editor |

## Tips

- **Always take a snapshot first** before clicking — `window_snapshot` tells you what elements are available.
- **Wait for loads** — after starting or restarting VS Code, give it a moment to fully load before screenshotting.
- **Use commands over clicks** — `run_command` and `quick_access` are more reliable than clicking small UI elements.
- **Multiple screenshots** — take before/after screenshots to show the diff clearly.
- **Multi-window support** — use `list_windows` and `switch_window` if your change involves multiple VS Code windows.
