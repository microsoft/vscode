/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// TODO - @lramos15 - Issue link

	export interface LanguageModelChat {
		/**
		 * The maximum number of tokens the model can produce in a single response.
		 *
		 * This mirrors the stable {@link LanguageModelChat.maxInputTokens} but for output. It is
		 * provided by the model provider and allows consumers (e.g. other extensions routing
		 * requests through this model) to size requests correctly instead of assuming a default.
		 */
		readonly maxOutputTokens?: number;

		/**
		 * The capabilities of the language model.
		 */
		readonly capabilities: {
			/**
			 * Whether the language model supports tool calling.
			 */
			readonly supportsToolCalling: boolean;
			/**
			 * Whether the language model supports image to text. This means it can take an image as input and produce a text response.
			 */
			readonly supportsImageToText: boolean;

			/**
			 * The tools the model prefers for making file edits. See {@link LanguageModelChatCapabilities.editTools}.
			 */
			readonly editToolsHint?: readonly string[];
		};
	}
}
