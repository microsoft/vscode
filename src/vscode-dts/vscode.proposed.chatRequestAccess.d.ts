/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface LanguageModelResponseStream {

		/**
		 * The response stream.
		 */
		readonly response: AsyncIterable<string>;

		/**
		 * The variant of multiple responses. This is used to disambiguate between multiple
		 * response streams when having asked for multiple response options
		 */
		readonly option: number;
	}

	// TODO@API NAME: LanguageModelResponse (depends on having cancel or not)
	export interface LanguageModelRequest {

		/**
		 * The overall result of the request which represents failure or success
		 * but _not_ the actual response or responses
		 */
		// TODO@API define this type!
		result: Thenable<any>;

		/**
		 * The _default response_ stream. This is the stream of the first response option
		 * receiving data.
		 *
		 * Usually there is only one response option and this stream is more convienient to use
		 * than the {@link onDidStartResponseStream `onDidStartResponseStream`} event.
		 */
		// TODO@API NAME: responseStream
		response: AsyncIterable<string>;

		/**
		 * An event that fires whenever a new response option is available. The response
		 * itself is a stream of the actual response.
		 *
		 * *Note* that the first time this event fires, the {@link LanguageModelResponseStream.response response stream}
		 * is the same as the {@link response `default response stream`}.
		 *
		 * *Note* that unless requested there is only one response option, so this event will only fire
		 * once.
		 */
		onDidStartResponseStream: Event<LanguageModelResponseStream>;

		/**
		 * Cancel this request.
		 */
		// TODO@API remove this? We pass a token to makeRequest call already
		cancel(): void;
	}

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
		makeRequest(messages: ChatMessage[], options: { [name: string]: any }, token: CancellationToken): LanguageModelRequest;
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

	//@API DEFINE the namespace for this: env, lm, ai?
	export namespace chat {

		/**
		 * Request access to a language model.
		 *
		 * *Note* that this function will throw an error when the user didn't grant access
		 *
		 * @param id The id of the language model, e.g `copilot`
		 * @returns A thenable that resolves to a language model access object, rejects is access wasn't granted
		 */
		export function requestLanguageModelAccess(id: string, options?: LanguageModelAccessOptions): Thenable<LanguageModelAccess>;

		/**
		 * The identifiers of all language models that are currently available.
		 */
		export const languageModels: readonly string[];

		/**
		 * An event that is fired when the set of available language models changes.
		 */
		//@API is this really needed?
		export const onDidChangeLanguageModels: Event<LanguageModelChangeEvent>;
	}
}
