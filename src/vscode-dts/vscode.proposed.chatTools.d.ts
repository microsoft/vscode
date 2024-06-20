/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface LanguageModelToolResult {
		/**
		 * The result can contain arbitrary representations of the content. An example might be 'prompt-tsx' to indicate an element that can be rendered with the @vscode/prompt-tsx library.
		 */
		[contentType: string]: any;

		string: string;
	}

	export namespace lm {
		/**
		 * Register a LanguageModelTool. The tool must also be registered in the package.json `languageModelTools` contribution point.
		 */
		export function registerTool(toolId: string, tool: LanguageModelTool): Disposable;

		/**
		 * A list of all available tools.
		 */
		export const tools: ReadonlyArray<LanguageModelToolDescription>;

		/**
		 * Invoke a tool with the given parameters.
		 * Could request a set of contentTypes to be returned so they don't all need to be computed.
		 */
		export function invokeTool(toolId: string, parameters: Object, token: CancellationToken): Thenable<LanguageModelToolResult>;
	}

	export interface LanguageModelToolDescription {
		id: string;
		description: string;
		parametersSchema?: JSONSchema;
		displayName?: string;
	}

	export interface LanguageModelTool {
		invoke(parameters: any, token: CancellationToken): Thenable<LanguageModelToolResult>;
	}
}
