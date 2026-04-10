# NES Expected Edit Capture Feature

## Overview

A feature that allows users to record/capture their "expected suggestion" when a Next Edit Suggestion (NES) was rejected or failed to appear. The captured data is saved in `.recording.w.json` format (compatible with stest infrastructure) for analysis and model improvement.

## Getting Started

### 1. Enable the Feature
Add this setting to your VS Code `settings.json`:

```json
{
  // Enable the capture feature
  "github.copilot.chat.advanced.inlineEdits.recordExpectedEdit.enabled": true
}
```

That's it! Auto-capture on rejection is enabled by default. To disable it (you can still capture manually via **Cmd+K Cmd+R**):
```json
{
  "github.copilot.chat.advanced.inlineEdits.recordExpectedEdit.onReject": false
}
```

### 2. Capture an Expected Edit

**When NES shows a wrong suggestion:**
1. Reject the suggestion (press `Esc` or continue typing)
2. If `onReject` is enabled, capture mode starts automatically
3. Type the code you *expected* NES to suggest
4. Press **Enter** to save, or **Esc** to cancel

**When NES didn't appear but should have:**
1. Press **Cmd+K Cmd+R** (Mac) or **Ctrl+K Ctrl+R** (Windows/Linux)
2. Type the code you expected NES to suggest
3. Press **Enter** to save

> **Tip:** Use **Shift+Enter** to insert newlines during capture (since Enter saves).

### 3. Submit Your Feedback
Once you've captured some edits:
1. Open Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**)
2. Run **"Copilot: Submit NES Captures"**
3. Review the files to be included (you can exclude sensitive files)
4. Click **Submit Feedback** to create a PR

### Quick Reference

| Action | Keybinding |
|--------|------------|
| Start capture manually | **Cmd+K Cmd+R** / **Ctrl+K Ctrl+R** |
| Save capture | **Enter** |
| Cancel capture | **Esc** |
| Insert newline | **Shift+Enter** |

| Command | Description |
|---------|-------------|
| Copilot: Record Expected Edit (NES) | Start a capture session |
| Copilot: Submit NES Captures | Upload feedback to internal repo |

## How It Works

### Trigger Points
- **Automatic**: Capture starts when you reject an NES suggestion (if `onReject` setting is enabled)
- **Manual**: Use the keyboard shortcut or Command Palette when NES didn't appear but should have

### Capture Session
When capture mode is active:
1. A status bar indicator shows: **"NES CAPTURE MODE ACTIVE"**
2. Type your expected edit naturally in the editor
3. Press **Enter** to save or **Esc** to cancel

### Where Captures Are Saved
Recordings are stored in your workspace under `.copilot/nes-feedback/`:
- `capture-<timestamp>.recording.w.json` — The edit recording
- `capture-<timestamp>.metadata.json` — Context about the capture

---

## Technical Reference

### Commands

| Command ID | Description |
|------------|-------------|
| `github.copilot.nes.captureExpected.start` | Start capture manually |
| `github.copilot.nes.captureExpected.confirm` | Confirm and save |
| `github.copilot.nes.captureExpected.abort` | Cancel capture |
| `github.copilot.nes.captureExpected.submit` | Submit to `microsoft/copilot-nes-feedback` |

### Architecture

#### State Management
The capture controller maintains minimal state:
```typescript
{
  active: boolean;
  startBookmark: DebugRecorderBookmark;
  endBookmark?: DebugRecorderBookmark;
  startDocumentId: DocumentId;
  startTime: number;
  trigger: 'rejection' | 'manual';
  originalNesMetadata?: {
    requestUuid: string;
    providerInfo?: string;
    modelName?: string;
    endpointUrl?: string;
    suggestionText?: string;
    // [startLine, startCharacter, endLine, endCharacter]
    suggestionRange?: [number, number, number, number];
    documentPath?: string;
  };
}
```

### Implementation Flow

The capture flow leverages **DebugRecorder**, which already tracks all document edits automatically—no custom event listeners or manual diff computation needed.

1. **Start Capture**: Create a bookmark in DebugRecorder, store the current document ID, set context key `copilotNesCaptureMode` to enable keybindings, and show status bar indicator.

2. **User Edits**: User types their expected edit naturally in the editor. DebugRecorder automatically tracks all changes in the background.

3. **Confirm Capture**: Create an end bookmark, extract the log slice between start/end bookmarks, filter for edits on the target document, compose them into a single `nextUserEdit`, and save to disk.

4. **Abort/Cleanup**: Clear state, reset context key, and dispose status bar item.

See `ExpectedEditCaptureController` in [vscode-node/components/expectedEditCaptureController.ts](vscode-node/components/expectedEditCaptureController.ts) for the full implementation.

### File Output

#### Location
Recordings are stored in the **first workspace folder** under the `.copilot/nes-feedback/` directory:

