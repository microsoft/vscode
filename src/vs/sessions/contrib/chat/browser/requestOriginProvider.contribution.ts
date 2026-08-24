/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatRequestOriginService } from '../../../../workbench/contrib/chat/common/chatRequestOrigin.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

class SessionsChatRequestOriginProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.chatRequestOriginProvider';

	constructor(
		@IChatRequestOriginService requestOriginService: IChatRequestOriginService,
		@ISessionsService sessionsService: ISessionsService,
	) {
		super();
		this._register(requestOriginService.registerOpener({
			open: async origin => {
				await sessionsService.openSession(origin.sourceSessionResource);
				return true;
			},
		}));
	}
}

registerWorkbenchContribution2(SessionsChatRequestOriginProviderContribution.ID, SessionsChatRequestOriginProviderContribution, WorkbenchPhase.BlockRestore);
