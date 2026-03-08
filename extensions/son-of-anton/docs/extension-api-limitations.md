# Extension API Limitations

Running document of cases where the VS Code extension API is insufficient for the Son of Anton experience. Each entry is evidence for evaluating Phase 2 fork modifications.

---

## 1. Inline Diff Overlay with Accept/Reject

**What we were trying to do:**
Show the proposed inline edit as a rich diff overlay directly inside the editor, with Accept and Reject buttons rendered inline alongside the changed lines.

**What the API allows:**
- `TextEditorDecorationType` for adding visual decorations (background colours, border, text) to existing lines
- `vscode.diff` command to open a side-by-side diff editor between two URIs
- Webview panels (separate from the editor)

**Why it's insufficient:**
There is no API to render interactive UI (buttons, action items) inline within the editor surface. Decorations are visual-only; they cannot receive click events. The diff editor opens in a separate tab, breaking the inline editing flow. There is no `InlineEditProvider` or similar API that provides a diff with accept/reject.

**What a fork modification would enable:**
A custom inline diff widget rendered inside the editor view zone, with Accept/Reject buttons that apply or dismiss the proposed changes. Similar to how GitHub Copilot's inline chat works with deep editor integration.

**Workaround used:**
Show the proposed edit in a notification dialog (`vscode.window.showInformationMessage`) with Accept/Reject buttons. Functional but poor UX — the user cannot see the actual diff before accepting.

**Trade-offs:**
Users must accept blindly or copy-paste to compare. Significantly worse UX than an inline diff overlay.

---

## 2. Real-time Streaming in Editor Decorations

**What we were trying to do:**
Stream LLM-generated code directly into the editor as ghost text that builds up token by token, showing the generation in real time.

**What the API allows:**
- `InlineCompletionItemProvider` for ghost text completions, but items are provided as complete strings
- Decorations can be updated, but updating them per-token creates visual flicker

**Why it's insufficient:**
`InlineCompletionItemProvider` does not support streaming — you must return the full completion text. There is no callback to update the ghost text incrementally. Repeated decoration updates cause noticeable flicker.

**What a fork modification would enable:**
A streaming-aware inline completion API that accepts an `AsyncIterable<string>` and renders tokens as they arrive with smooth animation.

**Workaround used:**
Return the full completion only after the LLM finishes generating. For inline edit, stream into the webview chat panel instead of the editor.

**Trade-offs:**
Higher perceived latency for completions. Users see the full completion appear all at once rather than building up, which feels slower even if total time is the same.

---

## 3. Custom Activity Bar Icon with Dynamic Badge

**What we were trying to do:**
Show a dynamic badge on the Son of Anton activity bar icon indicating the number of active agents, with an animated icon when agents are running.

**What the API allows:**
- `viewsContainers` contribution for adding an activity bar icon
- `TreeView.badge` for showing a count badge on tree views
- Status bar items with text and icons

**Why it's insufficient:**
The `TreeView.badge` API only accepts a static number, not an animated or dynamic icon. There is no API to animate the activity bar icon itself. The activity bar icon is a static SVG.

**What a fork modification would enable:**
Activity bar icons that support animation states (e.g., spinning) and richer badge content.

**Workaround used:**
Use a status bar item (bottom of the window) with `$(sync~spin)` animated icon to indicate agent activity. The activity bar icon remains static.

**Trade-offs:**
The agent activity indicator is at the bottom of the window rather than on the sidebar icon where it would be more visible.

---

## 4. Editor Gutter Annotations for Agent Activity

**What we were trying to do:**
Show small icons in the editor gutter indicating which lines were written or modified by agents, with hover tooltips showing which agent made the change and when.

**What the API allows:**
- `TextEditorDecorationType` with `gutterIconPath` for static gutter icons
- Decorations can be set per-range

**Why it's insufficient:**
Gutter decorations are static icons — they cannot show hover tooltips with rich content (agent name, timestamp, trace link). There is no click handler for gutter decorations. Each decoration type is a class, so showing per-line metadata requires creating a decoration type per unique icon/tooltip combination, which does not scale.

**What a fork modification would enable:**
A gutter annotation API that supports hover providers and click handlers, similar to `CodeLensProvider` but in the gutter column.

**Workaround used:**
Use CodeLens above modified functions to show "Modified by [Agent]" labels. Less granular than per-line gutter annotations.

**Trade-offs:**
CodeLens is per-function rather than per-line. More visual noise. Cannot show annotations for individual line changes within a function.

---

## 5. Terminal Output Capture

**What we were trying to do:**
Capture the output of terminal commands run by agents so it can be included in conversation context and trace data.

**What the API allows:**
- `vscode.window.terminals` to list terminals
- `Terminal.sendText()` to run commands
- `window.onDidWriteTerminalData` (proposed API) for reading terminal output

**Why it's insufficient:**
`onDidWriteTerminalData` is a proposed API, not stable. There is no stable API to read terminal output. `Terminal.sendText()` is fire-and-forget with no way to capture the result.

**What a fork modification would enable:**
A stable terminal output capture API, or a dedicated agent execution channel that returns stdout/stderr.

**Workaround used:**
Use `child_process.exec` / `child_process.spawn` directly instead of the VS Code terminal for commands that need output capture. The terminal is only used for user-visible commands.

**Trade-offs:**
Commands run via `child_process` are invisible to the user unless we explicitly show the output. Two different execution paths for commands (terminal for visibility, child_process for capture).

---

## 6. Webview Panel Positioning

**What we were trying to do:**
Open the chat panel as a docked sidebar panel (like the built-in chat) rather than as a regular editor tab or beside panel.

**What the API allows:**
- `WebviewViewProvider` for sidebar webviews (limited to the sidebar area)
- `WebviewPanel` for editor-area panels
- `ViewColumn.Beside` for side-by-side

**Why it's insufficient:**
`WebviewViewProvider` in the sidebar has limited space and cannot be resized freely. `WebviewPanel` opens as an editor tab, which can be closed accidentally and competes with code tabs. There is no API to create a persistent docked panel in a custom position (e.g., bottom panel area with custom sizing).

**What a fork modification would enable:**
A dedicated chat panel position in the workbench layout, similar to the built-in chat experience, with persistent positioning and resizing.

**Workaround used:**
Use `WebviewPanel` with `ViewColumn.Beside` and `retainContextWhenHidden: true` to keep state when hidden. Register the sidebar views separately for agent status.

**Trade-offs:**
The chat panel behaves like a regular editor tab. It can be accidentally closed, moved to other positions, or lost among many open tabs.
