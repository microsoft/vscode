/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ChatPanel } from './chat/ChatPanel';
import { InlineEditProvider } from './inline/InlineEdit';
import { CompletionProvider } from './inline/CompletionProvider';
import { AgentStatusProvider } from './sidebar/AgentStatusProvider';
import { TaskQueueProvider } from './sidebar/TaskQueueProvider';
import { TraceViewerPanel } from './trace/TraceViewerPanel';
import { LlmClient } from './llm/LlmClient';
import { AgentManager } from './agents/AgentManager';
import { McpClient } from './mcp/McpClient';
import { StatusBarManager } from './sidebar/StatusBarManager';
import { registerAgentParticipants } from './agents/AgentParticipants';

export function activate(context: vscode.ExtensionContext): void {
	const llmClient = new LlmClient(context);
	const mcpClient = new McpClient();
	const agentManager = new AgentManager(llmClient);
	const agentStatusProvider = new AgentStatusProvider(agentManager);
	const taskQueueProvider = new TaskQueueProvider(agentManager);
	const statusBarManager = new StatusBarManager(agentManager);

	// Register multi-agent chat participants
	const agentDisposables = registerAgentParticipants(
		context, llmClient, mcpClient, agentManager,
	);
	context.subscriptions.push(...agentDisposables);

	// Chat Panel
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.openChat', () => {
			ChatPanel.createOrShow(context, llmClient);
		})
	);

	// Clear Chat
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.clearChat', () => {
			ChatPanel.clearConversation(context);
		})
	);

	// Inline Edit (Cmd+K / Ctrl+K)
	const inlineEditProvider = new InlineEditProvider(llmClient);
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.inlineEdit', () => {
			inlineEditProvider.provideInlineEdit();
		})
	);

	// Inline Completions
	const completionProvider = new CompletionProvider(llmClient);
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider(
			{ pattern: '**' },
			completionProvider
		)
	);

	// Agent Status Sidebar
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('sota.agentStatus', agentStatusProvider)
	);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('sota.taskQueue', taskQueueProvider)
	);

	// Trace Viewer
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.showTraces', () => {
			TraceViewerPanel.createOrShow(context, agentManager);
		})
	);

	// Status bar
	context.subscriptions.push(statusBarManager);

	// Refresh commands for tree views
	context.subscriptions.push(
		vscode.commands.registerCommand('sota.refreshAgentStatus', () => {
			agentStatusProvider.refresh();
		})
	);
}

export function deactivate(): void {
	// Cleanup handled by disposables
}
