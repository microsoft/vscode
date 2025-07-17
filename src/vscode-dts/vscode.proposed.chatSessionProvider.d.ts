/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatSessionContentProvider {

		/**
		 * Resolves a chat session into a full `ChatSession` object.
		 *
		 * @param uri The URI of the chat session to open. Uris as structured as `vscode-chat-session:<chatSessionType>/id`
		 * @param token A cancellation token that can be used to cancel the operation.
		 */
		provideChatSessionContent(id: string, token: CancellationToken): Thenable<ChatSession>;
	}

	export namespace chat {
		/**
		 * @param chatSessionType A unique identifier for the chat session type. This is used to differentiate between different chat session providers.
		 */
		export function registerChatSessionContentProvider(chatSessionType: string, provider: ChatSessionContentProvider): Disposable;
	}

	export namespace window {
		/**
		 * Some API to open a chat session with a given id
		 */
		export function openChatSession(sessionType: string, id: string): Thenable<void>;
	}

	// TODO: Should we call this something like ChatDocument or ChatData?
	// TODO: How much control should extensions have? Can we let them modify a chat that is already rendered?
	export interface ChatSession {

		/**
		 * The full history of the session
		 *
		 * This should not include any currently active responses
		 *
		 * TODO: Are these the right types to use?
		 * TODO: link request + response to encourage correct usage?
		 */
		readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn>;

		/**
		 * Callback invoked by the editor for a currently running response. This allows the session to push items for the
		 * current response and stream these in as them come in. The current response will be considered complete once the
		 * callback resolved.
		 *
		 * If not provided, the chat session is assumed to not currently be running.
		 */
		readonly activeResponseCallback?: (stream: ChatResponseStream, token: CancellationToken) => Thenable<void>;

		/**
		 * Handles new request for the session.
		 *
		 * If not set, then the session will be considered read-only and no requests can be made.
		 *
		 * TODO: Should we introduce our own type for `ChatRequestHandler` since not all field apply to chat sessions?
		 */
		readonly requestHandler: ChatRequestHandler | undefined;
	}
}
