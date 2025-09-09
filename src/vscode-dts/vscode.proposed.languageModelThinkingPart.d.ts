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

	export interface LanguageModelChat {
		sendRequest(messages: Array<LanguageModelChatMessage | LanguageModelChatMessage2>, options?: LanguageModelChatRequestOptions, token?: CancellationToken): Thenable<LanguageModelChatResponse>;
		countTokens(text: string | LanguageModelChatMessage | LanguageModelChatMessage2, token?: CancellationToken): Thenable<number>;
	}

	/**
	 * Represents a message in a chat. Can assume different roles, like user or assistant.
	 */
	export class LanguageModelChatMessage2 {

		/**
		 * Utility to create a new user message.
		 *
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		static User(content: string | Array<LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelDataPart>, name?: string): LanguageModelChatMessage2;

		/**
		 * Utility to create a new assistant message.
		 *
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		static Assistant(content: string | Array<LanguageModelTextPart | LanguageModelToolCallPart | LanguageModelDataPart>, name?: string): LanguageModelChatMessage2;

		/**
		 * The role of this message.
		 */
		role: LanguageModelChatMessageRole;

		/**
		 * A string or heterogeneous array of things that a message can contain as content. Some parts may be message-type
		 * specific for some models.
		 */
		content: Array<LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart>;

		/**
		 * The optional name of a user for this message.
		 */
		name: string | undefined;

		/**
		 * Create a new user message.
		 *
		 * @param role The role of the message.
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		constructor(role: LanguageModelChatMessageRole, content: string | Array<LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart>, name?: string);
	}

	/**
	 * Temporary alias for LanguageModelToolResultPart to avoid breaking changes in chat.
	 */
	export class LanguageModelToolResultPart2 extends LanguageModelToolResultPart { }

	/**
	 * Temporary alias for LanguageModelToolResult to avoid breaking changes in chat.
	 */
	export class LanguageModelToolResult2 extends LanguageModelToolResult { }
}
