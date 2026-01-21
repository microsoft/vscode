# Agent Window Testing Workflow

## Quick Reference (TL;DR)

1. `vscode_automation_start` - Start VS Code
2. `vscode_automation_command_run` with "Open Agent" - Open Agent Window
3. **`activate_vscode_automation_interactions`** - ⚠️ MUST DO before window tools work!
4. `vscode_automation_switch_window` with `"agent.html"` - Switch to Agent Window
5. `vscode_automation_window_screenshot` - Take screenshot (NOT `browser_take_screenshot`!)

## ⚠️ Critical Rules

### DO use these tools for multi-window:
- `vscode_automation_window_screenshot` - Screenshots current window
- `vscode_automation_window_snapshot` - Gets accessibility tree of current window
- `vscode_automation_switch_window` - Switches between windows

### DO NOT use these for multi-window:
- ❌ `browser_take_screenshot` - Always screenshots main window, ignores switch
- ❌ `browser_snapshot` - Always snapshots main window, ignores switch

## Testing Steps

### Step 1: Start VS Code
Use `vscode_automation_start` with a workspace path.

### Step 2: Open Agent Window
Run the command `Open Agent` via `vscode_automation_command_run`.

### Step 3: Activate Window Management Tools
**⚠️ CRITICAL - Do this BEFORE using any window tools!**

```
activate_vscode_automation_interactions
```

If you skip this step, window tools will fail with "Tool is currently disabled by the user".

This enables:
- `vscode_automation_list_windows`
- `vscode_automation_switch_window`
- `vscode_automation_get_current_window`
- `vscode_automation_window_screenshot`
- `vscode_automation_window_snapshot`
- `vscode_automation_window_click`
- `vscode_automation_window_type`
- `vscode_automation_window_evaluate`
- `vscode_automation_window_locator`
- `vscode_automation_window_wait_for_selector`

### Step 4: Switch to Target Window
Use `vscode_automation_switch_window` with either:
- Window index (0-based): `0`, `1`, etc.
- URL pattern: `"agent.html"` or `"workbench"`

### Step 5: Take Screenshot
Use `vscode_automation_window_screenshot` (NOT `browser_take_screenshot`).

## Common Issues

### Screenshot shows wrong window
- **Cause:** Used `browser_take_screenshot` instead of `vscode_automation_window_screenshot`
- **Fix:** Use `vscode_automation_window_screenshot` after switching windows

### Tool is disabled
- **Cause:** Forgot to call `activate_vscode_automation_interactions`
- **Fix:** Call `activate_vscode_automation_interactions` first

### Changes not reflected
- **Cause:** MCP server not rebuilt/restarted after code changes
- **Fix:** Run `npm run compile` in `test/mcp/` and restart the MCP server
