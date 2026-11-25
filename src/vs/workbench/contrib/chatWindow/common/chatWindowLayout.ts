/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** How a window shows a chat and its editor. */
export const enum ChatWindowLayoutMode {
	/** The editor above the chat. The chat can be dragged down to show only its input. */
	Stacked = 'stacked',
	/** The chat beside the editor. */
	SideBySide = 'sideBySide',
	/** Only the editor. */
	EditorOnly = 'editorOnly',
	/** Only the chat. */
	ChatOnly = 'chatOnly',
}

/** Where the terminals show. Full Width matches the panel alignment "justify" of the main window, Under Chat matches "center". */
export const enum ChatWindowTerminalPosition {
	FullWidth = 'fullWidth',
	UnderChat = 'underChat',
	UnderEditor = 'underEditor',
}

/** The layout modes in which a chat window shows its chat and its editor together: the values of the `splitLayout` context key. */
export type ChatWindowSplitLayout = ChatWindowLayoutMode.Stacked | ChatWindowLayoutMode.SideBySide;

export function isChatWindowLayoutMode(value: unknown): value is ChatWindowLayoutMode {
	return value === ChatWindowLayoutMode.Stacked || value === ChatWindowLayoutMode.SideBySide || value === ChatWindowLayoutMode.EditorOnly || value === ChatWindowLayoutMode.ChatOnly;
}

export function isChatWindowSplitLayout(value: unknown): value is ChatWindowSplitLayout {
	return value === ChatWindowLayoutMode.Stacked || value === ChatWindowLayoutMode.SideBySide;
}
