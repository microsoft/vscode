# Paused and resumed case

State: The host reopened a case in the exact `Investigate / evidenceLoop` substate. Understand remains complete, retained evidence is visible, and no progress is lost.

## Exact UI copy

- `Issue Wizard`
- Stepper: `Understand` → `Investigate` → `Resolve`
- `Continue investigation`
- `Your case was restored`
- `No progress was lost.`
- `Settings sync stalls after sign-in`
- `Evidence`
- `Screenshot 2026-09-15 14.32.08.png`
- `Last completed: Evidence loop`
- `Next: Review investigation options`
- `Restored from paused state • 2 minutes ago`
- `Continue investigation`
- `Review case`
- `Help`
- `Close`

## Actions and focus

- Primary: `Continue investigation`; the restored screen places focus on this orientation action, with a visible focus ring.
- Secondary: `Review case` lets the user inspect the retained summary/evidence without advancing.
- `Tab`/`Shift+Tab` move through orientation, evidence, and action controls. `Esc` returns to the editor shell. Closing the editor is available from the workbench tab and keeps the pause state.
- The screenshot and overflow affordance have accessible names `Open evidence: Screenshot 2026-09-15 14.32.08.png` and `Evidence item actions`.

## ARIA and announcements

- On restore, the live region announces: `Your case was restored. No progress was lost. Stage Investigate. Last completed: Evidence loop.`
- Stepper announces `Investigate, current`; the progress row is a labelled status region.
- `Continue investigation` is the orientation action, not an implicit stage jump; the user explicitly resumes the host-owned substate.

## State-machine events

- `Continue investigation` emits `user.resumeCase`; the host resumes the persisted substate and continues the evidence loop.
- `Review case` emits `user.reviewCase` and keeps the same state.
- Workbench close/reload emits `host.pauseCase` or `host.restoreCase`; restoration must preserve summary, evidence, completed-step marker, and pending options.
