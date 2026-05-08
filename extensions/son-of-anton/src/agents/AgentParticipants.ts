/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentStack } from 'son-of-anton-core/agents/AgentStackFactory';

/**
 * Registers VS Code chat participants for every agent in the supplied stack.
 * The stack is built externally (see `createAgentStack`) and shared with any
 * other surface that needs to drive agents (e.g. the WebView sidebar via
 * `AgentBridge`) so we never duplicate specialist instances.
 */
export function registerAgentParticipants(
	context: vscode.ExtensionContext,
	stack: AgentStack,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	for (const { config, agent } of stack.registrations) {
		const participant = vscode.chat.createChatParticipant(
			`sota.${config.handle}`,
			(request, chatContext, stream, token) =>
				agent.handleChatRequest(request, chatContext, stream, token),
		);

		participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.svg');

		disposables.push(participant);
	}

	// Command to record project memory — this UI lives alongside the chat
	// participants because the user-facing flow (record a decision/convention)
	// is conceptually a chat-adjacent action, not a core agent capability.
	disposables.push(
		vscode.commands.registerCommand('sota.recordMemory', async () => {
			const category = await vscode.window.showQuickPick(
				['decision', 'convention', 'warning', 'context'],
				{ placeHolder: 'Memory category' },
			);
			if (!category) {
				return;
			}

			const content = await vscode.window.showInputBox({
				prompt: 'What should be remembered?',
				placeHolder: 'Enter the memory content...',
			});
			if (!content) {
				return;
			}

			await stack.projectMemory.recordMemory({
				category: category as 'decision' | 'convention' | 'warning' | 'context',
				content,
				source: 'user',
			});

			vscode.window.showInformationMessage('Memory recorded.');
		}),
	);

	return disposables;
}
