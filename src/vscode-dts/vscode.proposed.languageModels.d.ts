/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Represents a language model response.
	 *
	 * @see {@link LanguageModelAccess.chatRequest}
	 */
	export interface LanguageModelChatResponse {

		/**
		 * An async iterable that is a stream of text chunks forming the overall response.
		 *
		 * *Note* that this stream will error when during receiving an error occurrs.
		 */
		stream: AsyncIterable<string>;
	}

	/**
	 * A language model message that represents a system message.
	 *
	 * System messages provide instructions to the language model that define the context in
	 * which user messages are interpreted.
	 *
	 * *Note* that a language model may choose to add additional system messages to the ones
	 * provided by extensions.
	 */
	export class LanguageModelChatSystemMessage {

		/**
		 * The content of this message.
		 */
		content: string;

		/**
		 * Create a new system message.
		 *
		 * @param content The content of the message.
		 */
		constructor(content: string);
	}

	/**
	 * A language model message that represents a user message.
	 */
	export class LanguageModelChatUserMessage {

		/**
		 * The content of this message.
		 */
		content: string;

		/**
		 * The optional name of a user for this message.
		 */
		name: string | undefined;

		/**
		 * Create a new user message.
		 *
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		constructor(content: string, name?: string);
	}

	/**
	 * A language model message that represents an assistant message, usually in response to a user message
	 * or as a sample response/reply-pair.
	 */
	export class LanguageModelChatAssistantMessage {

		/**
		 * The content of this message.
		 */
		content: string;

		/**
		 * Create a new assistant message.
		 *
		 * @param content The content of the message.
		 */
		constructor(content: string);
	}

	export type LanguageModelChatMessage = LanguageModelChatSystemMessage | LanguageModelChatUserMessage | LanguageModelChatAssistantMessage;


	/**
	 * An event describing the change in the set of available language models.
	 */
	export interface LanguageModelChangeEvent {
		/**
		 * Added language models.
		 */
		readonly added: readonly string[];
		/**
		 * Removed language models.
		 */
		readonly removed: readonly string[];
	}

	/**
	 * Options for making a chat request using a language model.
	 *
	 * @see {@link lm.chatRequest}
	 */
	export interface LanguageModelChatRequestOptions {

		/**
		 * A human-readable message that explains why access to a language model is needed and what feature is enabled by it.
		 */
		justification?: string;

		/**
		 * Do not show the consent UI if the user has not yet granted access to the language model but fail the request instead.
		 */
		// TODO@API refine/define
		silent?: boolean;

		/**
		 * A set of options that control the behavior of the language model. These options are specific to the language model
		 * and need to be lookup in the respective documentation.
		 */
		modelOptions?: { [name: string]: any };
	}

	/**
	 * Namespace for language model related functionality.
	 */
	export namespace lm {

		/**
		 * Make a chat request using a language model.
		 *
		 * *Note* that language model use may be subject to access restrictions and user consent. This function will return a rejected promise
		 * if access to the language model is not possible. Reasons for this can be:
		 *
		 * - user consent not given
		 * - quote limits exceeded
		 * - model does not exist
		 *
		 * @param languageModel A language model identifier. See {@link languageModels} for aviailable values.
		 * @param messages An array of message instances.
		 * @param options Objects that control the request.
		 * @param token A cancellation token which controls the request. See {@link CancellationTokenSource} for how to create one.
		 * @returns A thenable that resolves to a {@link LanguageModelChatResponse}. The promise will reject when making the request failed.
		 */
		// TODO@API refine doc
		// TODO@API define specific error types?
		// TODO@API NAME: sendChatRequest, fetchChatResponse, makeChatRequest, chat, chatRequest sendChatRequest
		// TODO@API ExtensionContext#permission#languageModels: { languageModel: string: LanguageModelAccessInformation}
		// TODO@API ✅ NAME: LanguageModelChatXYZMessage
		// TODO@API ✅ errors on everything that prevents us to make the actual request
		// TODO@API ✅ double auth
		// TODO@API ✅ NAME: LanguageModelChatResponse, ChatResponse, ChatRequestResponse
		export function sendChatRequest(languageModel: string, messages: LanguageModelChatMessage[], options: LanguageModelChatRequestOptions, token: CancellationToken): Thenable<LanguageModelChatResponse>;

		/**
		 * The identifiers of all language models that are currently available.
		 */
		export const languageModels: readonly string[];

		/**
		 * An event that is fired when the set of available language models changes.
		 */
		export const onDidChangeLanguageModels: Event<LanguageModelChangeEvent>;
	}

	// export function chatRequest2<R = void>(languageModel: string, callback: (request: LanguageModelRequest) => R): Thenable<R>;

	// interface LanguageModelRequest {
	// 	readonly quota: any;
	// 	readonly permissions: any;
	// 	makeRequest(messages: LanguageModelChatMessage[], options: { [name: string]: any }, token: CancellationToken): LanguageModelChatResponse;
	// }
}
