/**
 * Logos Chat Extension - Multi-agent conversation for Logos IDE
 */

import * as vscode from 'vscode';
import { ChatPanelProvider } from './ChatPanelProvider';
import { ThreadTreeProvider } from './ThreadTreeProvider';
import { AgentRegistry } from './AgentRegistry';

let chatPanelProvider: ChatPanelProvider;
let threadTreeProvider: ThreadTreeProvider;

/**
 * Aria mode definitions for keyboard shortcuts
 */
type AriaModeId = 'agent' | 'plan' | 'debug' | 'ask' | 'research' | 'code_review';

const MODE_INFO: Record<AriaModeId, { name: string; description: string }> = {
  agent: { name: 'Agent', description: 'Full agentic execution with all tools' },
  plan: { name: 'Plan', description: 'Planning mode - analyze and create plans' },
  debug: { name: 'Debug', description: 'Debugging assistance' },
  ask: { name: 'Ask', description: 'Q&A mode - no side effects' },
  research: { name: 'Research', description: 'Deep research via Athena' },
  code_review: { name: 'Code Review', description: 'Code analysis and suggestions' },
};

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

  // =========================================================================
  // Mode Switching Commands
  // =========================================================================

  // Generic mode switcher
  const switchMode = async (modeId: AriaModeId) => {
    const modeInfo = MODE_INFO[modeId];
    chatPanelProvider.switchMode(modeId);
    vscode.window.setStatusBarMessage(`Aria Mode: ${modeInfo.name}`, 3000);
  };

  // Register mode switching commands
  context.subscriptions.push(
    vscode.commands.registerCommand('logos.mode.agent', () => switchMode('agent'))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.mode.plan', () => switchMode('plan'))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.mode.debug', () => switchMode('debug'))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.mode.ask', () => switchMode('ask'))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.mode.research', () => switchMode('research'))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.mode.code_review', () => switchMode('code_review'))
  );

  // Mode picker command (alternative to keyboard shortcuts)
  context.subscriptions.push(
    vscode.commands.registerCommand('logos.mode.pick', async () => {
      const modes = Object.entries(MODE_INFO).map(([id, info]) => ({
        label: info.name,
        description: info.description,
        id: id as AriaModeId,
      }));

      const selected = await vscode.window.showQuickPick(modes, {
        placeHolder: 'Select Aria Mode',
        matchOnDescription: true,
      });

      if (selected) {
        switchMode(selected.id);
      }
    })
  );

  // =========================================================================
  // Plan Commands
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.plan.create', () => {
      // Switch to Plan mode and focus input
      switchMode('plan');
      chatPanelProvider.focusInput();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.plan.execute', () => {
      chatPanelProvider.executeActivePlan();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.plan.pause', () => {
      chatPanelProvider.pausePlanExecution();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.plan.resume', () => {
      chatPanelProvider.resumePlanExecution();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.plan.cancel', () => {
      chatPanelProvider.cancelPlanExecution();
    })
  );

  // =========================================================================
  // Tool Commands
  // =========================================================================

  context.subscriptions.push(
    vscode.commands.registerCommand('logos.tools.list', async () => {
      const tools = chatPanelProvider.getAvailableTools();
      const toolList = tools.map(t => `${t.icon || '🔧'} ${t.name}: ${t.description}`).join('\n');
      
      const doc = await vscode.workspace.openTextDocument({
        content: `# Available Aria Tools\n\n${toolList}`,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    })
  );

  // =========================================================================
  // Editor Context Commands
  // =========================================================================

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
