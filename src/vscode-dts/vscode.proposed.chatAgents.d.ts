/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentContext {
		history: ChatMessage[];
	}

	export interface ChatAgentResponse {
		message: MarkdownString | InteractiveProgressFileTree;
	}

	export interface ChatAgentResult {
		followUp?: InteractiveSessionFollowup[];
	}

	export interface ChatAgentCommand {
		name: string;
		description: string;
	}

	export interface ChatAgentMetadata {
		description: string;
		fullName?: string;
		icon?: Uri;
		subCommands: ChatAgentCommand[];
	}

	export interface ChatAgent {
		(prompt: ChatMessage, context: ChatAgentContext, progress: Progress<ChatAgentResponse>, token: CancellationToken): Thenable<ChatAgentResult | void>;
	}

	export namespace chat {
		export function registerAgent(id: string, agent: ChatAgent, metadata: ChatAgentMetadata): Disposable;
	}
}
