/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { DEFAULT_CHAT_ID } from '../../../../platform/agentHost/common/state/sessionState.js';
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
		const sessionResource = resource.with({ fragment: '' });
		let target = sessionsManagementService.getSession(sessionResource);
		if (!target && resource.fragment) {
			const connectionsService = accessor.get(IAgentHostConnectionsService);
			const identity = connectionsService.resolveSessionResourceIdentity(sessionResource);
			if (identity) {
				target = sessionsManagementService.getSessions().find(session => {
					const candidate = connectionsService.resolveSessionResourceIdentity(session.resource);
					return candidate?.connectionAuthority === identity.connectionAuthority && isEqual(candidate.backendSession, identity.backendSession);
				});
			}
		}
		if (!target) {
			return false;
		}

		if (resource.fragment) {
			const chatResource = resource.fragment === DEFAULT_CHAT_ID ? target.mainChat.get().resource : target.resource.with({ fragment: resource.fragment });
			await sessionsService.openChat(target, chatResource, { preserveFocus: openOptions?.editorOptions?.preserveFocus, source: 'link' });
		} else {
			await sessionsService.openSession(resource, { preserveFocus: openOptions?.editorOptions?.preserveFocus, source: 'link' });
		}
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
