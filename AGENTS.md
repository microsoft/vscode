# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

Prefer `CancellationToken`/`CancellationTokenSource` internally and adapt `AbortSignal` only at native or third-party API boundaries; see the [cancellation guidance](.github/copilot-instructions.md#cancellation).

## Design-system book canvas

Keep one design-system book canvas per worktree, across chats and sessions. Reuse the existing canvas in its owning chat; do not create another panel to show a different topic or refresh content. The canonical instance ID is `design-book` for canvas type `vscode-design-system`. Instance IDs are chat-scoped, so using the same ID in a different chat does not establish worktree-wide reuse: locate and return to the owning chat first.

Resolve `git rev-parse --git-path copilot-workflow.json` and read `canvas.ownerChat` for the owning chat and current refresh status before using canvas tools. Only that chat manages the shared installation, provider reload, and canonical reopen. Other chats use headless reads or request an update from the owner. Freeze a coherent candidate for a bounded combined refresh, then resume later topic writes in the next batch; new work must not indefinitely postpone updates. Never install partial source state.

Use the current worktree as the content root. Keep the viewer in its separate repository and only one managed installation under `.github/extensions/vscode-design-system/`. Refresh or reopen the existing instance after updates; never invent numbered or topic-specific instance IDs. Use the host's **Close Canvas** action to retire duplicates; stopping a viewer server or closing an editor tab alone does not remove a canvas from the picker.
