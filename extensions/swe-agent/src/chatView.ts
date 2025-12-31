/**
 * SWE Agent Chat View Provider
 *
 * Provides the chat interface for interacting with SWE D3N models.
 */

import * as vscode from 'vscode';

export class SWEChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sweAgent.chatView';

    private _view?: vscode.WebviewView;
    private _messages: Array<{role: string; content: string; model?: string}> = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _sweAgent: any
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this._handleSendMessage(data.message);
                    break;
                case 'selectModel':
                    await this._handleSelectModel(data.model);
                    break;
                case 'clearHistory':
                    this._messages = [];
                    this._updateMessages();
                    break;
            }
        });
    }

    private async _handleSendMessage(message: string) {
        // Add user message
        this._messages.push({ role: 'user', content: message });
        this._updateMessages();

        try {
            // Get current editor context
            const editor = vscode.window.activeTextEditor;
            const context = editor ? {
                code: editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection),
                language: editor.document.languageId,
                filename: editor.document.fileName,
            } : {};

            // Send to SWE Agent
            const response = await this._sweAgent.generate({
                instruction: message,
                ...context,
            });

            // Add assistant message
            this._messages.push({
                role: 'assistant',
                content: response.result,
                model: response.model_used,
            });
            this._updateMessages();

        } catch (error: any) {
            this._messages.push({
                role: 'error',
                content: `Error: ${error.message}`,
            });
            this._updateMessages();
        }
    }

    private async _handleSelectModel(model: string) {
        this._sweAgent.setPreferredModel(model);
    }

    private _updateMessages() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this._messages,
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SWE Agent Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }

        .header {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .header select {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 4px;
        }

        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }

        .message {
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 85%;
        }

        .message.user {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: auto;
        }

        .message.assistant {
            background: var(--vscode-editor-inactiveSelectionBackground);
        }

        .message.error {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }

        .message .model-tag {
            font-size: 0.75em;
            opacity: 0.7;
            margin-top: 4px;
        }

        .message pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
        }

        .input-area {
            padding: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }

        .input-area textarea {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            border-radius: 4px;
            resize: none;
            font-family: var(--vscode-font-family);
            min-height: 40px;
            max-height: 120px;
        }

        .input-area button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
        }

        .input-area button:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        <span>Model:</span>
        <select id="modelSelect">
            <option value="auto">Auto (Smart Routing)</option>
            <option value="codex-01">Codex-01 (Code Gen)</option>
            <option value="debug-01">Debug-01 (Bug Fix)</option>
            <option value="review-01">Review-01 (Review)</option>
            <option value="test-01">Test-01 (Tests)</option>
            <option value="sql-01">SQL-01 (SQL)</option>
        </select>
        <button id="clearBtn" title="Clear history">🗑️</button>
    </div>

    <div class="messages" id="messages"></div>

    <div class="input-area">
        <textarea id="input" placeholder="Ask about code, request changes, or describe what you need..." rows="2"></textarea>
        <button id="sendBtn">Send</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesEl = document.getElementById('messages');
        const inputEl = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
        const modelSelect = document.getElementById('modelSelect');
        const clearBtn = document.getElementById('clearBtn');

        function renderMessages(messages) {
            messagesEl.innerHTML = messages.map(msg => {
                const content = msg.content
                    .replace(/\`\`\`(\\w*)?\\n([\\s\\S]*?)\`\`\`/g, '<pre>$2</pre>')
                    .replace(/\`([^\`]+)\`/g, '<code>$1</code>');

                let html = '<div class="message ' + msg.role + '">' + content;
                if (msg.model) {
                    html += '<div class="model-tag">via ' + msg.model + '</div>';
                }
                html += '</div>';
                return html;
            }).join('');

            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function sendMessage() {
            const message = inputEl.value.trim();
            if (!message) return;

            vscode.postMessage({ type: 'sendMessage', message });
            inputEl.value = '';
        }

        sendBtn.addEventListener('click', sendMessage);

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        modelSelect.addEventListener('change', () => {
            vscode.postMessage({ type: 'selectModel', model: modelSelect.value });
        });

        clearBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearHistory' });
        });

        window.addEventListener('message', (event) => {
            const data = event.data;
            if (data.type === 'updateMessages') {
                renderMessages(data.messages);
            }
        });
    </script>
</body>
</html>`;
    }
}


