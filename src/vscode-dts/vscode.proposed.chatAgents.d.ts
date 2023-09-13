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
		subCommands: ChatAgentCommand[];
		requireCommand?: boolean; // Do some agents not have a default action?
		isImplicit?: boolean; // Only @workspace. slash commands get promoted to the top-level and this agent is invoked when those are used
	}

	export interface ChatAgent {
		(prompt: ChatMessage, context: ChatAgentContext, progress: Progress<ChatAgentResponse>, token: CancellationToken): Thenable<ChatAgentResult | void>;
	}

	export namespace chat {
		export function registerAgent(name: string, agent: ChatAgent, metadata: ChatAgentMetadata): Disposable;
	}
}
