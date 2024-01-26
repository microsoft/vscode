/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatResponseFragment {
		index: number;
		part: string;
	}

	/**
	 * Represents a large language model that accepts ChatML messages and produces a streaming response
	 */
	export interface ChatResponseProvider {
		provideChatResponse(messages: ChatMessage[], options: { [name: string]: any }, progress: Progress<ChatResponseFragment>, token: CancellationToken): Thenable<any>;
	}

	export interface ChatResponseProviderMetadata {
		/**
		 * The name of the model that is used for this chat access. It is expected that the model name can
		 * be used to lookup properties like token limits and ChatML support
		 */
		// TODO@API rename to model
		name: string;
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
