import * as vscode from 'vscode';
import { analyzePrompt, enhancePrompt } from '../promptProcessor';
import { collectContext } from '../services/contextCollector';
import { sendChat, ChatMessage } from '../services/openaiClient';

export class ChatPanel {
    private static current?: ChatPanel;
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private assistantBuffer = '';

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (ChatPanel.current) {
            ChatPanel.current.panel.reveal(column);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'chatPanel',
                'Chat',
                column ?? vscode.ViewColumn.One,
                { enableScripts: true }
            );
            ChatPanel.current = new ChatPanel(panel, extensionUri);
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml(this.panel.webview, extensionUri);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage((m) => this.handleMessage(m), null, this.disposables);
    }

    private getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chat</title>
</head>
<body>
    <div id="messages"></div>
    <form id="form">
        <textarea id="input" rows="3"></textarea>
        <button type="submit">Send</button>
    </form>
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const form = document.getElementById('form');
        const input = document.getElementById('input');
        const messages = document.getElementById('messages');
        let assistantDiv = null;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const value = input.value;
            input.value = '';
            const div = document.createElement('div');
            div.textContent = '> ' + value;
            messages.appendChild(div);
            assistantDiv = document.createElement('div');
            messages.appendChild(assistantDiv);
            vscode.postMessage({ type: 'chat', text: value });
        });

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'response' && assistantDiv) {
                assistantDiv.innerHTML = marked.parse(msg.text);
            }
        });
    </script>
</body>
</html>`;
    }

    private async handleMessage(message: any) {
        if (message.type === 'chat') {
            await this.processChat(message.text);
        }
    }

    private async processChat(input: string) {
        const context = await collectContext();
        const meta = analyzePrompt(input);
        const enhanced = enhancePrompt(meta, context);
        const msgs: ChatMessage[] = [{ role: 'user', content: enhanced }];
        this.assistantBuffer = '';
        try {
            for await (const chunk of sendChat(msgs)) {
                this.assistantBuffer += chunk;
                this.panel.webview.postMessage({ type: 'response', text: this.assistantBuffer });
            }
        } catch (err: any) {
            this.panel.webview.postMessage({ type: 'response', text: `Error: ${err.message}` });
        }
    }

    public dispose() {
        ChatPanel.current = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
