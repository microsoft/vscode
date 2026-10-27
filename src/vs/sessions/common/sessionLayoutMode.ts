/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { RawContextKey } from '../../platform/contextkey/common/contextkey.js';

/** How a window of the Agents window, the main window or a chat window, shows a chat and its editor. */
export const enum SessionLayoutMode {
	/** The editor above the chat. The chat can be dragged down to show only its input. */
	Stacked = 'stacked',
	/** The chat, with its conversation, beside the editor. */
	SideBySide = 'sideBySide',
	/** Only the editor. */
	EditorOnly = 'editorOnly',
	/** Only the chat, with its conversation. */
	ChatOnly = 'chatOnly',
}

/** The layout modes in which the chat and the editor show together. */
export type SessionSplitLayout = SessionLayoutMode.Stacked | SessionLayoutMode.SideBySide;

/** The {@link SessionLayoutMode} of the window, or of the chat window in its scope. */
export const SessionLayoutModeContext = new RawContextKey<string>('sessions.layoutMode', SessionLayoutMode.ChatOnly, localize('sessionLayoutMode', "How the window shows its chat and its editor: stacked, sideBySide, editorOnly or chatOnly."));

/** The {@link SessionSplitLayout} of the window: how its chat and its editor show together, or last showed. */
export const SessionSplitLayoutContext = new RawContextKey<string>('sessions.splitLayout', SessionLayoutMode.Stacked, localize('sessionSplitLayout', "How the window arranges its chat and its editor while both show, or as they last showed together: stacked or sideBySide."));
