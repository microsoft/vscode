/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// src/extension.ts
import * as vscode from 'vscode';
import { ChatbotProvider } from './providers/chatbotprovider';
import { McpHub } from './services/mcp/mcphub';

export function activate(context: vscode.ExtensionContext) {
	console.log('AI Chatbot extension is now active!');

	// Initialize MCP Hub
	const mcpHub = new McpHub(context);

	// Initialize Chatbot Provider
	const chatbotProvider = new ChatbotProvider(context, mcpHub);

	// Register webview provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'ai-chatbot-view',
			chatbotProvider,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		)
	);

	// Register command
	const openChatCommand = vscode.commands.registerCommand('ai-chatbot.openChat', () => {
		vscode.commands.executeCommand('ai-chatbot-view.focus');
	});

	context.subscriptions.push(openChatCommand);

	// Initialize MCP Hub on startup
	mcpHub.initialize();
}

export function deactivate() {
	console.log('AI Chatbot extension is now deactivated!');
}
