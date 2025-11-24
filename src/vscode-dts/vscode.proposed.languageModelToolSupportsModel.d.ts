/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface LanguageModelTool<T> {
		/**
		 * Called to check if this tool supports a specific language model. If this method is not implemented,
		 * the tool is assumed to support all models.
		 *
		 * This method allows extensions to dynamically determine which models a tool can work with,
		 * enabling fine-grained control over tool availability based on model capabilities.
		 *
		 * @param modelId The identifier of the language model (e.g., 'gpt-4o', 'claude-3-5-sonnet')
		 * @returns `true` if the tool supports the given model, `false` otherwise
		 */
		supportsModel?(modelId: string): Thenable<boolean>;
	}
}
