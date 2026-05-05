---
name: code-oss-logs
description: 'Find and read logs from Code OSS dev builds. Use when: finding logs, reading log files, debugging Code OSS, checking renderer logs, extension host logs, agent host logs, main process logs, investigating errors in dev builds.'
---

# Code OSS Logs

Find and display logs from the most recent Code OSS or Agents app dev run.

## Log Root Directories

| App | Default User Data Dir | Logs Path |
|-----|-----------------------|-----------|
| Code OSS | `$HOME/.vscode-oss-dev` | `$HOME/.vscode-oss-dev/logs/` |
| Agents app | `$HOME/.vscode-oss-agents-dev` | `$HOME/.vscode-oss-agents-dev/logs/` |

If Code OSS was launched with `--user-data-dir=<dir>`, use `<dir>/logs/` instead of the defaults above. Launch and debugging helpers often create temporary user data dirs under `.build/`; always prefer the exact user data dir from the launch command when it is known.

Each run creates a timestamped folder like `20260330T163430`. The most recent folder sorted by modification time is usually the one the user cares about.

## Procedure

1. **Identify which app** the user is asking about: Code OSS or Agents app. If unclear, check both.
2. **Find the most recent log folder**:
    ```bash
    ls -lt "$HOME/.vscode-oss-dev/logs" | head -5
    # or for the Agents app:
    ls -lt "$HOME/.vscode-oss-agents-dev/logs" | head -5
    # or for a custom user data dir:
    ls -lt "<user-data-dir>/logs" | head -5
    ```
3. **Navigate into the most recent folder** and list contents.
4. **Read the relevant log file(s)** based on what the user is investigating. Use `tail` for recent entries or `rg` to filter.

## Directory Layout

Each timestamped log folder has this structure:

```text
<timestamp>/
├── main.log                    # Electron main process (app lifecycle, window management)
├── agenthost.log               # Agent host process (Copilot agent, model listing, agent sessions)
├── mcpGateway.log              # MCP gateway/server coordination
├── sharedprocess.log           # Shared process (extensions gallery, global services)
├── telemetry.log               # Telemetry events
├── terminal.log                # Terminal/pty activity
├── ptyhost.log                 # Pty host process
├── network-shared.log          # Shared network activity
├── editSessions.log            # Edit sessions / cloud changes
├── userDataSync.log            # Settings sync
├── remoteTunnelService.log     # Remote tunnel service
│
└── window1/                    # Per-window logs (window1, window2, etc.)
    ├── renderer.log            # Renderer process (workbench UI, services, startup)
    ├── network.log             # Per-window network activity
    ├── views.log               # View/panel activity
    ├── notebook.rendering.log  # Notebook rendering
    ├── customizationsDebug.log # Agent customizations debug info (Agents app)
    ├── mcpServer.*.log         # Per-MCP-server logs (one file per configured server)
    │
    ├── exthost/                # Extension host logs
    │   ├── exthost.log         # Extension host main log (activation, errors)
    │   ├── extHostTelemetry.log
    │   ├── <publisher.extension>/  # Per-extension log folders
    │   │   └── <extension>.log
    │   └── output_logging_<timestamp>/  # Extension output channels
    │
    └── output_<timestamp>/     # Output channel logs (workbench side)
        ├── tasks.log           # Tasks output
        ├── agentSessionsOutput.log  # Agent sessions output (Agents app)
        └── agenthost.<clientId>.log  # Agent host IPC traffic when tracing is enabled
```

### Multiple `output_` Folders

A new `output_<timestamp>/` folder and a corresponding `output_logging_<timestamp>/` inside `exthost/` is created each time the window reloads within the same session. The session-level timestamped folder, such as `20260330T163430/`, stays the same, but each reload gets fresh output channel directories. The most recent `output_*` folder by timestamp has the logs for the current or latest reload. Earlier folders contain logs from prior reloads in that session.

## Key Files by Use Case

| Investigating... | Check these files |
|------------------|-------------------|
| App startup / crashes | `main.log`, `window1/renderer.log` |
| Extension issues | `window1/exthost/exthost.log`, `window1/exthost/<publisher.ext>/` |
| Copilot / agent issues | `agenthost.log`, `window1/exthost/GitHub.copilot-chat/` |
| Agent host IPC (Agents app) | `window1/output_<timestamp>/agenthost.*.log` |
| MCP server problems | `mcpGateway.log`, `window1/mcpServer.*.log` |
| Terminal problems | `terminal.log`, `ptyhost.log` |
| Network / auth issues | `network-shared.log`, `window1/network.log` |
| Settings sync | `userDataSync.log` |
| Agent customizations | `window1/customizationsDebug.log` (Agents app) |

## Useful Commands

```bash
# Recent entries from a log file
tail -50 "<timestamp>/window1/renderer.log"

# Search all logs in a run for a probe marker or error
rg -n "MY_PROBE|error" "<timestamp>"

# Show non-empty logs in a run
find "<timestamp>" -type f -size +0 -print
```

## Temporary Console Forwarding Workflow

When using temporary `console.log` probes and you need those probes to persist in the normal log files, enable dev console forwarding locally before launching Code OSS.

1. In `src/vs/platform/log/common/log.ts`, find `isDevConsoleLogForwardingEnabled`.
2. Temporarily enable the commented `Boolean("true")` line:
    ```ts
    export const isDevConsoleLogForwardingEnabled = false
        || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
        ;
    ```
3. Build or let the watch task pick up the change.
4. Launch Code OSS or the Agents app and reproduce the issue.
5. Read the relevant logs.
6. Before finishing, restore the flag to its default-off state and remove every temporary `console.log` probe.

The `Boolean("true")` form is intentionally lint-hostile so an accidentally enabled flag should be caught before check-in. Do not check in this flag enabled.

## Tips

- For temporary dev probes in source builds, either `console.log` or `ILogService` is fine. Use whichever is easiest in the code you are touching.
- `console.log` probes must never be checked in. If logging code is intended to stay in the product, use `ILogService` instead.
- If dev console forwarding is enabled in the source build, `console.debug`, `console.error`, `console.info`, `console.log`, and `console.warn` are written through the process log service into the normal log files.
- Console probes land in the log for the process that emitted them: main process in `main.log`, renderer/workbench in `window1/renderer.log`, shared process in `sharedprocess.log`, pty host in `ptyhost.log`, and agent host in `agenthost.log`. Extension host console output is observed from the renderer side and appears in `window1/renderer.log` when forwarding all extension-host console output is enabled.
- If console forwarding is not enabled, use `ILogService` for probes that must persist in the log files; native `console.log` may only appear in DevTools or stdout.
- Not all log files have content. Many are created empty and only populated if that subsystem produces output.
- `window1/` is the first window; multi-window sessions will have `window2/`, etc.
- Log lines follow the format: `YYYY-MM-DD HH:MM:SS.mmm [level] message`.
