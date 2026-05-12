/**
 * Reference VS Code activation flow for the codegraph backend.
 *
 * Drop the relevant parts of this file into the real Son of Anton extension.
 * The shape it produces:
 *
 *   1. On activation, spawn the MCP server with --backend=embedded.
 *   2. Show a status bar item that reflects index state.
 *   3. Register a few palette commands:
 *        - Code Graph: Reindex Workspace
 *        - Code Graph: Show Logs
 *        - Switch to Docker Code Graph (advanced)   <-- opt-in upgrade
 *        - Code Graph: Quick Actions                <-- status bar click target
 *   4. On deactivation, terminate the child process cleanly.
 *
 * Existing Docker users (those whose settings already point at the FalkorDB
 * stack) are detected and skipped, so we don't silently switch them off it.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';

const STATUS_PRIORITY = 100;

let mcpServer: ChildProcess | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let logChannel: vscode.OutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  logChannel = vscode.window.createOutputChannel('Code Graph');
  context.subscriptions.push(logChannel);
  log('activating');

  if (detectExistingDockerSetup()) {
    log(
      'detected existing Docker-backed configuration; leaving it untouched. ' +
        'Use the "Switch to Docker Code Graph" command to manage it.',
    );
    return;
  }

  const config = vscode.workspace.getConfiguration('codegraph');
  const backend = config.get<'embedded' | 'docker'>('backend', 'embedded');

  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    STATUS_PRIORITY,
  );
  statusBar.text = '$(database) Code Graph: starting';
  statusBar.command = 'codegraph.quickActions';
  statusBar.show();
  context.subscriptions.push(statusBar);

  registerCommands(context);

  if (backend === 'embedded') {
    await startMcpServer(context);
  } else {
    log('docker backend selected; the embedded server is not spawned');
    setStatus('docker mode');
  }
}

export async function deactivate() {
  log('deactivating');
  if (mcpServer && !mcpServer.killed) {
    mcpServer.kill('SIGTERM');
    // Best-effort: wait briefly for clean exit, then force.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (mcpServer && !mcpServer.killed) mcpServer.kill('SIGKILL');
        resolve();
      }, 1500);
      mcpServer?.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codegraph.reindex', async () => {
      // The MCP server picks up a SIGHUP-style signal here in a real
      // implementation; for the sample we restart the process.
      log('reindex requested — restarting MCP server');
      await deactivate();
      mcpServer = undefined;
      await startMcpServer(context);
    }),

    vscode.commands.registerCommand('codegraph.showLogs', () => {
      logChannel?.show(true);
    }),

    vscode.commands.registerCommand('codegraph.switchToDocker', async () => {
      const confirmed = await vscode.window.showWarningMessage(
        'Switch to the Docker-backed Code Graph? You will need Docker installed and the FalkorDB stack running.',
        { modal: true },
        'Switch',
      );
      if (confirmed === 'Switch') {
        await vscode.workspace
          .getConfiguration('codegraph')
          .update('backend', 'docker', vscode.ConfigurationTarget.Global);
        await vscode.window.showInformationMessage(
          'Backend switched to docker. Reload the window to apply.',
          'Reload',
        );
      }
    }),

    vscode.commands.registerCommand('codegraph.quickActions', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: '$(refresh) Reindex Workspace', cmd: 'codegraph.reindex' },
          { label: '$(output) Show Logs', cmd: 'codegraph.showLogs' },
          { label: '$(server) Switch to Docker', cmd: 'codegraph.switchToDocker' },
        ],
        { placeHolder: 'Code Graph actions' },
      );
      if (choice) await vscode.commands.executeCommand(choice.cmd);
    }),
  );
}

async function startMcpServer(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('codegraph');
  const dbPath = path.join(context.globalStorageUri.fsPath, 'codegraph.db');

  // Best-effort: ensure storage dir exists.
  try {
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
  } catch {
    // Ignore — createDirectory is idempotent in most cases.
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // In a real installation, the MCP server is bundled with the extension under
  // services/code-graph/mcp-server. The path below assumes a sibling layout.
  const serverEntry = context.asAbsolutePath(
    path.join('..', 'mcp-server', 'dist', 'index.js'),
  );

  const args = [serverEntry, `--db=${dbPath}`];
  if (config.get<boolean>('indexOnStartup', true) && workspaceRoot) {
    args.push(`--index-root=${workspaceRoot}`);
  }

  const embedder = config.get<'none' | 'local' | 'provider'>('embedder', 'local');
  if (embedder === 'local') {
    args.push('--local-embedder');
  } else if (embedder === 'provider') {
    const endpoint = config.get<string>('providerEmbedder.endpoint', '');
    const model = config.get<string>('providerEmbedder.model', '');
    const dims = config.get<number>('providerEmbedder.dims', 1536);
    if (endpoint && model) {
      args.push(`--provider-embedder=${endpoint}|${model}|${dims}`);
    } else {
      log('provider embedder configured but endpoint/model missing — falling back to no embedder');
    }
  }

  setStatus('starting...');
  log(`spawning: node ${args.join(' ')}`);

  mcpServer = spawn('node', args, {
    cwd: context.extensionPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  mcpServer.stdout?.on('data', (buf) => {
    // The MCP server sends JSON-RPC over stdout. We don't parse it here —
    // the orchestrator owns the JSON-RPC channel. The log here would be
    // routed to the orchestrator's transport in a real implementation.
    log(`[stdout] ${buf.toString().trim()}`);
  });

  mcpServer.stderr?.on('data', (buf) => {
    const text = buf.toString();
    log(`[stderr] ${text.trim()}`);
    // Look for the "indexed N files" line and reflect it in the status bar.
    const m = text.match(/indexed (\d+) files, (\d+) symbols/);
    if (m) {
      setStatus(`indexed (${m[1]} files, ${m[2]} symbols)`);
    } else if (/mcp server ready/.test(text)) {
      setStatus('ready');
    }
  });

  mcpServer.on('exit', (code, signal) => {
    log(`mcp server exited (code=${code}, signal=${signal})`);
    setStatus(`exited${code ? ` (${code})` : ''}`);
  });

  mcpServer.on('error', (err) => {
    log(`mcp server failed to start: ${err.message}`);
    setStatus('failed');
  });
}

function detectExistingDockerSetup(): boolean {
  // The plan calls out leaving prior Docker users alone. Detect the legacy
  // setting that pointed at the FalkorDB-backed MCP server.
  const servers =
    vscode.workspace.getConfiguration('sota.mcp').get<Array<{ command?: string }>>('servers') ?? [];
  return servers.some((s) => typeof s.command === 'string' && s.command.includes('falkordb'));
}

function setStatus(text: string) {
  if (statusBar) {
    statusBar.text = `$(database) Code Graph: ${text}`;
  }
}

function log(msg: string) {
  logChannel?.appendLine(`[${new Date().toISOString()}] ${msg}`);
}
