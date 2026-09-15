# 01 — Evidence workspace

## State and purpose

Investigate is active after the user confirmed the brief. The host has persisted the brief and screenshot, and the UI is collecting evidence while keeping the investigation plan visible. The investigation starts from known context; VS Code logs are an evidence gap that may require a later sensitive-diagnostic decision.

## Exact intended copy

- `Issue Wizard`
- `Understand` / `Investigate` / `Resolve`
- `Issue: Settings Sync reports success, but changes do not appear on a second device.`
- `Confirmed brief • screenshot attached`
- `settings-sync.png`
- `Reason from known context first`
- `Use the available information and your knowledge of VS Code to investigate before collecting more data.`
- `Investigation plan`
- `Reproduce the sync mismatch` / `Follow a clear set of steps on two devices.`
- `Check sync log for conflict` / `Look for errors or conflict entries in the sync log.`
- `Compare account + profile context` / `Verify the same account and profile are in use.`
- `Collected evidence`
- `Brief + screenshot` / `Issue description and attached image.` / `Collected`
- `Reproduction steps` / `Mismatch reproduced on the second device.` / `Collected`
- `VS Code logs` / `Access required to read the relevant logs.` / `Requires permission`
- `Edit brief`
- `Review evidence`

## Actions and state-machine events

- Primary action `Review evidence` emits `reviewInvestigationEvidence()` and keeps the host in `investigating` until the host has a complete evidence summary.
- Secondary action `Edit brief` emits `editBrief()` and returns to the editable shared-understanding state without discarding the screenshot.
- Selecting the in-progress plan row emits no stage change; it may emit `inspectInvestigationStep({ step: "sync-log-conflict" })`. The completed reproduction row represents only the observed symptom, not account, profile, device, or log collection.
- If the host proposes reading logs, it emits `requestDiagnostic({ kind: "vscode-logs", scope, reason })`; the host must pause for the consent surface in screen 2.

## Keyboard and focus behavior

Tab order is stepper (read-only), brief/screenshot references, investigation rows, evidence rows, `Edit brief`, then `Review evidence`. The visible 2px blue focus ring is on `Review evidence`. Enter or Space activates the focused control; Escape does not silently leave the wizard. Focus is restored to the triggering row after an inline update.

## Accessibility

- Stepper is a labelled progress indicator: `Issue Wizard steps, Investigate, step 2 of 3`.
- Screenshot has accessible name `Attached screenshot, settings-sync.png`.
- Each plan/evidence row is a named button or status row, with its state exposed as `completed`, `in progress`, `queued`, `collected`, or `requires permission`.
- Live region announcements: `Investigation started from the confirmed brief`; `Evidence collected: Brief and screenshot`; and `VS Code logs require permission`.
