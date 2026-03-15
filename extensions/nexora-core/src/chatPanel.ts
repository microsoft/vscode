import * as vscode from 'vscode';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'nexora.chatPanel';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent();

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(data => {
            if (data.type === 'sendMessage') {
                this._handleUserMessage(data.message);
            }
        });
    }

    private _handleUserMessage(message: string) {
        // Echo response for now - backend integration in Week 3
        const response = `Received: "${message}"\n\n[Backend integration coming in Week 3]`;
        
        if (this._view) {
            this._view.webview.postMessage({
                type: 'addMessage',
                role: 'assistant',
                content: response
            });
        }
    }

    private _getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .messages {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }
        .message {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 6px;
        }
        .user {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .assistant {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
        }
        .input-area {
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
        }
        input {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
        }
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .welcome {
            text-align: center;
            padding: 20px;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="messages" id="messages">
        <div class="welcome">
            <p><strong>Nexora AI</strong></p>
            <p>Describe what you want to build.</p>
        </div>
    </div>
    <div class="input-area">
        <input type="text" id="input" placeholder="Type your message..." />
        <button id="send">Send</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const messages = document.getElementById('messages');
        const input = document.getElementById('input');
        const send = document.getElementById('send');

        function addMessage(role, content) {
            const welcome = messages.querySelector('.welcome');
            if (welcome) welcome.remove();
            
            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.textContent = content;
            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
        }

        function sendMessage() {
            const text = input.value.trim();
            if (!text) return;
            addMessage('user', text);
            vscode.postMessage({ type: 'sendMessage', message: text });
            input.value = '';
        }

        send.onclick = sendMessage;
        input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

        window.addEventListener('message', e => {
            if (e.data.type === 'addMessage') {
                addMessage(e.data.role, e.data.content);
            }
        });
    </script>
</body>
</html>`;
    }
}
