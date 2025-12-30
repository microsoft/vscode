/**
 * ChatPanelProvider - Webview provider for chat panel
 */

import * as vscode from 'vscode';
import { AgentRegistry } from './AgentRegistry';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'logos.chatPanel';

  private _view?: vscode.WebviewView;
  private _context: vscode.ExtensionContext;
  private _agentRegistry: AgentRegistry;

  constructor(context: vscode.ExtensionContext, agentRegistry: AgentRegistry) {
    this._context = context;
    this._agentRegistry = agentRegistry;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'out'),
        vscode.Uri.joinPath(this._context.extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this.handleSendMessage(message.content, message.mentions);
          break;
        case 'newThread':
          this.createNewThread();
          break;
        case 'switchThread':
          await this.switchThread(message.threadId);
          break;
        case 'branchThread':
          this.branchCurrentThread(message.messageIndex);
          break;
        case 'getContext':
          await this.sendEditorContext();
          break;
      }
    });

    // Set context for keybindings
    vscode.commands.executeCommand('setContext', 'logos.chatFocused', true);

    webviewView.onDidChangeVisibility(() => {
      vscode.commands.executeCommand(
        'setContext',
        'logos.chatFocused',
        webviewView.visible
      );
    });
  }

  async handleSendMessage(
    content: string,
    mentions: Array<{ agentId: string; agentName: string }>
  ): Promise<void> {
    // Determine which agents to invoke
    const agentIds =
      mentions.length > 0
        ? mentions.map((m) => m.agentId)
        : [vscode.workspace.getConfiguration('logos.chat').get('defaultAgent', 'logos.conductor')];

    // Send user message to webview
    this._view?.webview.postMessage({
      type: 'userMessage',
      content,
      mentions,
    });

    // Invoke each agent
    for (const agentId of agentIds) {
      try {
        const response = await this._agentRegistry.invoke(agentId, content, {
          context: await this.getEditorContext(),
        });

        // Send agent response to webview
        this._view?.webview.postMessage({
          type: 'agentResponse',
          agentId,
          content: response.content,
          tierUsed: response.tierUsed,
          codeBlocks: response.codeBlocks,
        });
      } catch (error) {
        this._view?.webview.postMessage({
          type: 'error',
          agentId,
          message: `Failed to get response from ${agentId}`,
        });
      }
    }
  }

  createNewThread(): void {
    this._view?.webview.postMessage({ type: 'createThread' });
  }

  async switchThread(threadId: string): Promise<void> {
    this._view?.webview.postMessage({ type: 'switchThread', threadId });
  }

  branchCurrentThread(messageIndex?: number): void {
    this._view?.webview.postMessage({ type: 'branchThread', messageIndex });
  }

  insertMention(agentId: string): void {
    const agent = this._agentRegistry.get(agentId);
    if (agent) {
      this._view?.webview.postMessage({
        type: 'insertMention',
        agentId,
        agentName: agent.name,
      });
    }
  }

  updateEditorContext(editor: vscode.TextEditor): void {
    const context = {
      file: editor.document.uri.fsPath,
      language: editor.document.languageId,
      lineCount: editor.document.lineCount,
    };
    this._view?.webview.postMessage({ type: 'editorContext', context });
  }

  updateSelection(
    editor: vscode.TextEditor,
    selections: readonly vscode.Selection[]
  ): void {
    const selection = selections[0];
    if (selection && !selection.isEmpty) {
      const context = {
        file: editor.document.uri.fsPath,
        startLine: selection.start.line + 1,
        endLine: selection.end.line + 1,
        content: editor.document.getText(selection),
      };
      this._view?.webview.postMessage({ type: 'selectionContext', context });
    }
  }

  private async sendEditorContext(): Promise<void> {
    const context = await this.getEditorContext();
    this._view?.webview.postMessage({ type: 'fullContext', context });
  }

  private async getEditorContext(): Promise<any> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return {};

    return {
      openFiles: vscode.window.visibleTextEditors.map((e) => ({
        path: e.document.uri.fsPath,
        language: e.document.languageId,
        lineCount: e.document.lineCount,
        isActive: e === editor,
      })),
      selection: editor.selection.isEmpty
        ? undefined
        : {
            file: editor.document.uri.fsPath,
            startLine: editor.selection.start.line + 1,
            endLine: editor.selection.end.line + 1,
            content: editor.document.getText(editor.selection),
          },
      workspaceId: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'unknown',
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'out', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'media', 'chat.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Logos Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}


