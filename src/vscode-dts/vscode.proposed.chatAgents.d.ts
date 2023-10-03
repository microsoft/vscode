/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatAgentContext {

		// messages so far
		history: ChatMessage[]; // Should be same type as request

		// TODO: access to embeddings
		// embeddings: {};

		// TODO: access to "InputSourceId"
		// DebugConsoleOutput
		// Terminal
		// CorrespondingTestFile
		// CorrespondingImplementationFile
		// ExtensionApi
		// VSCode
		// Workspace
	}

	export interface SlashResponse {
		message: MarkdownString | InteractiveProgressFileTree;
		// edits?: TextEdit[] | WorkspaceEdit;
	}

	export interface SlashResult {
		// Should be able to compute these async, because they typically will involve a separate LLM call.
		// That can be a separate call (provideFollowups) or ChatAgentResult contains a promise to it (so ChatAgent returns a promise to a promise).
		// Or, we can just be ok with the UI showing that the response is still continuing when the actual response is done but the followups are being computed.
		followUp?: InteractiveSessionFollowup[];
	}

	export interface SlashCommandMetadata {
		description: string;
	}

	export interface SlashCommand {
		readonly name: string;
		readonly metadata: SlashCommandMetadata;
		invoke(request: InteractiveRequest, context: ChatAgentContext, progress: Progress<SlashResponse>, token: CancellationToken): Thenable<SlashResult | void>;
	}

	interface ChatAgent {
		slashCommands: SlashCommand[];
		onDidPerformAction: Event<{ sessionId: string; responseId: string; action: InteractiveSessionUserAction }>;
		dispose(): void;
	}

	export interface ChatAgentMetadata {
		description: string;
		fullName?: string;
		icon?: Uri;
	}

	export type ChatAgentHandler = (request: InteractiveRequest, context: ChatAgentContext, progress: Progress<InteractiveProgress>, token: CancellationToken) => ProviderResult<InteractiveResponseForProgress>;

	export namespace chat {
		// Invoking slash commands vs the agent with no slash command?
		// Could be a separate handler or a slash command with a '' id
		export function createChatAgent(id: string, description: string, fullName?: string, icon?: Uri, defaultHandler?: ChatAgentHandler): ChatAgent;
	}
}
