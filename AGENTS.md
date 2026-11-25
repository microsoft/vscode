# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

Prefer `CancellationToken`/`CancellationTokenSource` internally and adapt `AbortSignal` only at native or third-party API boundaries; see the [cancellation guidance](.github/copilot-instructions.md#cancellation).
