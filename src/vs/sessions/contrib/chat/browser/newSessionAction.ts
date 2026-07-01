/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

/**
 * Opens a new session, inheriting the active session's folder/provider/type as
 * defaults. A quick chat never contributes its folder — it is workspace-less by
 * intent (any scratch working directory must not seed the workspace composer),
 * so it always falls to the New Session composer's folder picker.
 */
export function openNewSessionFromActive(sessionsService: ISessionsService): void {
	const activeSession = sessionsService.activeSession.get();
	const isQuickChat = activeSession?.isQuickChat?.get() ?? false;

	sessionsService.openNewSession({
		folderUri: isQuickChat ? undefined : activeSession?.workspace.get()?.uri,
		providerId: activeSession?.providerId,
		sessionTypeId: activeSession?.sessionType,
	});
}
