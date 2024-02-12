/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface LanguageModelResponse {

		/**
		 * The overall result of the request which represents failure or success
		 * but _not_ the actual response or responses
		 */
		// TODO@API define this type!
		result: Thenable<unknown>;

		stream: AsyncIterable<string>;
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
		makeChatRequest(messages: ChatMessage[], options: { [name: string]: any }, token: CancellationToken): LanguageModelResponse;
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
		 * The identifiers of all language models that are currently available.
		 */
		export const languageModels: readonly string[];

		/**
		 * An event that is fired when the set of available language models changes.
		 */
		export const onDidChangeLanguageModels: Event<LanguageModelChangeEvent>;
	}
}
