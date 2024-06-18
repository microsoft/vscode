/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace lm {
		export function registerTool(id: string, tool: ChatTool): Disposable;

		export const tools: ReadonlyArray<ChatToolDescription>;

		/**
		 * For non-chat AI actions to invoke tools arbitrarily
		 */
		export function invokeTool(toolId: string, parameters: Object, token: CancellationToken): Thenable<string>;
	}

	export interface ChatToolDescription {
		id: string;
		description: string;
		parametersSchema?: JSONSchema;
		displayName?: string;
	}

	export interface ChatTool {
		invoke(parameters: any, token: CancellationToken): ProviderResult<string>;
	}
}
