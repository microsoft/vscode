# Accessibility help + accessible view concept

State: Investigate is active with the accessibility help surface open. The view exposes keyboard navigation, stage/status, evidence navigation, action shortcuts, and focus restoration intent.

## Exact UI copy

- `Issue Wizard`
- Stepper: `Understand` → `Investigate` → `Resolve`
- `Settings sync stalls after sign-in`
- `Issue Wizard accessibility help`
- `Keyboard navigation`
- `Tab / Shift+Tab` — `Move between controls`
- `Enter / Space` — `Activate focused action`
- `Arrow keys` — `Move within evidence list`
- `Esc` — `Return focus to the wizard`
- `Stage and status`
- `Stage: Investigate. Status: Evidence loop ready.`
- `Evidence`
- `Evidence 1 of 2: Screenshot 2026-09-15 14.32.08.png`
- `Actions`
- `Accessibility help — Alt+F1`
- `Accessible view — Option+F2 (macOS)`
- `Continue investigation — Not assigned`
- `Retry diagnostic — Not assigned`
- `Status announcements`
- `Focus returns to the triggering control when help closes.`
- `Close help`
- `Open accessible view`

## Actions and focus

- Primary: `Open accessible view` opens the plain-text/structured accessible representation.
- Secondary: `Close help` dismisses the help surface and restores focus to the triggering control.
- The evidence row has a visible focus ring and is keyboard-operable. `Tab`/`Shift+Tab` move through help controls; arrow keys move within the evidence list; `Esc` returns to the wizard.
- `H` opens help, `C` continues investigation, and `R` retries the diagnostic when those shortcuts are available in the active stage.

## ARIA and announcements

- Help is a labelled dialog/region: `Issue Wizard accessibility help`.
- Status region has accessible name `Status announcements`; its live text is `Stage: Investigate. Status: Evidence loop ready.`
- Evidence list exposes position and name: `Evidence 1 of 2: Screenshot 2026-09-15 14.32.08.png`.
- On close, announce `Accessibility help closed. Focus returned to the triggering control.`

## State-machine events

- `Open accessible view` emits `user.openAccessibleView`; no case-state transition occurs.
- `Close help` emits `user.closeAccessibilityHelp`; focus returns to the opener.
- `Alt+F1` invokes the accessibility-help command; `Option+F2` invokes the accessible-view command on macOS. These are shown as known/default bindings for the concept and should be resolved dynamically from the host keybinding service.
- `Continue investigation` and `Retry diagnostic` have no implied single-key binding; when no configured binding exists, expose `Not assigned` and activate them through normal focus/Enter/Space interaction.
- The evidence list explicitly supports Arrow-key traversal and announces position/name; stage/status is exposed as a labelled live status region.
