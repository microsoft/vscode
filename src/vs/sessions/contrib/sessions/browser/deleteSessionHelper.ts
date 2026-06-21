/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Confirms with the user, then permanently deletes the given sessions via
 * {@link ISessionsManagementService.deleteSession}. Used by provider-specific
 * "Delete..." context-menu actions whose backends do not surface their own
 * confirmation dialog (agent host and local providers). Failures are surfaced
 * via an error dialog and do not abort the remaining deletions.
 */
export async function confirmAndDeleteSessions(accessor: ServicesAccessor, context: ISession | ISession[] | undefined): Promise<void> {
	if (!context) {
		return;
	}
	const sessions = Array.isArray(context) ? context : [context];
	if (sessions.length === 0) {
		return;
	}

	const dialogService = accessor.get(IDialogService);
	const sessionsManagementService = accessor.get(ISessionsManagementService);

	const confirmed = await dialogService.confirm({
		message: sessions.length === 1
			? localize('deleteSession.confirm', "Are you sure you want to delete this session?")
			: localize('deleteSessions.confirm', "Are you sure you want to delete {0} sessions?", sessions.length),
		detail: localize('deleteSession.detail', "This action cannot be undone."),
		primaryButton: localize('deleteSession.delete', "Delete")
	});
	if (!confirmed.confirmed) {
		return;
	}

	for (const session of sessions) {
		try {
			await sessionsManagementService.deleteSession(session);
		} catch (err) {
			dialogService.error(localize('deleteSession.error', "Failed to delete session: {0}", toErrorMessage(err)));
		}
	}
}
