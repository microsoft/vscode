import * as vscode from 'vscode';
import { GraphViewProvider } from './graphViewProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new GraphViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('autothropic.graphView', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Open/focus graph command — reveals the panel and focuses the graph tab
  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.graph.open', () => {
      vscode.commands.executeCommand('autothropic.graphView.focus');
    })
  );

  // Fit view command
  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.graph.fitView', () => {
      const p = GraphViewProvider.getInstance();
      if (p) { p.refresh(); }
    })
  );

  // Add agent command (from graph)
  context.subscriptions.push(
    vscode.commands.registerCommand('autothropic.graph.addAgent', () => {
      vscode.commands.executeCommand('autothropic.agents.spawn');
    })
  );

  // Internal: refresh graph when agents change
  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.graph.refresh', () => {
      const p = GraphViewProvider.getInstance();
      if (p) { p.refresh(); }
    })
  );

  // Internal: edge pulse notification from orchestration
  context.subscriptions.push(
    vscode.commands.registerCommand('_autothropic.graph.edgePulse', (fromId: string, toId: string) => {
      const p = GraphViewProvider.getInstance();
      if (p) { p.notifyEdgePulse(fromId, toId); }
    })
  );
}

export function deactivate() {}
