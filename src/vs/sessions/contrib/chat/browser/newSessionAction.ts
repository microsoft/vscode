/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

/**
 * Opens a new session, inheriting the active session's folder/provider/type as
 * defaults. For a workspace-less active session (e.g. a quick chat) the folder
 * is undefined, so it falls to the New Session composer.
 */
export function openNewSessionFromActive(sessionsService: ISessionsService): void {
	const activeSession = sessionsService.activeSession.get();

	sessionsService.openNewSession({
		folderUri: activeSession?.workspace.get()?.uri,
		providerId: activeSession?.providerId,
		sessionTypeId: activeSession?.sessionType,
	});
}
