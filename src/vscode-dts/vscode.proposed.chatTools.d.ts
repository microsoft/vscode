/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace lm {
		/**
		 * Register a ChatTool. The tool must also be registered in the package.json `languageModelTools` contribution point.
		 */
		export function registerTool(toolId: string, tool: ChatTool): Disposable;

		/**
		 * A list of all available tools.
		 */
		export const tools: ReadonlyArray<ChatToolDescription>;

		/**
		 * Invoke a tool with the given parameters.
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
		invoke(parameters: any, token: CancellationToken): Thenable<string>;
	}
}
