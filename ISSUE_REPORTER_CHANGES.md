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

### Single-page issue form

- Replaced the three-step wizard with one scrollable form that shows issue metadata, description, attachments, similar issues, and diagnostic controls together.
- Added GitHub/GitHub Pull Requests-inspired cards, hierarchy, spacing, and a persistent **Preview on GitHub** action.
- Keeps attachments in a dedicated row instead of inserting generated media markup into the description editor.
- Uses an embedded Monaco Markdown editor in **Write** mode and VS Code's Markdown renderer in **Preview** mode.
- Defaults the target to **Agents Window** when opened from the Agents window and to **Code - OSS Dev** in the Editor window.
- Supports narrow editor groups without horizontal overflow.

The experimental WYSIWYG Markdown editor is currently implemented as a custom-editor webview owned by the built-in Markdown extension. It is not exposed as an embeddable workbench control, and this branch intentionally adds no new dependency. A future iteration can evaluate moving the entire issue reporter into a built-in extension so it can reuse extension-owned Markdown UI cleanly. **Revisit this option before opening a draft pull request.**

### AI-assisted issue quality review

- Adds a **Review quality** action beside the description's Write/Preview controls.
- Reviews the current title and description with the existing Copilot utility language model; no new dependency is added.
- Requests structured, high-signal feedback about clarity, completeness, reproducibility, and actionability.
- Anchors description findings to exact source excerpts and renders them as native Monaco squiggles with hover details.
- Shows title findings with warning or information styling and lists all findings in an accessible review panel.
- Provides **Show in text** for every finding and **Apply suggestion** only for safe, uniquely anchored localized replacements.
- Clears stale diagnostics when the draft changes and ignores model responses for an older title or description.
- Cancels reviews after 30 seconds so a provider failure cannot leave the action spinning indefinitely.
- Treats issue content and model output as untrusted input and never applies a replacement when its excerpt cannot be matched uniquely.

## Validation Completed

- `npm run typecheck-client`
- Full `npm run compile`
- Focused `IssueReporterOverlay` browser tests: 8 passing
- Repository pre-commit hygiene checks
- Editor and Agents window smoke testing for attachments and recording using the launch workflow
- Screenshot inspection of attachment, recording, and Screencast Mode behavior
- Isolated one-window Editor and Agents launch checks for the single-page form
- Verified all three sections render simultaneously in both products
- Verified Markdown preview renders headings, lists, bold text, and blockquotes
- Verified the issue reporter content width equals its scroll width in both products, with no horizontal overflow
- Verified the embedded Monaco Markdown editor, placeholder, Write/Preview toggle, and Agents Window default in isolated Editor and Agents launches.
- Completed a live issue-quality review in the Agents window: four diagnostics rendered, warning/information squiggles appeared, hover text included the suggested replacement, and a localized fix updated only its anchored text before clearing stale diagnostics.
- Verified the review button enters and exits its loading state and remains usable after completion.

The Editor-window source launch verified the same Monaco UI and review loading path, but its cloned Copilot extension failed independently with `items is not iterable` before returning a model response. The focused browser test covers rendering and applying diagnostics in that surface, while the live language-model response was verified end-to-end in the Agents window. The signed Exploration build should repeat the review once to rule out source-profile authentication differences.

The source-build checks cannot validate final macOS TCC identity because Code OSS launched from sources may inherit permission from its launcher or use a development code identity. The signed Exploration build remains required for the screen-recording registration checks below.

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

### Single-page form

1. Open **Help: Report Issue** in an Editor window and confirm the whole form is available on one scrollable page.
2. Open it in an Agents window and confirm **Agents Window** is selected by default.
3. Resize the reporter to a narrow editor group and verify no horizontal scrollbar appears.
4. Enter Markdown, switch between **Write** and **Preview**, and verify rendered formatting and focus restoration.
5. Verify the attachments row remains separate from the description and accepts capture, paste, and drag-and-drop input.
6. Expand and collapse supporting diagnostic sections and verify their include/exclude controls still affect the generated issue body.
7. Click **Preview on GitHub** with missing required fields and verify validation points to the correct controls on the same page.

### AI-assisted issue quality review

1. Enter a vague title and an incomplete description, then click **Review quality**.
2. Verify the button shows a loading state and returns to its normal state when the review completes.
3. Verify description findings appear as warning or information squiggles in Monaco.
4. Hover each squiggle and verify its message and optional replacement are readable.
5. Use **Show in text** for title and description findings and verify the corresponding text is selected and focused.
6. Apply a localized suggestion and verify only the anchored text changes, diagnostics clear, and a refresh message appears.
7. Edit the title or description after a review and verify stale diagnostics disappear.
8. Start a review, edit the draft before it finishes, and verify the stale response is not displayed.
9. Switch to **Preview** and back to **Write**, verifying Markdown rendering, Monaco state, diagnostics, and focus remain correct.
10. Repeat the workflow in both the Editor window and Agents window.
