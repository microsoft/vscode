/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWindow, IChatWindowService } from '../../chatWindow/browser/chatWindow.js';
import { ISessionsHostLayoutService } from '../../../services/sessions/browser/sessionsHostLayoutService.js';
import { getWindowHost, ISessionHost, SessionHostKind } from '../../../services/sessions/browser/sessionHost.js';

/** The chat window that `host` is in, if it is in one. */
export function getChatWindowOfHost(chatWindowService: IChatWindowService, host: ISessionHost | undefined): IChatWindow | undefined {
	const windowHost = host && getWindowHost(host);
	const windowId = windowHost?.kind === SessionHostKind.ChatWindow ? windowHost.windowId.get() : undefined;
	return windowId === undefined ? undefined : chatWindowService.getWindow(windowId);
}

/**
 * Reveals the editors where the user asked for them: in the chat window that `host` is in, else in the main window. Returns
 * the chat window, whose main part is where an editor opens, or `undefined` for the main window.
 */
export function revealEditorsOfHost(layoutService: ISessionsHostLayoutService, chatWindowService: IChatWindowService, host: ISessionHost | undefined): IChatWindow | undefined {
	const chatWindow = getChatWindowOfHost(chatWindowService, host);
	if (chatWindow) {
		chatWindow.showEditor();
	} else {
		layoutService.revealEditorPartExplicitly();
	}
	return chatWindow;
}
