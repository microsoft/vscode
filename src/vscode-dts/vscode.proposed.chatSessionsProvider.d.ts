/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * Provides a list of information about chat sessions.
	 */
	export interface ChatSessionItemProvider {
		/**
		 * Label of the extension that registers the provider.
		 */
		readonly label: string;

		/**
		 * Event that the provider can fire to signal that chat sessions have changed.
		 */
		readonly onDidChangeChatSessionItems: Event<void>;

		/**
		 * Provides a list of chat sessions.
		 */
		provideChatSessionItems(token: CancellationToken): ProviderResult<ChatSessionItem[]>;
	}

	export interface ChatSessionItem {
		/**
		 * Unique identifier for the chat session.
		 */
		id: string;

		/**
		 * Human readable name of the session shown in the UI
		 */
		label: string;

		/**
		 * An icon for the participant shown in UI.
		 */
		iconPath?: IconPath;
	}

	export class ChatResponseTurn2 {
		/**
		 * The content that was received from the chat participant. Only the stream parts that represent actual content (not metadata) are represented.
		 */
		readonly response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart | ExtendedChatResponsePart | ChatToolInvocationPart>;

		/**
		 * The result that was received from the chat participant.
		 */
		readonly result: ChatResult;

		/**
		 * The id of the chat participant that this response came from.
		 */
		readonly participant: string;

		/**
		 * The name of the command that this response came from.
		 */
		readonly command?: string;

		constructor(response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart | ExtendedChatResponsePart>, result: ChatResult, participant: string);
	}

	export interface ChatSession {

		/**
		 * The full history of the session
		 *
		 * This should not include any currently active responses
		 *
		 * TODO: Are these the right types to use?
		 * TODO: link request + response to encourage correct usage?
		 */
		readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn2>;

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
		export function registerChatSessionItemProvider(chatSessionType: string, provider: ChatSessionItemProvider): Disposable;

		/**
		 * @param chatSessionType A unique identifier for the chat session type. This is used to differentiate between different chat session providers.
		 */
		export function registerChatSessionContentProvider(chatSessionType: string, provider: ChatSessionContentProvider): Disposable;

	}
}
