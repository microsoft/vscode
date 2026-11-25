# Copilot CLI Integration

This folder integrates the standalone Copilot CLI (the `copilot` command run in a terminal) with VS Code. VS Code exposes editor context and tools to running CLI sessions over an in-process MCP server, and lets the user send files, selections and diffs to them.

Copilot CLI chat sessions inside VS Code are provided by the Agent Host (`src/vs/platform/agentHost/node/copilot/` in the core repository), not by this extension. The former extension-host session provider and its `@github/copilot` SDK dependency were removed; legacy `copilotcli:` sessions are adopted by the Agent Host when opened.

## Architecture

```
┌──────────────────────────────┐      MCP over HTTP       ┌──────────────────────────────┐
│ Copilot CLI (terminal)       │ ◄──────────────────────► │ InProcHttpServer             │
│ discovers VS Code through    │                          │ (vscode-node/inProcHttp...)  │
│ lock files in ~/.copilot/ide │                          │ tools, push notifications    │
└──────────────────────────────┘                          └──────────────┬───────────────┘
                                                                         │
                                          ┌──────────────────────────────┴───────────────┐
                                          │ CopilotCLIContrib (vscode-node/contribution) │
                                          │ commands, diff state, session tracking       │
                                          └──────────────────────────────────────────────┘
```

## Folder Structure

```
copilotcli/
├── node/
│   └── cliHelpers.ts                 # Paths of the Copilot home, state and session directories
└── vscode-node/
    ├── contribution.ts               # CopilotCLIContrib: wires the server, commands and tools
    ├── copilotCLISessionTracker.ts   # Connected CLI sessions, their processes and names
    ├── inProcHttpServer.ts           # In-process MCP server the CLI connects to
    ├── lockFile.ts                   # Lock files that let the CLI discover this window
    ├── diffState.ts                  # Open diffs proposed by CLI sessions
    ├── readonlyContentProvider.ts    # Read-only documents for diff originals
    ├── commands/                     # Add file/selection to a session, accept/reject diffs
    └── tools/                        # MCP tools (diffs, diagnostics, selection, VS Code info) and push notifications
```

The terminal integration that launches the CLI and resumes sessions in a terminal lives next to this folder, in `../vscode-node/copilotCLITerminalIntegration.ts` and `../vscode-node/copilotCLITerminalCommands.ts`. `ChatSessionsContrib` (`../vscode-node/chatSessions.ts`) creates both.

## Layering Rules

| Layer | Can import from | Cannot import from |
|-------|----------------|--------------------|
| `node/` | `src/util/`, `src/platform/`, Node.js builtins | `vscode-node/`, `vscode` module |
| `vscode-node/` | `node/`, `src/util/`, `src/platform/`, `vscode` module | (top layer — no restrictions) |

## Critical Pitfalls

- **Lock files are the discovery contract**: the CLI finds VS Code windows through the lock files that `lockFile.ts` writes under `~/.copilot/ide/`. Stale lock files from previous windows are cleaned up on startup; keep their format compatible with released CLI versions.
- **Diffs are per session**: when a CLI client disconnects, `DiffStateManager.closeAllForSession()` closes the diffs it opened. Tools that open diffs must associate them with the calling session.