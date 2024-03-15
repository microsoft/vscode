/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatResponseFragment {
		index: number;
		part: string;
	}

	// @API extension ship a d.ts files for their options

	/**
	 * Represents a large language model that accepts ChatML messages and produces a streaming response
	 */
	export interface ChatResponseProvider {
		provideLanguageModelResponse2(messages: LanguageModelChatMessage[], options: { [name: string]: any }, extensionId: string, progress: Progress<ChatResponseFragment>, token: CancellationToken): Thenable<any>;
	}

	export interface ChatResponseProviderMetadata {
		/**
		 * The name of the model that is used for this chat access. It is expected that the model name can
		 * be used to lookup properties like token limits and ChatML support
		 */
		// TODO@API rename to model
		name: string;

		/**
		 * When present, this gates the use of `requestLanguageModelAccess` behind an authorization flow where
		 * the user must approve of another extension accessing the models contributed by this extension.
		 * Additionally, the extension can provide a label that will be shown in the UI.
		 */
		auth?: true | { label: string };
	}

	export namespace chat {

		/**
		 * Register a LLM as chat response provider to the editor.
		 *
		 *
		 * @param id
		 * @param provider
		 * @param metadata
		 */
		export function registerChatResponseProvider(id: string, provider: ChatResponseProvider, metadata: ChatResponseProviderMetadata): Disposable;
	}

}
