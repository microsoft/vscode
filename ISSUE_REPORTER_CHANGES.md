# Issue Reporter Improvements

This document tracks the issue reporter changes on `agents/fix-issue-reporter-bug-fixes`, the GitHub issues they address, and the final verification required before opening a pull request.

## Implemented

### macOS screen-recording permission registration

- Added an explicit screen-capture permission request to the native host service.
- The request runs through Electron's main-process `desktopCapturer` API so macOS associates the TCC request with the VS Code product application rather than a spawned `osascript` process or terminal launcher.
- Clicking **Record** requests registration when the permission state is `not-determined`.
- Clicking **Open System Settings** requests registration before opening the Screen & System Audio Recording settings pane, so the application should already be present in the permission list.
- Related issue: [#326786 — VS Code missing from screen-recording permissions](https://github.com/microsoft/vscode/issues/326786)

### Reliable video recording startup

- Validates that `getDisplayMedia()` returns a live video track.
- Guards `MediaRecorder.start()` and cleans up the stream and recorder when startup fails.
- Avoids leaving the reporter in a recording state after a cancelled picker or failed recording initialization.
- Related issue: [#326371 — Video recording fails after granting permissions](https://github.com/microsoft/vscode/issues/326371)

### Automatic Screencast Mode

- Enables Screencast Mode when issue-reporter recording starts.
- Restores the previous Screencast Mode state when recording stops, fails, or the reporter is disposed.
- Extended the existing toggle command with an explicit desired-state argument so the reporter does not rely on DOM selectors or disable a mode the user had already enabled.
- Related issue: [#318975 — Automatic Screencast Mode](https://github.com/microsoft/vscode/issues/318975)

### Clipboard and drag-and-drop attachments

- Supports pasting image and video files into the attachments area.
- Supports dragging image and video files into the reporter with visible drop-target feedback.
- Supports pasting images while editing the issue description without navigating away from the description.
- Persists imported videos in the issue-reporter temporary directory and generates duration and thumbnail metadata.
- Enforces the existing five-attachment and 100 MB limits for imported media.
- Related issues:
  - [#327380 — Attach screenshots/videos using clipboard or drag-and-drop](https://github.com/microsoft/vscode/issues/327380)
  - [#326787 — Paste images into the issue description](https://github.com/microsoft/vscode/issues/326787)

## Validation Completed

- `npm run typecheck-client`
- Full `npm run compile`
- Focused `IssueReporterOverlay` browser tests: 5 passing
- Repository pre-commit hygiene checks
- Editor and Agents window smoke testing for attachments and recording using the launch workflow
- Screenshot inspection of attachment, recording, and Screencast Mode behavior

## Final Verification

### Signed Exploration build

Use the final signed/notarized macOS ARM64 Exploration artifact, not an artifact whose name starts with `unsigned_vscode`.

1. Install the Exploration application in `/Applications`.
2. Confirm its signature and designated requirement with `codesign`.
3. Reset ScreenCapture TCC for the Exploration bundle identifier.
4. Launch the application through Finder or LaunchServices.
5. Open the issue reporter and click **Record**.
6. Verify that the Exploration application appears automatically in **System Settings → Privacy & Security → Screen & System Audio Recording**.
7. Deny or leave access disabled, click **Open System Settings**, and verify the application is already present in the list.
8. Grant access, restart when requested, and verify recording starts successfully.
9. Repeat launches from Finder, iTerm, and a VS Code Insiders terminal to ensure permission identity no longer follows the launcher.

### Recording and Screencast Mode

1. Start recording and verify a live recording begins.
2. Verify mouse and keyboard Screencast Mode indicators appear automatically.
3. Stop recording and verify a playable attachment with thumbnail and duration is added.
4. Verify Screencast Mode is disabled afterward only when the reporter enabled it.
5. Enable Screencast Mode manually before recording and verify it remains enabled after recording stops.
6. Cancel the source picker and verify the reporter returns to idle without a broken recording attachment.

### Attachments

1. Paste PNG, JPEG, GIF, WebP, and AVIF images into the attachments area.
2. Paste an image while editing the description and verify the description remains active.
3. Drag image and video files into the attachments area and verify drop feedback.
4. Import MP4 and WebM video files and verify thumbnails, durations, removal, and playback.
5. Verify the five-file and 100 MB limits for pasted, dropped, captured, and recorded media.
6. Verify the resulting GitHub issue submission includes all expected media references.

## In Progress

- Replace the multi-step issue reporter wizard with a single-page issue form.
- Use the experimental Markdown editor for the issue description while keeping attachments in a separate row.
- Align the visual hierarchy with GitHub issue creation and the GitHub Pull Requests extension.

