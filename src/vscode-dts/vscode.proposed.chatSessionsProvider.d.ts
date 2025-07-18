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

	export namespace chat {
		export function registerChatSessionsProvider(provider: ChatSessionsProvider): Disposable;
	}
}
