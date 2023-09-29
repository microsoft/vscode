/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentContext {
		sessionId: string;
		history: ChatMessage[];
	}

	export interface ChatAgentResponse {
		message: MarkdownString | InteractiveProgressFileTree;
	}

	export interface ChatAgentResult {
		// Should be able to compute these async, because they typically will involve a separate LLM call.
		// That can be a separate call (provideFollowups) or ChatAgentResult contains a promise to it (so ChatAgent returns a promise to a promise).
		// Or, we can just be ok with the UI showing that the response is still continuing when the actual response is done but the followups are being computed.
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
		// These need to be able to change- the whole agent can be unregistered and reregistered with different commands.
		subCommands: ChatAgentCommand[];
	}

	export interface ChatAgent {
		// Make this a named method in case we have to add other methods.
		// eg seems like a gap that there is nothing like `prepareSession` on the agent
		(prompt: ChatMessage, context: ChatAgentContext, progress: Progress<ChatAgentResponse>, token: CancellationToken): Thenable<ChatAgentResult | void>;
	}

	export namespace chat {
		export function registerAgent(id: string, agent: ChatAgent, metadata: ChatAgentMetadata): Disposable;
	}
}
