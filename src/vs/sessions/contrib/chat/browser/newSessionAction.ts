/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

/**
 * Routing for the primary "New" action. A quick chat (draft or committed) opens
 * another quick chat mirroring its harness; any other session opens a new
 * session inheriting its folder/provider/type.
 */
export function openNewChatOrQuickChat(sessionsService: ISessionsService): void {
	const activeSession = sessionsService.activeSession.get();

	if (activeSession?.isQuickChat?.get()) {
		sessionsService.openQuickChat(activeSession.sessionType
			? { providerId: activeSession.providerId, sessionTypeId: activeSession.sessionType }
			: undefined);
		return;
	}

	sessionsService.openNewSession({
		folderUri: activeSession?.workspace.get()?.uri,
		providerId: activeSession?.providerId,
		sessionTypeId: activeSession?.sessionType,
	});
}
