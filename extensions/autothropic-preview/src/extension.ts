import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { PreviewPanel } from './previewPanel';
import { ClipEditor } from './clipPicker';
import { ImageEditor } from './imageEditor';

let previewUrl: string | null = null;
let previewUrlManual = false;
let urlDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let panelListenersWired = false;
let clipBufferStarted = false;

// Build terminal management
let _buildTerminal: vscode.Terminal | undefined;
let _buildTerminalReady = false;

export function activate(context: vscode.ExtensionContext) {
  const clipEditor = new ClipEditor(context.extensionUri);
  const imageEditor = new ImageEditor(context.extensionUri);

  // Wire clip editor send → agent
  clipEditor.onSend(async ({ filePaths, agentId }) => {
    await sendFilesToAgent(filePaths, agentId);
  });

  // Wire image editor send → agent
  imageEditor.onSend(async ({ filePaths, agentId }) => {
    await sendFilesToAgent(filePaths, agentId);
  });

  // Open preview command
  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.preview.open', async () => {
      const panel = await PreviewPanel.createOrShow(context.extensionUri, context);
      setupPanelListeners(panel, clipEditor, imageEditor);
    })
  );

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.preview.refresh', () => {
      const panel = PreviewPanel.getInstance();
      if (panel) { panel.refresh(); }
    })
  );

  // Screenshot command
  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.preview.screenshot', async () => {
      const panel = PreviewPanel.getInstance();
      if (!panel) {
        vscode.window.showWarningMessage('Open preview first');
        return;
      }
      await takeScreenshot(panel, imageEditor);
    })
  );

  // Open clip editor command
  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.preview.openClipEditor', async () => {
      await clipEditor.show(3);
    })
  );

  // Terminal URL auto-detection
  context.subscriptions.push(
    vscode.window.onDidWriteTerminalData((e) => {
      if (previewUrlManual) { return; }
      const clean = e.data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const match = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
      if (match && match[0] !== previewUrl) {
        const url = match[0];
        if (urlDebounceTimer) { clearTimeout(urlDebounceTimer); }
        urlDebounceTimer = setTimeout(() => {
          previewUrl = url;
          const panel = PreviewPanel.getInstance();
          if (panel) {
            panel.setUrl(url);
            startClipBufferIfNeeded(panel);
          }
        }, 800);
      }
    })
  );

  // Auto-open preview panel
  PreviewPanel.createOrShow(context.extensionUri, context).then(
    (panel) => setupPanelListeners(panel, clipEditor, imageEditor),
    (err) => console.error('[autothropic-preview] Failed to create panel:', err),
  );

  // Build terminal auto-start
  setTimeout(() => ensureSingleBuildTerminal(), 1500);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      ensureSingleBuildTerminal();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((t) => {
      if (t.name === BUILD_TERMINAL_NAME && t !== _buildTerminal) {
        t.dispose();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((t) => {
      if (t === _buildTerminal) {
        _buildTerminal = undefined;
        _buildTerminalReady = false;
      }
    })
  );

  // Cleanup
  context.subscriptions.push({
    dispose() {
      if (urlDebounceTimer) { clearTimeout(urlDebounceTimer); }
      clipEditor.dispose();
      imageEditor.dispose();
    },
  });
}

// --- Clip Buffer ---

async function startClipBufferIfNeeded(panel: PreviewPanel): Promise<void> {
  if (clipBufferStarted) { return; }
  const port = panel.getProxyPort();
  if (!port) { return; }

  try {
    const status = await vscode.commands.executeCommand<{ active: boolean }>(
      '_autothropic.capture.getClipStatus'
    );
    if (status?.active) {
      clipBufferStarted = true;
      return;
    }
  } catch { /* service not available yet */ }

  try {
    await vscode.commands.executeCommand('_autothropic.capture.startClipBuffer', port);
    clipBufferStarted = true;
  } catch {
    // Capture service may not be available in web or test environments
  }
}

// --- Screenshot → Send to Agent ---

async function takeScreenshot(panel: PreviewPanel, imageEditor: ImageEditor): Promise<void> {
  const port = panel.getProxyPort();
  if (!port) {
    vscode.window.showWarningMessage('Preview proxy not running');
    return;
  }

  try {
    const deviceInfo = panel.getCurrentDeviceInfo();
    const result = await vscode.commands.executeCommand<{ dataUrl: string }>(
      '_autothropic.capture.screenshot', port, deviceInfo
    );
    if (result?.dataUrl) {
      const base64 = result.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const bytes = Buffer.from(base64, 'base64');
      const tmpDir = path.join(os.tmpdir(), 'autothropic-screenshots');
      try { await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpDir)); } catch { /* exists */ }
      const filePath = path.join(tmpDir, `preview-${Date.now()}.png`);
      await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes);

      // Open in image editor for review/annotation instead of auto-sending
      await imageEditor.show(filePath);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Screenshot failed: ${err}`);
  }
}

// --- Send Files to Agent ---

async function sendFilesToAgent(filePaths: string[], agentId?: string): Promise<void> {
  if (filePaths.length === 0) { return; }

  // Build the file paths text — user will add context before submitting
  const message = filePaths.map(p => `"${p}"`).join(' ') + ' ';

  if (agentId) {
    try {
      await vscode.commands.executeCommand('_autothropic.agents.appendToInput', agentId, message);
      vscode.window.showInformationMessage(`Screenshot appended to agent input — add context and press Enter`);
      return;
    } catch { /* agent not available, fall through */ }
  }

  // Try to find first available agent
  try {
    const sessions = await vscode.commands.executeCommand<any[]>('_autothropic.agents.getSessions');
    if (sessions && sessions.length > 0) {
      const target = sessions.find((s: any) => s.status === 'waiting') ?? sessions[0];
      await vscode.commands.executeCommand('_autothropic.agents.appendToInput', target.id, message);
      vscode.window.showInformationMessage(`Screenshot appended to ${target.name} — add context and press Enter`);
      return;
    }
  } catch { /* agents extension not available */ }

  // Fallback: open in editor
  for (const fp of filePaths) {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fp));
  }
  vscode.window.showInformationMessage(`Saved ${filePaths.length} frame(s)`);
}

// --- Panel Listeners ---

function setupPanelListeners(panel: PreviewPanel, clipEditor: ClipEditor, imageEditor: ImageEditor): void {
  if (panelListenersWired) { return; }
  panelListenersWired = true;

  const savedUrl = panel.getCurrentUrl();
  if (savedUrl && !previewUrl) {
    previewUrl = savedUrl;
    startClipBufferIfNeeded(panel);
  }

  panel.onDispose(() => {
    panelListenersWired = false;
    previewUrlManual = false;
    clipBufferStarted = false;
  });

  panel.onManualUrl((url) => {
    previewUrl = url;
    previewUrlManual = true;
    startClipBufferIfNeeded(panel);
  });

  panel.onScreenshot(() => takeScreenshot(panel, imageEditor));

  panel.onOpenClipEditor(async () => {
    await clipEditor.show(3);
  });
}

// --- Build Terminal ---

const BUILD_TERMINAL_NAME = '\u26A1 Build';

async function ensureSingleBuildTerminal(): Promise<void> {
  if (_buildTerminalReady) { return; }
  _buildTerminalReady = true;

  const stale = vscode.window.terminals.filter(t => t.name === BUILD_TERMINAL_NAME);
  for (const t of stale) { t.dispose(); }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    _buildTerminalReady = false;
    return;
  }

  const pkgUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'package.json');
  try {
    const pkgData = await vscode.workspace.fs.readFile(pkgUri);
    const pkg = JSON.parse(Buffer.from(pkgData).toString('utf-8'));
    const scripts = pkg.scripts ?? {};

    let devScript: string | undefined;
    for (const name of ['dev', 'start', 'serve']) {
      if (scripts[name]) {
        devScript = name;
        break;
      }
    }

    if (!devScript) { return; }

    const pm = await detectPackageManager(workspaceFolders[0].uri);
    const terminal = vscode.window.createTerminal({
      name: BUILD_TERMINAL_NAME,
      cwd: workspaceFolders[0].uri,
      iconPath: new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.yellow')),
    });

    _buildTerminal = terminal;
    terminal.sendText(`${pm} run ${devScript}`);
  } catch {
    _buildTerminalReady = false;
  }
}

async function detectPackageManager(workspaceUri: vscode.Uri): Promise<string> {
  const lockFiles: Array<[string, string]> = [
    ['bun.lockb', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ];
  for (const [file, pm] of lockFiles) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceUri, file));
      return pm;
    } catch {
      // not found, continue
    }
  }
  return 'npm';
}

export function deactivate() {}
