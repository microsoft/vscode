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

	export namespace chat {
		export function registerChatSessionItemProvider(chatSessionType: string, provider: ChatSessionItemProvider): Disposable;
	}
}
