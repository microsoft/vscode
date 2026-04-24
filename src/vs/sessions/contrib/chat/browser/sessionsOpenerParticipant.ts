/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ISessionOpenerParticipant, ISessionOpenOptions, sessionOpenerRegistry } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsOpener.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Routes session open requests in the Agents window through the
 * {@link ISessionsManagementService} so that the active session/chat state is
 * properly updated. Without this, the default opener tries to load the chat
 * directly into the `ChatViewId` view, which is hidden behind a `when` clause
 * tied to the new-chat context keys and may simply do nothing.
 */
class SessionsOpenerParticipant implements ISessionOpenerParticipant {

	async handleOpenSession(accessor: ServicesAccessor, session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<boolean> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const target = sessionsManagementService.getSession(session.resource);
		if (!target) {
			return false;
		}

		await sessionsManagementService.openSession(session.resource, { preserveFocus: openOptions?.editorOptions?.preserveFocus });
		return true;
	}
}

export class SessionsOpenerParticipantContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.sessionOpenerParticipant';

	constructor() {
		super();
		this._register(sessionOpenerRegistry.registerParticipant(new SessionsOpenerParticipant()));
	}
}
