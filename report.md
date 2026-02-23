# Issue Analysis Report: microsoft/vscode#62476

## Scope

This report analyzes `https://github.com/microsoft/vscode/issues/62476` end-to-end, including all issue comments and linked/duplicate issues (including duplicate ones), and proposes actionable repro scenarios plus an implementation plan.

Repositories considered:

- `vscode` (product updater orchestration and startup checks)
- `inno-updater` (process wait/kill behavior during apply)
- `vscode-update-server` (update metadata/feed behavior and cache)

## Primary Symptom

Windows users intermittently see an Inno Setup dialog:

`Setup has detected that setup is currently running`

The prompt appears unexpectedly, often while VS Code itself is running and near update activity (`Restart to Update` flow), and can recur repeatedly.

## Evidence Summary (Issue + Comments)

Issue `#62476` contains long-running reports across multiple years. The high-signal evidence in comments clusters into the following patterns:

1. Update race during background apply and relaunch/reopen.

- Maintainer repro hypothesis (Nov 2018) explicitly describes a second instance launching setup while a prior setup/apply is still in progress.
- Multiple users report correlation with opening another VS Code window while update is pending.

1. Recovery path collisions after interrupted update.

- Reports describe closing/reopening VS Code mid-update, then seeing setup-running dialogs on next launch.
- This aligns with stale pending-update recovery paths (`updating_version`) attempting to apply while setup may still be active.

1. Stuck helper/setup process behavior.

- Reports include persistent `CodeSetup*.exe` or update helper process remaining active and repeated dialogs until process kill/reboot.
- Later comments suggest killing update-related PowerShell process can unblock update completion in some cases.

1. UX confusion.

- Users often cannot identify the dialog as VS Code related.
- Repeated modal behavior is considered highly disruptive.

## Linked And Duplicate Issues (Reviewed)

The following linked/duplicate issues were reviewed, including their comments:

1. `#261687` (`"Setup" pop-up when opening up VSCode`) - closed as duplicate of `#62476`

- Repro pattern: popup on open after update cycle.
- Mentions install stuck at `Installing...` in user narrative.

1. `#262945` (`Stuck on "Installing Update..."`) - closed as duplicate

- Explicitly references `#62476` behavior after reopen.
- Provides workaround: terminate lingering PowerShell process.

1. `#147287` (`Opening VS Code gave following error.`) - closed as duplicate

- Triggered after forcing close of unresponsive VS Code, then reopen.

1. `#193277` (`Lost Issue #62476`) - closed as duplicate/meta tracking

- Does not add technical root-cause details, but confirms issue remained active and assigned.

## Technical Mapping To Code

### 1) VS Code product updater (`vscode`)

Main orchestration points:

- `src/vs/platform/update/electron-main/updateService.win32.ts`
  - `postInitialize()` reads `updating_version` and can re-enter apply via `_applySpecificUpdate(...)`.
  - `doApplyUpdate()` spawns installer silently and polls ready mutex/progress.
  - `_applySpecificUpdate(...)` sets update state and can call `doApplyUpdate()`.

Startup gate:

- `src/vs/code/electron-main/main.ts`
  - `checkInnoSetupMutex(...)` checks update mutex during startup and can block launch.

Installer mutex semantics:

- `build/win32/code.iss`
  - `GetSetupMutex(...)` defines setup mutex behavior, including base `...setup` and background `...-updating` mutex.

### 2) Inno updater (`inno-updater`)

- `inno-updater/src/process.rs`
  - `wait_or_kill(...)` waits and then attempts process termination for running executable conflicts.
- `inno-updater/src/main.rs`
  - Integrates `wait_or_kill(...)` into update flow.

This area explains some stuck-process persistence but does not appear to be the primary source of duplicate setup launch attempts.

### 3) Update server (`vscode-update-server`)

- `server/builds.ts` and `server/cache.ts` govern build selection, rollout, and cache freshness.

Server behavior influences update cadence and metadata selection, but the popup symptom is primarily client-side installer coordination.

## Repro Scenarios

### Scenario 1: Multi-window background update race

Preconditions:

- Windows user setup build with background updates enabled.

Steps:

1. Start VS Code and wait until update is downloaded and background apply starts.
2. Before apply fully settles, open another VS Code window (or relaunch quickly).
3. Second instance enters apply path while installer from first path is still active.

Expected result:

- Second setup invocation collides with active setup mutex and surfaces `Setup has detected that setup is currently running`.

### Scenario 2: Restart/reopen during in-progress update

Preconditions:

- Update started; recovery markers/state (e.g. `updating_version`) present.

Steps:

1. Let update apply begin.
2. Close and reopen VS Code before apply finalizes.
3. Startup recovery path attempts specific apply while installer may still be active.

Expected result:

- Recovery re-entry collides with active setup/update mutex and shows setup-running popup.

### Scenario 3: Hung helper process loop

Preconditions:

- Update reaches `Installing Update...` and helper process does not exit cleanly.

Steps:

1. Trigger update and wait until install appears stalled.
2. Reopen VS Code or retrigger update check/apply.
3. Existing hung process remains active while new apply attempt is made.

Expected result:

- Repeated setup-running popup until lingering process exits or is terminated.

## Implementation Plan

### Item 1: Prevent duplicate setup launch in apply path

- In `doApplyUpdate()`, check installer activity mutexes before spawning setup.
- If installer is already active, do not spawn a second setup process.
- Continue with state handling/polling logic needed to detect readiness or failure.

### Item 2: Align mutex semantics across startup and apply

- Use consistent mutex interpretation across:
  - startup gate (`checkInnoSetupMutex`)
  - update apply guard (`doApplyUpdate`)
- Consider both base setup mutex (`...setup`) and update mutex (`...-updating`) where appropriate.

### Item 3: Harden stale recovery paths

- Ensure `postInitialize()` / `_applySpecificUpdate()` cannot retrigger setup launch while installer is already active.
- Recovery should converge safely to:
  - waiting for active installer completion, or
  - explicit failure state when installer activity disappears without becoming ready.

### Item 5: Improve diagnostics and telemetry breadcrumbs

Add explicit breadcrumbs for:

- duplicate launch prevented due to active installer mutex
- startup/update recovery seeing active installer mutex
- polling timeout / resume failure transitions

Diagnostics should be low-cardinality and safe for telemetry use.

## Risks And Open Questions

1. Mutex naming/coverage must match installer semantics exactly (`code.iss` and app checks) to avoid false negatives.
2. Polling behavior must avoid indefinite `Updating` state when no installer remains active and no ready mutex appears.
3. Some reports involve environmental factors (permissions, AV, unusual process state) that can still produce update failures even after duplicate-launch prevention.

## Validation Strategy

1. Unit/integration validation for apply guard and recovery transitions.
2. Manual Windows repro validation for all 3 scenarios.
3. Verify startup block behavior when setup/update mutex is active.
4. Confirm logs/telemetry fire for guarded and failure paths.
5. Confirm no regression in normal single-instance background update flow.

## Out Of Scope (This Fix)

1. Broad redesign of update UX messaging/modal strategy.
2. Server-side rollout policy changes.
3. Non-Windows update flows.
