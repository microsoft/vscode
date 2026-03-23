/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	/**
	 * Status indicator for a chat session custom header.
	 */
	export enum ChatSessionCustomHeaderStatus {
		Active = 0,
		Idle = 1,
		Error = 2
	}

	/**
	 * Data to display in the custom header section of an agent session custom view.
	 */
	export interface ChatSessionCustomHeaderData {
		/**
		 * Display label, e.g. the worker instance name.
		 */
		readonly label: string;

		/**
		 * Optional description text.
		 */
		readonly description?: string;

		/**
		 * Optional icon (ThemeIcon).
		 */
		readonly icon?: ThemeIcon;

		/**
		 * Optional status indicator.
		 */
		readonly status?: ChatSessionCustomHeaderStatus;

		/**
		 * Optional additional key-value pairs to display.
		 */
		readonly details?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
	}

	export namespace chat {
		/**
		 * Set or update the custom header data for a chat session.
		 * When a chat session is displayed in the agent session custom view,
		 * this data is rendered in the header section above the chat conversation.
		 *
		 * @param sessionResource The URI of the chat session.
		 * @param data The header data to display.
		 */
		export function setChatSessionCustomHeaderData(sessionResource: Uri, data: ChatSessionCustomHeaderData): void;

		/**
		 * Open a chat session in the agent session custom view.
		 * The custom view displays a header section (populated via {@link setChatSessionCustomHeaderData})
		 * above the standard chat conversation renderer.
		 *
		 * @param sessionResource The URI of the chat session to open.
		 */
		export function openChatSessionInCustomView(sessionResource: Uri): Thenable<void>;
	}
}
