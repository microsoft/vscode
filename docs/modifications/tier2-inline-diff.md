# Tier 2 Modification: Inline Diff with Accept/Reject

## Capability

Enable agent-proposed code changes to appear as inline diffs directly in the editor, with Accept and Reject controls rendered in the editor chrome. This replaces the current notification-dialog workaround.

## Files Modified

- `src/vs/workbench/contrib/inlineChat/browser/inlineChatController.ts` — Add extension point for external diff proposals
- `src/vs/editor/contrib/inlineDiff/browser/inlineDiffWidget.ts` — New file (Tier 1) providing a reusable inline diff widget

## Changes

### Tier 1 component (new file)
Create `src/vs/editor/contrib/inlineDiff/browser/inlineDiffWidget.ts`:
- A standalone widget that renders a diff hunk inside an editor view zone
- Accept/Reject buttons using the standard `ActionBar` pattern
- Fires `onDidAccept` and `onDidReject` events
- Can be instantiated by extensions via a new proposed API or by sessions-layer code

### Tier 2 hook
In `src/vs/workbench/contrib/inlineChat/browser/inlineChatController.ts`:
- Register a contribution point that allows the sessions layer to propose diffs
- Minimal change: add an event emitter and a registration method

## Merge-cost Assessment

**Low-Medium.** The inline chat controller is actively developed upstream but we are adding an extension point, not modifying existing logic. The new widget file is pure Tier 1 with zero conflict risk.

## Alternatives Considered

1. **Webview overlay** — Render diffs in a webview positioned over the editor. Rejected: fragile positioning, no access to editor text model, poor performance.
2. **Side-by-side diff editor** — Open `vscode.diff` command. Rejected: breaks inline flow, requires context switching.
3. **Decoration-only approach** — Show changed lines with background colors. Rejected: no interactive accept/reject capability.
