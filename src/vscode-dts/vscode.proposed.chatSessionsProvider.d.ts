/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	/**
	 * Provides a list of chat sessions
	 */
	export interface ChatSessionsProvider extends Disposable {
		/**
		 * Type to identify providers.
		 */
		readonly chatSessionType: string;

		/**
		 * Fired when chat sessions change.
		 */
		readonly onDidChangeChatSessionContent: Event<void>;

		/**
		 * Provide a list of chat sessions.
		 * */
		provideChatSessions(token: CancellationToken): Thenable<ChatSessionContent[]>;

		provideChatSessionContent(uri: Uri, token: CancellationToken): Thenable<ChatSession>;
	}

	export interface ChatSessionContent {
		/**
		 * Identifies the session
		 *		 */
		uri: Uri;

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
		readonly response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart | ExtendedChatResponsePart>;

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

		/**
		 * @hidden
		 */
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

	export namespace chat {
		export function registerChatSessionsProvider(provider: ChatSessionsProvider): Disposable;
	}
}
