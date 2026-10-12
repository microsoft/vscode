/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostPolicyContinuationPresenter } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostPolicyContinuation.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { LocalAgentHostSessionsProvider } from './localAgentHostSessionsProvider.js';

export class SessionsAgentHostPolicyContinuationPresenter implements IAgentHostPolicyContinuationPresenter {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ISessionsProvidersService private readonly _providers: ISessionsProvidersService,
		@ISessionsService private readonly _sessions: ISessionsService,
	) { }

	async open(resource: URI): Promise<void> {
		const provider = this._providers.getProvider(LOCAL_AGENT_HOST_PROVIDER_ID);
		if (!(provider instanceof LocalAgentHostSessionsProvider)) {
			throw new Error(localize('agentHost.policyContinuation.providerMissing', "The local agent host is unavailable. Try again to open the copied conversation."));
		}
		const session = await provider.resolveCreatedSession(resource);
		if (!await this._sessions.canOpenSession(session)) {
			throw new CancellationError();
		}
		await this._sessions.openSession(session.resource);
	}
}
