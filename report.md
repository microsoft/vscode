# Issue #62476 — "Setup has detected that Setup is currently running"

## 1. Issue Summary

GitHub issue [#62476](https://github.com/microsoft/vscode/issues/62476) reports a modal Windows dialog "Setup has detected that Setup is currently running" appearing unexpectedly. The dialog comes from **Inno Setup's** built-in mutex mechanism (`SetupMutex` directive in `build/win32/code.iss`), NOT from VS Code's own code. When a second Inno Setup installer process is launched while a first already holds the mutex named `{AppMutex}setup`, Inno Setup itself shows this dialog.

**Key facts from the 67 comments:**
- Open since Nov 2018, still actively reported through Feb 2026
- 53 reactions (47 thumbs-up), extensive user frustration
- The dialog has **no VS Code branding** — users often don't know which application is causing it
- Multiple users report it appearing repeatedly (every hour) or blocking Windows shutdown
- It occurs with single instances, multiple windows, multiple user accounts, and orphaned processes
- Workarounds include killing `CodeSetupStable.exe` in Task Manager, deleting old setup exes from Downloads, or rebooting

## 2. Architecture Overview

The Windows update flow involves three layers:

| Component | Role |
|-----------|------|
| **Update server** (`vscode-update-server/server/builds.ts`) | Stateless REST API returning latest build metadata. No coordination logic. |
| **VS Code update service** (`src/vs/platform/update/electron-main/updateService.win32.ts`) | Singleton in Electron main process. Checks for updates every 1 hour. Downloads installer to `%TEMP%`. Spawns Inno Setup with `/verysilent`. Polls for completion via mutex. |
| **Inno Setup + inno_updater.exe** (`build/win32/code.iss` + `inno-updater/src/main.rs`) | Installs files, waits for VS Code to exit, then calls `inno_updater.exe` for the atomic file swap. |

**Coordination mechanisms (mutexes):**

| Mutex | Created by | Checked by | Purpose |
|-------|-----------|------------|---------|
| `{AppMutex}` (e.g. `vscodeoss`) | VS Code on startup (`app.ts`) | Inno Setup post-install wait loop | Detect running VS Code |
| `{AppMutex}setup` | Inno Setup (all modes) | Inno Setup (prevents 2nd installer) | Prevent duplicate installers |
| `{AppMutex}-updating` | Inno Setup (background only) | VS Code `checkInnoSetupMutex()` (`main.ts`) | Block VS Code launch during update |
| `{AppMutex}-ready` | Inno Setup post-install | VS Code `doApplyUpdate()` poll loop | Signal files are staged and ready |

## 3. Root Cause Analysis

The "Setup has detected..." dialog appears when:
1. A second Inno Setup process is spawned while the first holds `{AppMutex}setup`
2. Inno Setup's own internal check sees the mutex is active and shows the dialog

This happens because VS Code's update service (`Win32UpdateService`) can spawn a new setup process without checking whether one is already running. The guards are insufficient:

**What exists:**
- `checkInnoSetupMutex()` in `main.ts` blocks VS Code launch when `-updating` mutex is active — but **only when `win32VersionedUpdate` is true** (not set in OSS builds, only in proprietary builds)
- The update state machine guards against concurrent downloads within a single process (`if (this.state.type !== StateType.Idle) return`)

**What's missing:**
- No check before spawning installer in `doApplyUpdate()` to see if a setup process is already running
- No check of `{AppMutex}setup` mutex before launching the installer
- `checkInnoSetupMutex()` is gated on `win32VersionedUpdate`, leaving older builds unprotected
- When VS Code refuses to launch due to active update, there's **no visual feedback** — it just silently quits
- Multi-user scenarios (RunAs) create separate processes that don't share the singleton update service

## 4. Reproduction Scenarios

### Scenario A: Restart VS Code During Background Update

**Prerequisites:** Windows, user setup, `update.enableWindowsBackgroundUpdates` enabled (default), an available update.

1. VS Code is running, checks for update after 30 seconds (via `abstractUpdateService.ts` `scheduleCheckForUpdates`)
2. Update is found, downloaded to `%TEMP%\vscode-{quality}-user-{arch}\CodeSetup-{quality}-{version}.exe`
3. `doApplyUpdate()` spawns the setup exe with `/verysilent /update=... /nocloseapplications`
4. Inno Setup starts installing (creates `{AppMutex}setup` mutex), installs files to versioned subfolder
5. **User force-closes VS Code** (Task Manager, crash, or just closing all windows)
6. VS Code main process exits, releasing `{AppMutex}` mutex. The update service is destroyed along with its state tracking `availableUpdate`.
7. **User relaunches VS Code**
8. New main process checks `{AppMutex}-updating` mutex:
   - If `win32VersionedUpdate=true`: VS Code detects mutex, quits silently (no visual feedback — user is confused)
   - If `win32VersionedUpdate=false`: Check is skipped entirely
9. If VS Code launched: after 30 seconds, new update service checks for updates
10. Same update is found (still latest), downloads same exe, `doApplyUpdate()` spawns a **second** setup process
11. Second Inno Setup detects `{AppMutex}setup` held by first → **"Setup has detected that Setup is currently running"** dialog

### Scenario B: Multiple Windows User Accounts

**Prerequisites:** Windows, two user accounts (e.g., normal + admin via RunAs), VS Code installed for both or as system setup.

1. User A is logged in, launches VS Code → one main process with update service
2. User B runs VS Code via `RunAs` (different account) → separate main process with its own update service
3. Both instances independently schedule update checks after 30 seconds
4. Both download the same update and call `doApplyUpdate()` simultaneously
5. First setup process creates `{AppMutex}setup` mutex
6. Second setup process detects the mutex → **dialog appears**
7. The dialog recurs every hour as both instances keep checking for updates

**Variant:** Even without RunAs, having VS Code Stable and VS Code Insiders both updating simultaneously could cause this if they share any mutex names (they don't in practice, but similar dynamic).

### Scenario C: Orphaned/Hung Setup Process

**Prerequisites:** Windows, an update available, something blocks the installer (antivirus, file lock, full disk).

1. VS Code triggers a background update, `doApplyUpdate()` spawns the setup exe
2. The setup process gets stuck — antivirus holds a file lock, network share is slow, etc.
3. The setup process never reaches the `{AppMutex}-ready` state
4. VS Code's 30-minute timeout fires, `doApplyUpdate()` gives up, sets state back to `Idle`
5. **The orphaned setup process is NOT killed** (the timeout just stops polling, it doesn't kill the process)
6. VS Code checks for updates again after 1 hour
7. It tries to spawn a new setup → blocked by the orphaned process's mutex → **dialog appears**
8. The dialog keeps appearing on every subsequent check because the orphaned process never exits
9. Even after restarting VS Code, the orphaned process survives (it was spawned detached), and the cycle repeats
10. Only manual intervention (Task Manager) or system reboot resolves it

## 5. Related Issues

| Issue | Title | Status | Relationship |
|-------|-------|--------|-------------|
| [#279144](https://github.com/microsoft/vscode/issues/279144) | Show progress window when restarting during background update | **Open** | Proposed fix: `--update-in-progress` flag for `inno_updater.exe` to show progress UI when VS Code can't launch |
| [#150013](https://github.com/microsoft/vscode/issues/150013) | VS Code blocks Windows shutdown during update | **Open** | Related: Inno Setup + `inno_updater.exe` call `ShutdownBlockReasonCreate`, preventing OS shutdown |
| [#249239](https://github.com/microsoft/vscode/issues/249239) | Support a better Windows update flow | Closed (Nov 2025) | Meta-issue: versioned-path update flow now shipped, inspired by Chromium's updater |
| [#253334](https://github.com/microsoft/vscode/issues/253334) | Restarting Windows while update pending crashes inno_updater | Closed | Edge case in the swap mechanism |
| [#150330](https://github.com/microsoft/vscode/issues/150330) | Broken installation after update | Closed | Setup hangs, causes JS errors; same root cause family |
| [#147287](https://github.com/microsoft/vscode/issues/147287) | Opening VS Code gave error | Closed (duplicate) | Exact duplicate of #62476 |

## 6. Implementation Plan

The fix requires changes across all three repositories. The plan has three phases:

### Phase 1: Prevent Duplicate Setup Launches (Core Fix)

**Goal:** Never spawn a second Inno Setup process if one is already running.

**Step 1.1 — Check setup mutex before spawning installer**
- **File:** `src/vs/platform/update/electron-main/updateService.win32.ts` — `doApplyUpdate()` method
- **Change:** Before spawning the setup process, check if `{AppMutex}setup` mutex is already active using `@vscode/windows-mutex`. If active, log a warning and do NOT spawn a second installer. Instead, fall back to polling the existing setup for the `{AppMutex}-ready` mutex.

**Step 1.2 — Remove `win32VersionedUpdate` guard from startup mutex check**
- **File:** `src/vs/code/electron-main/main.ts` — `checkInnoSetupMutex()`
- **Change:** The check `if (!(isWindows && productService.win32MutexName && productService.win32VersionedUpdate))` gates this protection behind the versioned-update feature flag. Change to `if (!(isWindows && productService.win32MutexName))` so ALL Windows builds get protection.

**Step 1.3 — Kill orphaned setup on timeout**
- **File:** `src/vs/platform/update/electron-main/updateService.win32.ts` — polling loop in `doApplyUpdate()`
- **Change:** When the 30-minute timeout fires, kill the orphaned setup process tree instead of just logging a warning.

### Phase 2: Progress UI for Blocked Launch (UX Fix — implements #279144)

**Goal:** When VS Code can't launch because an update is in progress, show a visual progress window instead of silently quitting.

**Step 2.1 — Add `--update-in-progress` mode to inno_updater.exe**
- **Repo:** `inno-updater`
- **File:** `src/main.rs`
- **Change:** Add a new CLI mode that shows a progress window, polls for the updating mutex to disappear, then relaunches VS Code.

**Step 2.2 — Launch progress UI from VS Code startup**
- **File:** `src/vs/code/electron-main/main.ts`
- **Change:** Instead of just quitting when `-updating` mutex is detected, spawn `inno_updater.exe --update-in-progress` and then quit.

**Step 2.3 — Add `{AppMutex}-progress` to SetupMutex**
- **File:** `build/win32/code.iss`
- **Change:** Verify that the progress mutex is a separate mechanism that doesn't interfere with Inno Setup's mutex.

### Phase 3: Edge Case Hardening

**Step 3.1 — Handle session-ending during update gracefully**
- **File:** `src/vs/platform/update/electron-main/updateService.win32.ts`
- **Change:** Ensure `cancelPendingUpdate()` is called during lifecycle shutdown. Verify the existing `session-ending.flag` mechanism works with the new timeout kill behavior.

**Step 3.2 — Improve Inno Setup dialog message**
- **File:** `build/win32/code.iss`
- **Change:** Add a custom message that includes "Visual Studio Code" so users can identify which application is showing the dialog.

## 7. Relevant Files

| File | What to modify/reuse |
|------|---------------------|
| `src/vs/platform/update/electron-main/updateService.win32.ts` | `doApplyUpdate()`: add mutex check before spawn. Polling loop: kill on timeout. |
| `src/vs/code/electron-main/main.ts` | `checkInnoSetupMutex()`: remove `win32VersionedUpdate` guard. Launch progress UI instead of quitting. |
| `build/win32/code.iss` | `GetSetupMutex()`: verify mutex names. Add custom `SetupMutex` message. |
| `inno-updater/src/main.rs` | Add `--update-in-progress` mode. |
| `inno-updater/src/gui.rs` | Reuse `run_progress_window()` for progress UI. |
| `src/vs/base/common/product.ts` | Reference: `win32MutexName`, `win32VersionedUpdate` properties. |
| `src/vs/code/electron-main/app.ts` | Reference: `installMutex()` creates `{AppMutex}` mutex on startup. |

## 8. Verification

1. **Unit test:** Verify `checkInnoSetupMutex()` returns `true` when `win32VersionedUpdate` is `false` but `-updating` mutex is active
2. **Manual test — Scenario A:** Start VS Code, trigger update, force-close during install, relaunch — should see progress window instead of Inno Setup dialog
3. **Manual test — Scenario C:** Simulate hung setup (e.g., suspend the process), wait 30 minutes, verify it gets killed and next update proceeds cleanly
4. **Manual test — Shutdown:** Trigger update, then shutdown Windows — inno_updater should respect `ShutdownBlockReasonCreate` but not block indefinitely
5. **Smoke test:** Normal update flow still works end-to-end (download → background install → restart → new version running)
6. Compile checks: Run `VS Code - Build` task and verify no TypeScript errors

## 9. Further Considerations

1. **`win32VersionedUpdate` removal guard**: Removing the `win32VersionedUpdate` gate means the `-updating` mutex check runs for all Windows builds. Need to verify that non-versioned Inno Setup installs also create the `-updating` mutex (they do — `GetSetupMutex` returns it for all background updates).
2. **Multiple user accounts**: The mutex namespace is per-Windows-session, so RunAs users in the same session share mutexes. The Step 1.1 check (verify setup mutex before spawning) would prevent the second user's VS Code from spawning a conflicting installer. However, if both users trigger updates within the same second before either creates the mutex, there's still a race. A file-based lock could provide additional protection.
3. **Backward compatibility**: Older VS Code versions without these fixes will still trigger the dialog when interacting with a newer version's update. This is acceptable since the fix progressively improves the situation as users update.
