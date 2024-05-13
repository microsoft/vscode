/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/206265

	/**
	 * Represents the role of a chat message. This is either the user or the assistant.
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
	 * Represents a message in a chat. Can assume different roles, like user or assistant.
	 */
	export class LanguageModelChatMessage {

		/**
		 * Utility to create a new user message.
		 *
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		static User(content: string, name?: string): LanguageModelChatMessage;

		/**
		 * Utility to create a new assistant message.
		 *
		 * @param content The content of the message.
		 * @param name The optional name of a user for the message.
		 */
		static Assistant(content: string, name?: string): LanguageModelChatMessage;

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
	 * Represents a language model response.
	 *
	 * @see {@link LanguageModelAccess.chatRequest}
	*/
	// TODO@API add something like `modelResult: Thenable<{ [name: string]: any }>`
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

	/**
	 * Represents a language model for making chat requests.
	 *
	 * @see {@link lm.selectChatModels}
	 */
	export interface LanguageModelChat {
		/**
		 * Opaque identifier of the language model.
		 */
		readonly id: string;

		/**
		 * A well-know identifier of the vendor of the language model, a sample is `copilot`, but
		 * values are defined by extensions contributing chat models and need to be looked up with them.
		 */
		readonly vendor: string;

		/**
		 * Human-readable name of the language model.
		 */
		readonly name: string;

		/**
		 * Opaque family-name of the language model. Values might be `gpt-3.5-turbo`, `gpt4`, `phi2`, or `llama`
		 * but they are defined by extensions contributing languages and subject to change.
		 */
		readonly family: string;

		/**
		 * Opaque version string of the model. This is defined by the extension contributing the language model
		 * and subject to change.
		 */
		readonly version: string;

		// TODO@API
		// max_prompt_tokens vs output_tokens vs context_size
		// readonly inputTokens: number;
		// readonly outputTokens: number;
		readonly contextSize: number;

		/**
		 * Make a chat request using a language model.
		 *
		 * *Note* that language model use may be subject to access restrictions and user consent. Calling this function
		 * for the first time (for a extension) will show a consent dialog to the user and because of that this function
		 * must _only be called in response to a user action!_ Extension can use {@link LanguageModelAccessInformation.canSendRequest}
		 * to check if they have the necessary permissions to make a request.
		 *
		 * This function will return a rejected promise if making a request to the language model is not
		 * possible. Reasons for this can be:
		 *
		 * - user consent not given, see {@link LanguageModelError.NoPermissions `NoPermissions`}
		 * - model does not exist anymore, see {@link LanguageModelError.NotFound `NotFound`}
		 * - quota limits exceeded, see {@link LanguageModelError.Blocked `Blocked`}
		 * - other issues in which case extension must check {@link LanguageModelError.cause `LanguageModelError.cause`}
		 *
		 * @param messages An array of message instances.
		 * @param options Options that control the request.
		 * @param token A cancellation token which controls the request. See {@link CancellationTokenSource} for how to create one.
		 * @returns A thenable that resolves to a {@link LanguageModelChatResponse}. The promise will reject when the request couldn't be made.
		 */
		sendRequest(messages: LanguageModelChatMessage[], options?: LanguageModelChatRequestOptions, token?: CancellationToken): Thenable<LanguageModelChatResponse>;

		/**
		 * Count the number of tokens in a message using the model specific tokenizer-logic.

		 * @param text A string or a message instance.
		 * @param token Optional cancellation token.  See {@link CancellationTokenSource} for how to create one.
		 * @returns A thenable that resolves to the number of tokens.
		 */
		countTokens(text: string | LanguageModelChatMessage, token?: CancellationToken): Thenable<number>;
	}

	/**
	 * Describes how to select language models for chat requests.
	 *
	 * @see {@link lm.selectChatModels}
	 */
	export interface LanguageModelChatSelector {

		/**
		 * A vendor of language models.
		 * @see {@link LanguageModelChat.vendor}
		 */
		vendor?: string;

		/**
		 * A family of language models.
		 * @see {@link LanguageModelChat.family}
		 */
		family?: string;

		/**
		 * The version of a language model.
		 * @see {@link LanguageModelChat.version}
		 */
		version?: string;

		/**
		 * The identifier of a language model.
		 * @see {@link LanguageModelChat.id}
		 */
		id?: string;
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
		 * The requestor does not have permissions to use this
		 * language model
		 */
		static NoPermissions(message?: string): LanguageModelError;

		/**
		 * The requestor is blocked from using this language model.
		 */
		static Blocked(message?: string): LanguageModelError;

		/**
		 * The language model does not exist.
		 */
		static NotFound(message?: string): LanguageModelError;

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
	 * @see {@link LanguageModelChat.sendRequest}
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
		 * An event that is fired when the set of available chat models changes.
		 */
		export const onDidChangeChatModels: Event<void>;

		/**
		 * Select chat models by a {@link LanguageModelChatSelector selector}. This can yield in multiple or no chat models and
		 * extensions must handle these cases, esp. when no chat model exists, gracefully.
		 *
		 * *Note* that extensions can hold-on to the results returned by this function and use them later. However, whenever the
		 * {@link onDidChangeChatModels}-event is fired the list of chat models might have changed and extensions should re-query.
		 *
		 * @param selector A chat model selector. When omitted all chat models are returned.
		 * @returns An array of chat models or `undefined` when no chat model was selected.
		 */
		// TODO@API no undefined but empty array
		export function selectChatModels(selector?: LanguageModelChatSelector): Thenable<LanguageModelChat[] | undefined>;
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
		 * @param languageModelId A language model identifier, see {@link LanguageModelChat.id}
		 * @return `true` if a request can be made, `false` if not, `undefined` if the language
		 * model does not exist or consent hasn't been asked for.
		 */
		// TODO@API applies to chat and embeddings models
		// TODO@API use LanguageModelChat
		// TODO@API name: canUse, hasAccess?
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
