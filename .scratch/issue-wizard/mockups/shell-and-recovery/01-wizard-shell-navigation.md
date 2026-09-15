# Wizard shell / navigation anatomy

State: `UnderstandingReady`: Understand is complete/current; Investigate and Resolve are pending. This is the canonical editor shell with an editable shared understanding brief, persistent case context, and reusable evidence.

## Exact UI copy

- `Issue Wizard`
- Stepper: `Understand` → `Investigate` → `Resolve`
- `Shared understanding`
- `Settings sync stalls after sign-in`
- `Expected: settings sync completes`
- `Actual: sync stalls after sign-in`
- `Edit brief`
- `Evidence`
- `Screenshot 2026-09-15 14.32.08.png`
- `PNG • 280 KB`
- `Add evidence`
- `Ready to investigate`
- `Start investigation`
- `More actions`
- `Help`

## Actions and focus

- Primary: `Start investigation`; visible 2px blue focus ring in the mockup. This is the only leading action and emits an explicit stage transition.
- Secondary: `More actions` opens non-destructive case actions; `Add evidence` opens the host file/evidence picker.
- `Tab`/`Shift+Tab` traverse stepper, summary actions, evidence controls, and bottom actions. `Enter`/`Space` activate the focused control. `?` or `Help` opens accessibility help.
- Icon-only controls have accessible names: `More actions`, `Evidence item actions`, and `Close Issue Wizard`.

## ARIA and announcements

- Stepper is a labelled navigation landmark; active step is announced as `Step 1 of 3, Understand, complete/current`.
- Shared understanding is a region labelled `Shared understanding, editable`; evidence is a region labelled `Evidence, 1 attachment`.
- Live status announces `Ready to investigate` after the shell restores or evidence changes.

## State-machine events

- `Edit brief` emits `user.editUnderstanding`; saving emits `host.understandingUpdated` while remaining in `UnderstandingReady`.
- `Start investigation` emits `user.startInvestigation` and requests the host transition from `UnderstandingReady` to `Investigate / evidenceLoop`.
- `Add evidence` emits `user.addEvidence`; successful attachment emits `host.evidenceAdded`.
- `More actions` emits no state transition until a menu item is chosen.
- Closing emits `host.pauseCase`; the host persists the exact substate.
