/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace chat {
		/**
		 * TODO@API also statically registered
		 * TODO@API ?? canBeInvokedExplicitlyByUser: whether the tool shows up in the chat input suggest widget
		 */
		export function registerTool(tool: ChatTool, options: { canBeInvokedExplicitlyByUser: boolean }): Disposable;

		export const tools: ReadonlyArray<ChatToolDescription>;

		/**
		 * For non-chat AI actions to invoke tools arbitrarily
		 * TODO@API is chat namespace right?
		 */
		export function invokeTool(toolId: string, parameters: Object, token: CancellationToken): Thenable<any>;
	}

	export interface ChatToolDescription {
		id: string;
		displayName: string;
		description: string;
		parametersSchema: any; // JSON schema

		// TODO@API Is output only a string, or can it be structured data? Both?
		// Does it stream?
		returnValueSchema: any; // JSON schema
	}

	export interface ChatToolContext {
		prompt: string;
	}

	// Are these just vscode commands with a schema for parameters?
	export interface ChatTool extends ChatToolDescription {
		// TODO@API Does it stream?
		// How does it ask for confirmation? This resolver would get some other resolver/accessor object that lets it ask to render some confirm dialog in chat.
		// Differences from variables: no 'level'
		invoke(parameters: any, context: ChatToolContext, token: CancellationToken): ProviderResult<any>;
	}

	// TODO@API name? "invoker"??
	export interface ChatToolAccessor {
		invokeTool(toolId: string, parameters: Object, token: CancellationToken): Thenable<any>;
	}
}
