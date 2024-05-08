/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/206265

	/**
	 * Represents a language model response.
	 *
	 * @see {@link LanguageModelAccess.chatRequest}
	 */
	export interface LanguageModelChatResponse {

		/**
		 * An async iterable that is a stream of text chunks forming the overall response.
		 *
		 * *Note* that this stream will error when during data receiving an error occurs. Consumers of
		 * the stream should handle the errors accordingly.
		 *
		 * @example
		 * ```ts
		 * try {
		 *   // consume stream
		 *   for await (const chunk of response.stream) {
		 *    console.log(chunk);
		 *   }
		 *
		 * } catch(e) {
		 *   // stream ended with an error
		 *   console.error(e);
		 * }
		 * ```
		 */
		stream: AsyncIterable<string>;
	}

	//TODO@API give this some structure
	// https://github.com/openai/openai-openapi/blob/master/openapi.yaml#L7700, https://platform.openai.com/docs/guides/text-generation/chat-completions-api
	// https://github.com/ollama/ollama/blob/main/docs/api.md#response-7
	// https://docs.anthropic.com/claude/reference/messages_post
	export interface LanguageModelChatResponse2 {

		message: {
			role: LanguageModelChatMessageRole.Assistant;
			content: AsyncIterable<string>;
		};


	}

	/**
	 * Represents the role of a chat message. This is either the user or the assistant/model.
	 */
	export enum LanguageModelChatMessageRole {
		/**
		 * The user role, e.g the human interacting with a language model.
		 */
		User = 1,

		/**
		 * The assistant role, e.g. the language model generating responses.
		 */
		Assistant = 2
	}

	/**
	 * @deprecated
	 */
	// TODO@API remove
	export type LanguageModelChatMessage2 = LanguageModelChatMessage;

	/**
	 * Represents a message in a chat. Can assume different roles, like user or assistant.
	 */
	export class LanguageModelChatMessage {
		/**
		 * The role of this message.
		 */
		role: LanguageModelChatMessageRole;

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
		 * @param role The role of the message.
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		constructor(role: LanguageModelChatMessageRole, content: string, name?: string);
	}

	/**
	 * Represents information about a registered language model.
	 */
	export interface LanguageModelInformation {
		/**
		 * The identifier of the language model.
		 */
		readonly id: string;

		/**
		 * The human-readable name of the language model.
		 */
		readonly name: string;

		/**
		 * The version of the language model.
		 */
		// TODO@API drop this for now?
		readonly version: string;

		/**
		 * The number of available tokens that can be used when sending requests
		 * to the language model.
		 *
		 * _Note_ that input- and output-tokens count towards this limit.
		 *
		 * @see {@link lm.sendChatRequest}
		 */
		readonly contextLength: number;
	}

	/**
	 * An event describing the change in the set of available language models.
	 */
	// TODO@API use LanguageModelInformation instead of string?
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
	 * An error type for language model specific errors.
	 *
	 * Consumers of language models should check the code property to determine specific
	 * failure causes, like `if(someError.code === vscode.LanguageModelError.NotFound.name) {...}`
	 * for the case of referring to an unknown language model. For unspecified errors the `cause`-property
	 * will contain the actual error.
	 */
	export class LanguageModelError extends Error {

		/**
		 * The language model does not exist.
		 */
		static NotFound(message?: string): LanguageModelError;

		/**
		 * The requestor does not have permissions to use this
		 * language model
		 */
		static NoPermissions(message?: string): LanguageModelError;

		/**
		 * The requestor is blocked from using this language model.
		 */
		static Blocked(message?: string): LanguageModelError;

		/**
		 * A code that identifies this error.
		 *
		 * Possible values are names of errors, like {@linkcode LanguageModelError.NotFound NotFound},
		 * or `Unknown` for unspecified errors from the language model itself. In the latter case the
		 * `cause`-property will contain the actual error.
		 */
		readonly code: string;
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
		 * The identifiers of all language models that are currently available.
		 */
		export const languageModels: readonly string[];

		/**
		 * An event that is fired when the set of available language models changes.
		 */
		export const onDidChangeLanguageModels: Event<LanguageModelChangeEvent>;

		/**
		 * Retrieve information about a language model.
		 *
		 * @param languageModel A language model identifier.
		 * @returns A {@link LanguageModelInformation} instance or `undefined` if the language model does not exist.
		 */
		export function getLanguageModelInformation(languageModel: string): LanguageModelInformation | undefined;

		/**
		 * Make a chat request using a language model.
		 *
		 * - *Note 1:* language model use may be subject to access restrictions and user consent. Calling this function
		 * for the first time (for a extension) will show a consent dialog to the user and because of that this function
		 * must _only be called in response to a user action!_ Extension can use {@link LanguageModelAccessInformation.canSendRequest}
		 * to check if they have the necessary permissions to make a request.
		 *
		 * - *Note 2:* language models are contributed by other extensions and as they evolve and change,
		 * the set of available language models may change over time. Therefore it is strongly recommend to check
		 * {@link languageModels} for available values and handle missing language models gracefully.
		 *
		 * This function will return a rejected promise if making a request to the language model is not
		 * possible. Reasons for this can be:
		 *
		 * - user consent not given, see {@link LanguageModelError.NoPermissions `NoPermissions`}
		 * - model does not exist, see {@link LanguageModelError.NotFound `NotFound`}
		 * - quota limits exceeded, see {@link LanguageModelError.Blocked `Blocked`}
		 * - other issues in which case extension must check {@link LanguageModelError.cause `LanguageModelError.cause`}
		 *
		 * @param languageModel A language model identifier.
		 * @param messages An array of message instances.
		 * @param options Options that control the request.
		 * @param token A cancellation token which controls the request. See {@link CancellationTokenSource} for how to create one.
		 * @returns A thenable that resolves to a {@link LanguageModelChatResponse}. The promise will reject when the request couldn't be made.
		 */
		export function sendChatRequest(languageModel: string, messages: LanguageModelChatMessage[], options?: LanguageModelChatRequestOptions, token?: CancellationToken): Thenable<LanguageModelChatResponse>;

		/**
		 * Uses the language model specific tokenzier and computes the length in token of a given message.
		 *
		 * *Note* that this function will throw when the language model does not exist.
		 *
		 * @param languageModel A language model identifier.
		 * @param text A string or a message instance.
		 * @param token Optional cancellation token.
		 * @returns A thenable that resolves to the length of the message in tokens.
		 */
		// TODO@API `undefined` when the language model does not support computing token length
		// ollama has nothing
		// anthropic suggests to count after the fact https://github.com/anthropics/anthropic-tokenizer-typescript?tab=readme-ov-file#anthropic-typescript-tokenizer
		export function computeTokenLength(languageModel: string, text: string | LanguageModelChatMessage, token?: CancellationToken): Thenable<number | undefined>;
	}

	/**
	 * Represents extension specific information about the access to language models.
	 */
	export interface LanguageModelAccessInformation {

		/**
		 * An event that fires when access information changes.
		 */
		onDidChange: Event<void>;

		/**
		 * Checks if a request can be made to a language model.
		 *
		 * *Note* that calling this function will not trigger a consent UI but just checks.
		 *
		 * @param languageModelId A language model identifier.
		 * @return `true` if a request can be made, `false` if not, `undefined` if the language
		 * model does not exist or consent hasn't been asked for.
		 */
		canSendRequest(languageModelId: string): boolean | undefined;
	}

	export interface ExtensionContext {

		/**
		 * An object that keeps information about how this extension can use language models.
		 *
		 * @see {@link lm.sendChatRequest}
		 */
		readonly languageModelAccessInformation: LanguageModelAccessInformation;
	}
}
