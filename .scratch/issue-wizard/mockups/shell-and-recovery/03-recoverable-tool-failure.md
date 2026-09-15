# Recoverable tool failure

State: Investigate is active and a requested Settings Sync diagnostic is unavailable. This is an inline recoverable failure; evidence and the case remain intact.

## Exact UI copy

- `Issue Wizard`
- Stepper: `Understand` → `Investigate` → `Resolve`
- `Settings sync stalls after sign-in`
- `Diagnostic unavailable`
- `Evidence`
- `Screenshot 2026-09-15 14.32.08.png`
- `PNG • 1.2 MB • Added just now`
- `Could not run Settings Sync diagnostic`
- `The diagnostic is unavailable right now. Your collected evidence is safe.`
- `Tool failure • recoverable`
- `Retry diagnostic`
- `Continue without this`
- `Choose another diagnostic`
- `Help`

## Actions and focus

- Primary: `Retry diagnostic`; it has the visible keyboard focus ring.
- Secondary: `Continue without this` records the unavailable diagnostic and advances using existing evidence.
- Tertiary: `Choose another diagnostic` opens the host-approved diagnostic choices.
- `Tab`/`Shift+Tab` move among the three recovery choices and evidence controls. `Enter`/`Space` activate. `Esc` returns focus to the stage shell without discarding the failure.
- Warning icon is decorative because the adjacent heading carries the meaning; status pill has accessible name `Tool failure, recoverable`.

## ARIA and announcements

- The inline failure is a polite alert region labelled `Diagnostic unavailable`; it announces the narrow failure and the preservation guarantee once.
- Live status announces `Diagnostic unavailable. Investigation remains active. Your collected evidence is safe.` It must not announce a global pause or fatal error or navigate away from the wizard.
- Evidence region still exposes the attachment name and count.

## State-machine events

- `Retry diagnostic` emits `user.retryDiagnostic`; the host reissues the same typed diagnostic request.
- `Continue without this` emits `user.continueWithoutDiagnostic`; the host records unavailable evidence and returns to the evidence loop/recommendation state.
- `Choose another diagnostic` emits `user.chooseDiagnostic`; only host-approved diagnostic options are shown.
- Tool failure emits `tool.diagnosticUnavailable` with structured reason; collected evidence is preserved and the case remains recoverable.
