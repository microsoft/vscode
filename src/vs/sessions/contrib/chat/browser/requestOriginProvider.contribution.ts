/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { AGENT_HOST_SESSION_LINK_SCHEME } from '../../../../platform/agentHost/common/openSessionLink.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatRequestOriginService } from '../../../../workbench/contrib/chat/common/chatRequestOrigin.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

class SessionsChatRequestOriginProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.chatRequestOriginProvider';

	constructor(
		@IChatRequestOriginService requestOriginService: IChatRequestOriginService,
		@ISessionsService sessionsService: ISessionsService,
		@IOpenerService openerService: IOpenerService,
	) {
		super();
		this._register(requestOriginService.registerOpener({
			open: async origin => {
				if (origin.sourceSessionResource.scheme === AGENT_HOST_SESSION_LINK_SCHEME) {
					return openerService.open(origin.sourceSessionResource);
				}
				await sessionsService.openSession(origin.sourceSessionResource, { source: 'chat' });
				return true;
			},
		}));
	}
}

registerWorkbenchContribution2(SessionsChatRequestOriginProviderContribution.ID, SessionsChatRequestOriginProviderContribution, WorkbenchPhase.BlockRestore);
