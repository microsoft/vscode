/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

/**
 * Handles `agent-host-session://` links (surfaced by the `create_session` /
 * `create_chat` server tools) by resolving them to the matching Agents-window
 * session and opening it through {@link ISessionsService}. The link carries the
 * backend session URI; the owning session in the window uses a client scheme
 * (e.g. `agent-host-copilotcli`), so matching goes through
 * {@link IAgentHostConnectionsService.resolveSessionResource}. When the link
 * carries a chat id (from `create_chat`), the specific peer chat is opened via
 * {@link ISessionsService.openChat} instead of the whole session.
 */
export class OpenSessionLinkOpenerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.openSessionLinkOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async resource => this._open(resource),
		}));
	}

	private async _open(resource: URI | string): Promise<boolean> {
		const backendSession = parseOpenSessionLinkUri(resource);
		if (!backendSession) {
			return false;
		}
		const session = this._findSession(backendSession);
		if (!session) {
			return false;
		}
		const chatId = parseOpenSessionLinkChatId(resource);
		if (chatId) {
			// Peer chats carry their chatId in the session resource's fragment.
			await this._sessionsService.openChat(session, session.resource.with({ fragment: chatId }));
			return true;
		}
		await this._sessionsService.openSession(session.resource);
		return true;
	}

	private _findSession(backendSession: URI): ISession | undefined {
		const backend = backendSession.toString();
		return this._sessionsManagementService.getSessions().find(session =>
			session.resource.toString() === backend
			|| this._connectionsService.resolveSessionResource(session.resource)?.backendSession.toString() === backend);
	}
}
