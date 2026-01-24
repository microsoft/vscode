# Agent Window Architecture

The Agent window is a minimal VS Code window type with custom HTML/JS/layout (not standard workbench), its own extension host, and minimal service footprint.

## File Structure

```
src/vs/code/electron-browser/agent/
  agent.html                    -- HTML shell with CSP
  agent.ts                      -- Main process entry

src/vs/workbench/
  workbench.agent.desktop.main.ts  -- Entry point
  electron-browser/
    agent.main.ts               -- Bootstrap, service initialization
  contrib/agent/
    browser/
      agentWindow.ts            -- UI layout and chat components
      agent.contribution.ts     -- Contribution registration
```

The `contrib/agent/browser/` folder contains the opinionated agent layout, which is intentionally different from the traditional VS Code workbench layout. This is where we explore custom UI patterns tailored for agentic workflows.

## Key Concepts

### Service Setup

The entry point imports `workbench.desktop.main.js` which registers all singletons via side-effects. Then:

1. **Core platform services** are created manually (main process, product, environment, files, storage, etc.)
2. **Registered singletons** are collected via `getSingletonServiceDescriptors()`
3. **Stub services** are provided for unused features (notifications, layout)

### Extension Host

The Agent Window runs its own dedicated extension host, separate from the main workbench's extension host. Currently it uses an empty workspace. This isolation allows debugging both extension hosts simultaneously when needed.

The Agent Extension Host has its own debug port (5878) and CLI arguments:

```bash
./scripts/code.sh --inspect-agent-extensions=5878
./scripts/code.sh --inspect-brk-agent-extensions=5878  # break on start
```

To debug a development extension in OSS and attach to both extension hosts, start VS Code OSS with the extension development path and explicit ports, then attach from another window:

```bash
./scripts/code.sh \
  /path/to/vscode-copilot-chat \
  --extensionDevelopmentPath=/path/to/vscode-copilot-chat \
  --inspect-extensions=5870 \
  --inspect-agent-extensions=5878
```

Then use the launch configurations "Attach to Extension Host" (5870) and "Attach to Agent Window Extension Host" (5878).

## Testing

Open via Command Palette: `Developer: Agent Window`

## Open Questions

### Workspace Strategy

Currently the extension host starts with an empty workspace. An alternative approach is to dynamically add folders to make it behave like a multi-root workspace. Since this is our own customized agent window (which doesn't display folders in the UI), we can disable extension host reload when folders change.

### Local Agent Limitations

The local agent (coding agent running locally) does not work in the Agent Window because:

1. **Workspace trust**: Local agent requires the workspace to be trusted
2. **Workspace-dependent tools**: Features like Problems, Test Runner, and Tasks require an actual workspace with files
3. **Split implementation**: Local agent requires coordination between VS Code core and the Copilot Chat extension

These limitations mean the Agent Window currently only supports remote/cloud agents.
