# 02 — Sensitive diagnostic consent

## State and purpose

Investigate is paused at one explicit user decision. The underlying brief, screenshot, plan, and collected evidence remain visible but dimmed. Exactly one consent surface asks whether the host may read the relevant VS Code logs; it does not imply a second approval.

## Exact intended copy

- `Sensitive diagnostic`
- `Allow access to VS Code logs?`
- `The next investigation step needs the relevant logs to check for sync conflicts.`
- `Scope`
- `Read the current window's VS Code logs`
- `Use entries relevant to Settings Sync`
- `Keep the evidence in this Issue Wizard case`
- `Logs can contain workspace paths, extension names, and diagnostic details. Nothing is shared or published from this step.`
- `Review scope`
- `Allow once and continue`
- `Continue without logs`

## Actions and state-machine events

- `Allow once and continue` emits `approveDiagnostic({ kind: "vscode-logs", scope: "current-window-relevant-settings-sync", duration: "once" })`. The host then runs or records the diagnostic and preserves the result as evidence.
- `Continue without logs` emits `declineDiagnostic({ kind: "vscode-logs", reason: "user-declined" })`. The host records the unavailable-evidence outcome and continues with known context; it does not ask for a second semantic approval.
- `Review scope` emits `reviewDiagnosticScope()` and expands or focuses the scope details inline; it does not approve access.

## Keyboard and focus behavior

The consent surface traps focus while open. Initial focus is on `Allow once and continue`, with the visible blue focus ring. Tab cycles through `Review scope`, `Allow once and continue`, and `Continue without logs`; Shift+Tab reverses. Enter or Space activates the focused action. Escape closes the surface only if the host treats dismissal as `declineDiagnostic`; otherwise it is disabled and the user must choose a labelled action. Underlying content is inert.

## Accessibility

- Dialog accessible name: `Allow access to VS Code logs?`; description includes the reason and privacy explanation.
- Scope is exposed as a labelled list, and the shield icon has accessible name `Sensitive diagnostic`.
- Buttons have exact accessible names matching their visible labels; `Review scope` is not a consent action.
- Live region announcements: `Sensitive diagnostic requested: VS Code logs`; after approval, `Access allowed once. Reading relevant VS Code logs`; after decline, `Continuing without VS Code logs. The evidence gap is recorded`.