- **Full path**: `<workspaceFolder>/.copilot/nes-feedback/capture-<timestamp>.recording.w.json`
- **Timestamp format**: ISO 8601 with colons/periods replaced by hyphens (e.g., `2025-12-04T14-30-45`)
- **Example**: `.copilot/nes-feedback/capture-2025-12-04T14-30-45.recording.w.json`
- The folder is automatically created if it doesn't exist

Each recording generates two files:
1. **Recording file**: `capture-<timestamp>.recording.w.json` - Contains the log and edit data
2. **Metadata file**: `capture-<timestamp>.metadata.json` - Contains capture context and timing

#### Format
Matches existing `.recording.w.json` structure used by stest infrastructure:

```json
{
  "log": [
    {
      "kind": "header",
      "repoRootUri": "file:///workspace",
      "time": 1234567890,
      "uuid": "..."
    },
    {
      "kind": "documentEncountered",
      "id": 0,
      "relativePath": "src/foo.ts",
      "time": 1234567890
    },
    {
      "kind": "setContent",
      "id": 0,
      "v": 1,
      "content": "...",
      "time": 1234567890
    },
    ...
  ],
  "nextUserEdit": {
    "relativePath": "src/foo.ts",
    "edit": [
      [876, 996, "replaced text"],
      [1522, 1530, "more text"]
    ]
  }
}
```

#### Metadata File
A metadata file is saved alongside each recording with capture context:
```jsonc
{
  "captureTimestamp": "2025-11-19T...",    // ISO timestamp when capture started
  "trigger": "rejection",                   // How capture was initiated: 'rejection' or 'manual'
  "durationMs": 5432,                       // Time between start and confirm in milliseconds
  "noEditExpected": false,                  // True if user confirmed without making edits
  "originalNesContext": {                   // Metadata from the rejected NES suggestion (if any)
    "requestUuid": "...",                   // Unique ID of the NES request
    "providerInfo": "...",                  // Source of the suggestion (e.g., 'provider', 'diagnostics')
    "modelName": "...",                     // AI model that generated the suggestion
    "endpointUrl": "...",                   // API endpoint used for the request
    "suggestionText": "...",                // The actual suggested text that was rejected
    "suggestionRange": [10, 0, 15, 20]      // [startLine, startChar, endLine, endChar] of suggestion
  }
}
```

## Benefits

- **Zero-friction**: Type naturally, press Enter — no forms or dialogs
- **Works for both**: Rejected suggestions and missed opportunities
- **Privacy-aware**: Sensitive files are automatically filtered before submission

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Multiple rapid rejections** | Only one capture active at a time; subsequent rejections ignored |
| **Document closed** | Capture automatically aborted |
| **No edits made** | Valid feedback! Saved with `noEditExpected: true` (indicates the rejection was correct) |
| **Large edits** | DebugRecorder handles size limits automatically |

## Feedback Submission

When you run **"Copilot: Submit NES Captures"**:

1. All captures from `.copilot/nes-feedback/` are collected
2. A preview dialog shows which files will be included
3. You can exclude specific files if needed
4. A pull request is created in `microsoft/copilot-nes-feedback`

### Privacy & Filtering
Sensitive files are **automatically excluded** from submissions:
- VS Code settings (`settings.json`, `launch.json`)
- Credentials (`.npmrc`, `.env`, `.gitconfig`, etc.)
- Private keys (`.pem`, `.key`, `id_rsa`, etc.)
- Sensitive directories (`.aws/`, `.ssh/`, `.gnupg/`)

**Requirements:** GitHub authentication with repo access to `microsoft/copilot-nes-feedback`

---

## Future Enhancements

- **Diff Preview**: Show visual comparison before saving
- **Category Tagging**: Quick-pick to categorize expectation type (import, refactor, etc.)
- **Auto-Generate stest**: Create `.stest.ts` wrapper file automatically

## Related Files

- [node/debugRecorder.ts](node/debugRecorder.ts) - Core recording infrastructure
- [vscode-node/components/inlineEditDebugComponent.ts](vscode-node/components/inlineEditDebugComponent.ts) - Existing feedback/debug tooling and sensitive file filtering
- [vscode-node/components/expectedEditCaptureController.ts](vscode-node/components/expectedEditCaptureController.ts) - Capture session management
- [vscode-node/components/nesFeedbackSubmitter.ts](vscode-node/components/nesFeedbackSubmitter.ts) - Feedback submission to GitHub
- [common/observableWorkspaceRecordingReplayer.ts](common/observableWorkspaceRecordingReplayer.ts) - Recording replay logic
- [../../../test/simulation/inlineEdit/inlineEditTester.ts](../../../test/simulation/inlineEdit/inlineEditTester.ts) - stest infrastructure
