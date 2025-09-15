/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	/**
	 * A language model response part containing thinking/reasoning content.
	 * Thinking tokens represent the model's internal reasoning process that
	 * typically streams before the final response.
	 */
	export class LanguageModelThinkingPart {
		/**
		 * The thinking/reasoning text content.
		 */
		value: string | string[];

		/**
		 * Optional unique identifier for this thinking sequence.
		 * This ID is typically provided at the end of the thinking stream
		 * and can be used for retrieval or reference purposes.
		 */
		id?: string;

		/**
		 * Optional metadata associated with this thinking sequence.
		 */
		metadata?: { readonly [key: string]: any };

		/**
		 * Construct a thinking part with the given content.
		 * @param value The thinking text content.
		 * @param id Optional unique identifier for this thinking sequence.
		 * @param metadata Optional metadata associated with this thinking sequence.
		 */
		constructor(value: string | string[], id?: string, metadata?: { readonly [key: string]: any });
	}

	export interface LanguageModelChatResponse {
		/**
		 * An async iterable that is a stream of text, thinking, and tool-call parts forming the overall response.
		 * This includes {@link LanguageModelThinkingPart} which represents the model's internal reasoning process.
		 */
		stream: AsyncIterable<LanguageModelTextPart | LanguageModelThinkingPart | LanguageModelToolCallPart | unknown>;
	}
}
