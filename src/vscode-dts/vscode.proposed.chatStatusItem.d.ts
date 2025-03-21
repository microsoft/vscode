/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatStatusItem {
		/**
		 * The identifier of this item.
		 */
		readonly id: string;

		/**
		 * The main name of the entry, like 'Indexing Status'
		 */
		title: string;

		/**
		 * Optional additional description of the entry.
		 *
		 * This is rendered less prominent on the same line as the title. Supports Markdown style links and rendering of
		 * {@link ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 */
		description: string | undefined;

		/**
		 * Optional additional details of the entry.
		 *
		 * This is rendered less prominent in a separate line. Supports Markdown style links and rendering of
		 * {@link ThemeIcon theme icons} via the `$(<name>)`-syntax.
		 */
		details: string | undefined;

		/**
		 * Shows the entry in the chat status.
		 */
		show(): void;

		/**
		 * Hide the entry in the chat status.
		 */
		hide(): void;

		/**
		 * Dispose and free associated resources
		 */
		dispose(): void;
	}

	namespace window {
		/**
		 * Create a new chat status item.
		 *
		 * @param id The unique identifier of the status bar item.
		 *
		 * @returns A new chat status item.
		 */
		export function createChatStatusItem(id: string): ChatStatusItem;
	}
}
