/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Represents a language model response.
	 *
	 * @see {@link LanguageModelAccess.makeChatRequest}
	 */
	export interface LanguageModelResponse {

		/**
		 * The overall result of the request which represents failure or success
		 * but. The concrete value is not specified and depends on the selected language model.
		 *
		 * *Note* that the actual response represented by the {@link LanguageModelResponse.stream `stream`}-property
		 */
		result: Thenable<unknown>;

		/**
		 * An async iterable that is a stream of text chunks forming the overall response.
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
	export class LanguageModelSystemMessage {

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
	export class LanguageModelUserMessage {

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
	export class LanguageModelAssistantMessage {

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

	export type LanguageModelMessage = LanguageModelSystemMessage | LanguageModelUserMessage | LanguageModelAssistantMessage;

	/**
	 * Represents access to using a language model. Access can be revoked at any time and extension
	 * must check if the access is {@link LanguageModelAccess.isRevoked still valid} before using it.
	 */
	export interface LanguageModelAccess {

		/**
		 * Whether the access to the language model has been revoked.
		 */
		readonly isRevoked: boolean;

		/**
		 * An event that is fired when the access the language model has has been revoked or re-granted.
		 */
		// TODO@API NAME?
		readonly onDidChangeAccess: Event<void>;

		/**
		 * The name of the model.
		 *
		 * It is expected that the model name can be used to lookup properties like token limits or what
		 * `options` are available.
		 */
		readonly model: string;

		/**
		 * Make a request to the language model.
		 *
		 * *Note:* This will throw an error if access has been revoked.
		 *
		 * @param messages
		 * @param options
		 */
		makeChatRequest(messages: LanguageModelMessage[], options: { [name: string]: any }, token: CancellationToken): LanguageModelResponse;
	}

	export interface LanguageModelAccessOptions {
		/**
		 * A human-readable message that explains why access to a language model is needed and what feature is enabled by it.
		 */
		justification?: string;
	}

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
	 * Namespace for language model related functionality.
	 */
	export namespace lm {

		/**
		 * Request access to a language model.
		 *
		 * - *Note 1:* This function will throw an error when the user didn't grant access or when the
		 * requested language model is not available.
		 *
		 * - *Note 2:* It is OK to hold on to the returned access object and use it later, but extensions
		 * should check {@link LanguageModelAccess.isRevoked} before using it.
		 *
		 * @param id The id of the language model, see {@link languageModels} for valid values.
		 * @returns A thenable that resolves to a language model access object, rejects if access wasn't granted
		 */
		export function requestLanguageModelAccess(id: string, options?: LanguageModelAccessOptions): Thenable<LanguageModelAccess>;



		/**
		 * Make a chat request using a language model.
		 *
		 * *Note* that language model use may be subject to access restrictions and user consent. This function always returns a response-object
		 * but its {@link LanguageModelResponse.result `result`}-property may indicate failure, e.g. due to
		 *
		 * - user consent not given
		 * - quote limits exceeded
		 * - model does not exist
		 *
		 * @param languageModel A language model identifier. See {@link languageModels} for aviailable values.
		 * @param messages
		 * @param options
		 * @param token
		 */
		// TODO@API refine doc
		// TODO@API define specific error types?
		export function makeChatRequest(languageModel: string, messages: LanguageModelMessage[], options: { [name: string]: any }, token: CancellationToken): Thenable<LanguageModelResponse>;

		/**
		 * @see {@link makeChatRequest}
		 */
		export function makeChatRequest(languageModel: string, messages: LanguageModelMessage[], token: CancellationToken): Thenable<LanguageModelResponse>;

		/**
		 * The identifiers of all language models that are currently available.
		 */
		export const languageModels: readonly string[];

		/**
		 * An event that is fired when the set of available language models changes.
		 */
		export const onDidChangeLanguageModels: Event<LanguageModelChangeEvent>;
	}
}
