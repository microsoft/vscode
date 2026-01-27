/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	export interface LanguageModelToolDefinition extends LanguageModelToolInformation {
		/**
		 * Display name for the tool.
		 */
		displayName: string;
		/**
		 * Name of the tools that can users can reference in the prompt. If not
		 * provided, the tool will not be able to be referenced. Must not contain whitespace.
		 */
		toolReferenceName?: string;
		/**
		 * Description for the tool shown to the user.
		 */
		userDescription?: string;
		/**
		 * Icon for the tool shown to the user.
		 */
		icon?: IconPath;
		/**
		 * If defined, the tool will only be available for language models that match
		 * the selector.
		 */
		models?: LanguageModelChatSelector[];
		/**
		 * Name of the toolset the tool should be contributed to, as defined in your
		 * extension's `package.json`.
		 */
		toolSet?: string;
	}

	export namespace lm {
		/**
		 * Registers a language model tool along with its definition. Unlike {@link lm.registerTool},
		 * this does not require the tool to be present first in the extension's `package.json` contributions.
		 *
		 * Multiple tools may be registered with the the same name using the API. In any given context,
		 * the most specific tool (based on the {@link LanguageModelToolDefinition.models}) will be used.
		 *
		 * @param definition The definition of the tool to register.
		 * @param tool The implementation of the tool.
		 * @returns A disposable that unregisters the tool when disposed.
		 */
		export function registerToolDefinition<T>(
			definition: LanguageModelToolDefinition,
			tool: LanguageModelTool<T>,
		): Disposable;

		/**
		 * Invoke a tool by its full information object rather than just name.
		 * This allows disambiguation when multiple tools have the same name
		 * (e.g., from different MCP servers or model-specific implementations).
		 *
		 * @param tool The tool information object, typically obtained from {@link lm.tools}.
		 * @param options The options to use when invoking the tool.
		 * @param token A cancellation token.
		 * @returns The result of the tool invocation.
		 */
		export function invokeTool(tool: LanguageModelToolInformation, options: LanguageModelToolInvocationOptions<object>, token?: CancellationToken): Thenable<LanguageModelToolResult>;
	}
}
