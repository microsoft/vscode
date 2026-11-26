/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWindow, IChatWindowService } from '../../chatWindow/browser/chatWindow.js';
import { ISessionsHostLayoutService } from '../../../services/sessions/browser/sessionsHostLayoutService.js';
import { getWindowHost, ISessionHost, SessionHostKind } from '../../../services/sessions/browser/sessionHost.js';

/** Where the editors of a chat are shown: the main window, or the chat window the chat is in. */
export type EditorTarget = IChatWindow | 'main';

/**
 * The window that shows the editors of the chat in `host`. Returns `undefined` for a host in a chat window that is not
 * registered (being created or torn down): nothing may fall back to the main window then.
 */
export function getEditorTarget(chatWindowService: IChatWindowService, host: ISessionHost | undefined): EditorTarget | undefined {
	const windowHost = host && getWindowHost(host);
	if (windowHost?.kind !== SessionHostKind.ChatWindow) {
		return 'main';
	}
	const windowId = windowHost.windowId.get();
	return windowId === undefined ? undefined : chatWindowService.getWindow(windowId);
}

/** Reveals the editor area of `target`. */
export function revealEditorTarget(layoutService: ISessionsHostLayoutService, target: EditorTarget): void {
	if (target === 'main') {
		layoutService.revealEditorPartExplicitly();
	} else {
		target.showEditor();
	}
}

/** The group an editor opens in: the main part's active group of a chat window, or the preferred group of the main window. */
export function getEditorTargetGroup(target: EditorTarget, existingGroupId?: number): number | undefined {
	if (target === 'main') {
		return existingGroupId;
	}
	return existingGroupId !== undefined && target.mainPart.getGroup(existingGroupId) ? existingGroupId : target.mainPart.activeGroup.id;
}
