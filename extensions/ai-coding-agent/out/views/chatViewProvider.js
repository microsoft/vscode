"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class ChatViewProvider {
    constructor(_extensionUri, geminiService) {
        this._extensionUri = _extensionUri;
        this.geminiService = geminiService;
        this.chatHistory = [];
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.message);
                    break;
                case 'clearChat':
                    this.chatHistory = [];
                    break;
            }
        });
    }
    async handleUserMessage(message) {
        if (!this._view) {
            return;
        }
        // Add user message to history
        this.chatHistory.push({ role: 'user', content: message });
        // Show user message in UI
        this._view.webview.postMessage({
            type: 'userMessage',
            message: message
        });
        // Get context from active editor
        const editor = vscode.window.activeTextEditor;
        let context = '';
        if (editor) {
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);
            if (selectedText) {
                context = `Current file: ${editor.document.fileName}\nLanguage: ${editor.document.languageId}\nSelected code:\n${selectedText}`;
            }
            else {
                context = `Current file: ${editor.document.fileName}\nLanguage: ${editor.document.languageId}`;
            }
        }
        try {
            // Get AI response
            const response = await this.geminiService.chat(message, context);
            // Add assistant message to history
            this.chatHistory.push({ role: 'assistant', content: response });
            // Show assistant message in UI
            this._view.webview.postMessage({
                type: 'assistantMessage',
                message: response
            });
        }
        catch (error) {
            this._view.webview.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            });
        }
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>AI Coding Agent</title>
	<style>
		body {
			padding: 0;
			margin: 0;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
		
		#chat-container {
			display: flex;
			flex-direction: column;
			height: 100vh;
		}
		
		#messages {
			flex: 1;
			overflow-y: auto;
			padding: 10px;
		}
		
		.message {
			margin-bottom: 15px;
			padding: 10px;
			border-radius: 5px;
		}
		
		.user-message {
			background-color: var(--vscode-input-background);
			border-left: 3px solid var(--vscode-button-background);
		}
		
		.assistant-message {
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			border-left: 3px solid var(--vscode-charts-green);
		}
		
		.error-message {
			background-color: var(--vscode-inputValidation-errorBackground);
			border-left: 3px solid var(--vscode-inputValidation-errorBorder);
		}
		
		.message-label {
			font-weight: bold;
			margin-bottom: 5px;
			font-size: 0.9em;
		}
		
		.message-content {
			white-space: pre-wrap;
			word-wrap: break-word;
		}
		
		#input-container {
			display: flex;
			padding: 10px;
			border-top: 1px solid var(--vscode-panel-border);
			background-color: var(--vscode-editor-background);
		}
		
		#message-input {
			flex: 1;
			padding: 8px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 3px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
		}
		
		#send-button {
			margin-left: 5px;
			padding: 8px 15px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 3px;
			cursor: pointer;
			font-family: var(--vscode-font-family);
		}
		
		#send-button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		#clear-button {
			margin-left: 5px;
			padding: 8px 15px;
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			border-radius: 3px;
			cursor: pointer;
			font-family: var(--vscode-font-family);
		}
		
		#clear-button:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		
		code {
			background-color: var(--vscode-textCodeBlock-background);
			padding: 2px 4px;
			border-radius: 3px;
			font-family: var(--vscode-editor-font-family);
		}
		
		pre {
			background-color: var(--vscode-textCodeBlock-background);
			padding: 10px;
			border-radius: 5px;
			overflow-x: auto;
		}
		
		pre code {
			padding: 0;
		}
	</style>
</head>
<body>
	<div id="chat-container">
		<div id="messages"></div>
		<div id="input-container">
			<input type="text" id="message-input" placeholder="Ask me anything about your code..." />
			<button id="send-button">Send</button>
			<button id="clear-button">Clear</button>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const messagesDiv = document.getElementById('messages');
		const messageInput = document.getElementById('message-input');
		const sendButton = document.getElementById('send-button');
		const clearButton = document.getElementById('clear-button');

		function addMessage(role, content) {
			const messageDiv = document.createElement('div');
			messageDiv.className = 'message ' + (role === 'user' ? 'user-message' : role === 'error' ? 'error-message' : 'assistant-message');
			
			const labelDiv = document.createElement('div');
			labelDiv.className = 'message-label';
			labelDiv.textContent = role === 'user' ? 'You' : role === 'error' ? 'Error' : 'AI Assistant';
			
			const contentDiv = document.createElement('div');
			contentDiv.className = 'message-content';
			contentDiv.textContent = content;
			
			messageDiv.appendChild(labelDiv);
			messageDiv.appendChild(contentDiv);
			messagesDiv.appendChild(messageDiv);
			
			// Scroll to bottom
			messagesDiv.scrollTop = messagesDiv.scrollHeight;
		}

		function sendMessage() {
			const message = messageInput.value.trim();
			if (message) {
				vscode.postMessage({
					type: 'sendMessage',
					message: message
				});
				messageInput.value = '';
			}
		}

		sendButton.addEventListener('click', sendMessage);
		
		messageInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				sendMessage();
			}
		});

		clearButton.addEventListener('click', () => {
			messagesDiv.innerHTML = '';
			vscode.postMessage({ type: 'clearChat' });
		});

		// Handle messages from the extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'userMessage':
					addMessage('user', message.message);
					break;
				case 'assistantMessage':
					addMessage('assistant', message.message);
					break;
				case 'error':
					addMessage('error', message.message);
					break;
			}
		});
	</script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
//# sourceMappingURL=chatViewProvider.js.map