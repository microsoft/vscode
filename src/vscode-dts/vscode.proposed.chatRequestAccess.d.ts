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
	 * Represents access to using a chat provider (LLM). Access is granted and temporary, usually only valid
	 * for the duration of an user interaction.
	 */
	export interface ChatAccess {

		/**
		 * Whether the access to chat has been revoked. This happens when the user interaction that allowed for
		 * chat access is finished.
		 */
		isRevoked: boolean;

		/**
		 * TODO: return an AsyncIterable instead of asking to pass Progress<...>?
		 *
		 * @param messages
		 * @param options
		 * @param progress
		 * @param token
		 */
		makeRequest(messages: ChatMessage[], options: { [name: string]: any }, progress: Progress<ChatResponseFragment>, token: CancellationToken): Thenable<any>;
	}

	export namespace chat {

		/**
		 * Request access to chat.
		 *
		 * *Note* that this function will throw an error unless an user interaction is currently active.
		 *
		 * @param id The id of the chat provider, e.g `copilot`
		 */
		export function requestChatAccess(id: string): Thenable<ChatAccess>;
	}
}
