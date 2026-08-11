/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { ISessionOpenerParticipant, ISessionOpenOptions, sessionOpenerRegistry } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsOpener.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

/** Routes session open requests through the Agents window session services. */
class SessionsOpenerParticipant implements ISessionOpenerParticipant {

	async handleOpenSession(accessor: ServicesAccessor, session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<boolean> {
		return this.handleOpenSessionResource(accessor, session.resource, openOptions);
	}

	async handleOpenSessionResource(accessor: ServicesAccessor, resource: URI, openOptions?: ISessionOpenOptions): Promise<boolean> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsService = accessor.get(ISessionsService);
		const target = sessionsManagementService.getSession(resource);
		if (!target) {
			return false;
		}

		await sessionsService.openSession(resource, { preserveFocus: openOptions?.editorOptions?.preserveFocus });
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
