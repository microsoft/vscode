/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// src/providers/ChatbotProvider.ts
import * as vscode from 'vscode';
import { OpenAI } from 'openai';
import { McpHub } from '../services/mcp/mcphub'; // Fixed import path casing

interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}

export class ChatbotProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private messages: ChatMessage[] = [];
	private openai: OpenAI;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly mcpHub: McpHub
	) {
		// Initialize OpenAI with your API key
		this.openai = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY || '', // Use environment variable or replace with your key
		});
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri]
		};

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		// Handle messages from webview
		webviewView.webview.onDidReceiveMessage(
			async (data) => {
				switch (data.type) {
					case 'userMessage':
						await this.handleUserMessage(data.message);
						break;
					case 'clearChat':
						this.clearChat();
						break;
				}
			},
			undefined,
			this.context.subscriptions
		);
	}

	private async handleUserMessage(message: string) {
		// Add user message to chat
		this.addMessage('user', message);

		try {
			// Get system prompt with MCP tools
			const systemPrompt = await this.buildSystemPrompt();

			// Prepare messages for OpenAI
			const openaiMessages = [
				{ role: 'system' as const, content: systemPrompt },
				...this.messages.map(msg => ({
					role: msg.role as 'user' | 'assistant',
					content: msg.content
				}))
			];

			// Call OpenAI API
			const response = await this.openai.chat.completions.create({
				model: 'gpt-4.1-mini',
				messages: openaiMessages,
				temperature: 0.7,
				max_tokens: 2000,
			});

			const aiResponse = response.choices[0]?.message?.content || 'No response';

			// Check if AI wants to use MCP tools
			const mcpToolCall = this.extractMcpToolCall(aiResponse);
			if (mcpToolCall) {
				const toolResult = await this.executeMcpTool(mcpToolCall);

				// Send tool result back to AI
				const followUpMessages = [
					...openaiMessages,
					{ role: 'assistant' as const, content: aiResponse },
					{ role: 'user' as const, content: `Tool result: ${toolResult}` }
				];

				const followUpResponse = await this.openai.chat.completions.create({
					model: 'gpt-4.1-mini',
					messages: followUpMessages,
					temperature: 0.7,
					max_tokens: 2000,
				});

				const finalResponse = followUpResponse.choices[0]?.message?.content || toolResult;
				this.addMessage('assistant', finalResponse);
			} else {
				this.addMessage('assistant', aiResponse);
			}

		} catch (error) {
			console.error('Error handling user message:', error);
			this.addMessage('assistant', 'Sorry, I encountered an error processing your message.');
		}
	}

	private async buildSystemPrompt(): Promise<string> {
		const servers = await this.mcpHub.getServers();

		let systemPrompt = `You are a helpful AI assistant integrated into VS Code. You can help with coding, answer questions, and use external tools when needed.

Available MCP Tools:
`;

		for (const server of servers) {
			if (server.status === 'connected' && server.tools && server.tools.length > 0) {
				systemPrompt += `\nServer: ${server.name}\n`;
				for (const tool of server.tools) {
					systemPrompt += `- ${tool.name}: ${tool.description}\n`;
					if (tool.inputSchema) {
						systemPrompt += `  Parameters: ${JSON.stringify(tool.inputSchema)}\n`;
					}
				}
			}
		}

		systemPrompt += `\nTo use an MCP tool, respond with:
<use_mcp_tool>
<server_name>server-name</server_name>
<tool_name>tool-name</tool_name>
<tool_arguments>
{
  "param1": "value1",
  "param2": "value2"
}
</tool_arguments>
</use_mcp_tool>

Be helpful and use the appropriate tools when needed.`;

		return systemPrompt;
	}

	private extractMcpToolCall(response: string): any {
		const match = response.match(/<use_mcp_tool>(.*?)<\/use_mcp_tool>/s);
		if (!match) return null;

		const toolCall = match[1];
		const serverMatch = toolCall.match(/<server_name>(.*?)<\/server_name>/s);
		const toolMatch = toolCall.match(/<tool_name>(.*?)<\/tool_name>/s);
		const argsMatch = toolCall.match(/<tool_arguments>(.*?)<\/tool_arguments>/s);

		if (!serverMatch || !toolMatch) return null;

		return {
			serverName: serverMatch[1].trim(),
			toolName: toolMatch[1].trim(),
			arguments: argsMatch ? JSON.parse(argsMatch[1].trim()) : {}
		};
	}

	private async executeMcpTool(toolCall: any): Promise<string> {
		try {
			const result = await this.mcpHub.callTool(
				toolCall.serverName,
				toolCall.toolName,
				toolCall.arguments
			);
			return JSON.stringify(result, null, 2);
		} catch (error) {
			return `Error executing tool: ${error}`;
		}
	}

	private addMessage(role: 'user' | 'assistant', content: string) {
		const message: ChatMessage = {
			role,
			content,
			timestamp: Date.now()
		};

		this.messages.push(message);
		this.updateWebview();
	}

	private clearChat() {
		this.messages = [];
		this.updateWebview();
	}

	private updateWebview() {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'updateMessages',
				messages: this.messages
			});
		}
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Chatbot</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 10px;
        }

        .message {
            margin-bottom: 15px;
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 80%;
        }

        .user-message {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: auto;
        }

        .assistant-message {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
        }

        .input-container {
            display: flex;
            gap: 5px;
        }

        .message-input {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
        }

        .send-button, .clear-button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .send-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .clear-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .send-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .timestamp {
            font-size: 10px;
            opacity: 0.7;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="chat-container" id="chatContainer">
        <div class="message assistant-message">
            <div>Hello! I'm your AI assistant. How can I help you today?</div>
        </div>
    </div>

    <div class="input-container">
        <input type="text" class="message-input" id="messageInput" placeholder="Type your message...">
        <button class="send-button" id="sendButton">Send</button>
        <button class="clear-button" id="clearButton">Clear</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const clearButton = document.getElementById('clearButton');

        function sendMessage() {
            const message = messageInput.value.trim();
            if (message) {
                vscode.postMessage({
                    type: 'userMessage',
                    message: message
                });
                messageInput.value = '';
            }
        }

        function clearChat() {
            vscode.postMessage({
                type: 'clearChat'
            });
        }

        function formatTime(timestamp) {
            return new Date(timestamp).toLocaleTimeString();
        }

        function updateMessages(messages) {
            chatContainer.innerHTML = '';
            messages.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.className = \`message \${msg.role}-message\`;
                messageDiv.innerHTML = \`
                    <div>\${msg.content}</div>
                    <div class="timestamp">\${formatTime(msg.timestamp)}</div>
                \`;
                chatContainer.appendChild(messageDiv);
            });
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        sendButton.addEventListener('click', sendMessage);
        clearButton.addEventListener('click', clearChat);

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'updateMessages') {
                updateMessages(message.messages);
            }
        });
    </script>
</body>
</html>`;
	}
}
