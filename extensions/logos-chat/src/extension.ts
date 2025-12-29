/**
 * Logos Chat Extension - Multi-agent conversation for Logos IDE
 */

import * as vscode from 'vscode';
import { ChatPanelProvider } from './ChatPanelProvider';
import { ThreadTreeProvider } from './ThreadTreeProvider';
import { AgentRegistry } from './AgentRegistry';

let chatPanelProvider: ChatPanelProvider;
let threadTreeProvider: ThreadTreeProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('[logos-chat] Activating extension');

  // Initialize agent registry
  const agentRegistry = new AgentRegistry(context);

  // Create chat panel provider
  chatPanelProvider = new ChatPanelProvider(context, agentRegistry);

  // Create thread tree provider
  threadTreeProvider = new ThreadTreeProvider(context);

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'logos.chatPanel',
      chatPanelProvider
    )
  );

  // Register tree provider
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'logos.threadList',
      threadTreeProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('logos.chat.open', () => {
      vscode.commands.executeCommand('logos.chatPanel.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.chat.newThread', () => {
      chatPanelProvider.createNewThread();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.chat.mentionAgent', async () => {
      const agents = agentRegistry.getAll();
      const selected = await vscode.window.showQuickPick(
        agents.map((a) => ({
          label: a.name,
          description: a.description,
          id: a.id,
        })),
        { placeHolder: 'Select an agent to mention' }
      );
      if (selected) {
        chatPanelProvider.insertMention(selected.id);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.chat.branchThread', () => {
      chatPanelProvider.branchCurrentThread();
    })
  );

  // Listen for active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        chatPanelProvider.updateEditorContext(editor);
      }
    })
  );

  // Listen for selection changes
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      chatPanelProvider.updateSelection(event.textEditor, event.selections);
    })
  );

  console.log('[logos-chat] Extension activated');
}

export function deactivate() {
  console.log('[logos-chat] Deactivating extension');
}

