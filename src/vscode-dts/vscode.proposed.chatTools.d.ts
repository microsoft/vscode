/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace lm {
		/**
		 * TODO@API Most details are statically registered
		 * TODO@API canBeInvokedExplicitlyByUser: whether the tool shows up in the chat input suggest widget
		 */
		export function registerTool(tool: ChatTool, options: { canBeInvokedExplicitlyByUser: boolean }): Disposable;

		export const tools: ReadonlyArray<ChatToolDescription>;

		/**
		 * For non-chat AI actions to invoke tools arbitrarily
		 */
		export function invokeTool(toolId: string, parameters: Object, token: CancellationToken): Thenable<any>;
	}

	export interface ChatToolDescription {
		id: string;
		displayName: string;
		description: string;
		parametersSchema: JSONSchema; // From lmTools
	}

	export interface ChatTool extends ChatToolDescription {
		// How does it ask for confirmation? This resolver could get some other resolver/accessor object that lets it ask to render some confirm dialog in chat.
		// Or, a tool declares whether it needs confirmation, and vscode will ask for user confirmation before invoking it.
		invoke(parameters: any, token: CancellationToken): ProviderResult<any>;
	}

	// TODO@API name? "invoker"??
	export interface ChatToolAccessor {
		invokeTool(toolId: string, parameters: Object, token: CancellationToken): Thenable<any>;
	}
}
