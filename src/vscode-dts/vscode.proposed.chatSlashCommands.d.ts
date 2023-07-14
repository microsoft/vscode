/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface SlashCommandContext {

		// messages so far
		history: ChatMessage[];

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
		message: MarkdownString;
		// edits?: TextEdit[] | WorkspaceEdit;
	}

	export interface SlashResult {
		followUp?: InteractiveSessionFollowup[];
	}

	export interface SlashCommand {

		// TODO: Progress vs AsyncIterable
		// CONSUMER of chat
		(chat: ChatResponseProvider, prompt: ChatMessage, context: SlashCommandContext, progress: Progress<SlashResponse>, token: CancellationToken): Thenable<SlashResult>;
	}

	export namespace llm {
		export function registerSlashCommand(name: string, command: SlashCommand): Disposable;
	}
}
