# Phase R9 — Replace the activation flow

**Estimated time:** Agent 30 min · You 1-2 hr.

Almost entirely IDE-extension work (TypeScript). The goal is a turnkey first-run experience.

## Goal

A clean install of the Son of Anton IDE extension, on a machine with no Docker, produces a working code graph after first activation. No prompts. No setup.

## What this phase changes

- The extension activation auto-spawns the MCP server with `--backend=embedded`.
- The "Enable Code Graph" palette command is renamed to "Switch to Docker Code Graph (advanced)" — opt-in upgrade.
- The first-run prompt is removed.
- A status bar item shows index state: `Code Graph: Indexed (1,234 files)`.
- Existing Docker users (those with `sota.mcp.servers` pointing at the Docker stack) are left untouched.

## Build it

### Step 1: Activation hook

In the extension's `package.json` activation events, ensure code-graph startup is part of the default activation. In the activation function (`src/extension.ts` or equivalent):

```ts
import { spawn } from 'node:child_process';

export async function activate(context: vscode.ExtensionContext) {
  // ... existing activation ...

  const mcpServer = spawn('node', [
    context.asAbsolutePath('services/code-graph/mcp-server/dist/index.js'),
    '--backend=embedded',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CODE_GRAPH_DB: storageDbPath(context) },
  });

  context.subscriptions.push({
    dispose: () => mcpServer.kill('SIGTERM'),
  });
}

function storageDbPath(context: vscode.ExtensionContext) {
  return path.join(context.globalStorageUri.fsPath, 'codegraph.db');
}
```

### Step 2: Status bar item

```ts
const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
status.text = 'Code Graph: starting';
status.show();

// On first indexed-event message from MCP server:
status.text = `Code Graph: indexed (${count} files)`;
status.command = 'son-of-anton.codeGraph.quickActions';
```

Register the quick-pick command with Reindex / Show Logs / Switch Backend options.

### Step 3: Rename the palette command

In `package.json` contributions:

```json
{
  "commands": [
    {
      "command": "son-of-anton.enableDockerCodeGraph",
      "title": "Switch to Docker Code Graph (advanced)"
    }
  ]
}
```

Wire the command to update `sota.mcp.servers` and prompt the user to restart the extension. Keep the existing Docker setup logic; you're only changing the framing from "opt-in to use code graph" to "opt-in to upgrade to Docker."

### Step 4: Migration logic

Detect existing Docker users:

```ts
const existing = vscode.workspace.getConfiguration('sota.mcp').get<any[]>('servers') ?? [];
const usingDocker = existing.some(s => s.command?.includes('falkordb'));

if (!usingDocker) {
  // Default: embedded backend.
} else {
  // Leave their config alone. They explicitly chose Docker.
}
```

### Step 5: Drop the first-run prompt

Find and remove (or gate behind a debug flag) the modal that asks the user to enable code graph. The new behaviour is: it's on by default.

## Acceptance criteria

- [ ] A fresh extension install with no settings and no Docker produces a working code graph after first activation
- [ ] Indexing a 1K-file workspace shows the count in the status bar within 30s
- [ ] The "Switch to Docker Code Graph" command still works for users who want it

## Next

[Phase R10 — Docker backend (optional)](./r10-docker-backend.md). Skip this unless you actually need it.
