/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

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

	export namespace llm {

		/**
		 * Request access to chat.
		 *
		 * *Note* that this function will throw an error unless an user interaction is currently active.
		 *
		 * @param id The id of the chat provider, e.g `chatgpt`
		 */
		export function requestChatAccess(id: string): Thenable<ChatAccess>;
	}
}
