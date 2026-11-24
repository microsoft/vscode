/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../../../base/common/errors.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostPolicyContinuationPresenter } from '../../../../chat/browser/agentSessions/agentHost/agentHostPolicyContinuation.js';
import { IChatWidget } from '../../../../chat/browser/chat.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import { IFocusedSessionHostService } from '../../../../../services/sessions/browser/sessionHost.js';
import { LocalAgentHostSessionsProvider } from './localAgentHostSessionsProvider.js';

export class SessionsAgentHostPolicyContinuationPresenter implements IAgentHostPolicyContinuationPresenter {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ISessionsProvidersService private readonly _providers: ISessionsProvidersService,
		@ISessionsService private readonly _sessions: ISessionsService,
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
	) { }

	async open(resource: URI, source: IChatWidget, ensureSourceCurrent: () => void): Promise<void> {
		const sourceResource = source.viewModel?.sessionResource;
		const ensureActiveSource = () => {
			ensureSourceCurrent();
			if (!sourceResource || !isEqual(this._focusedSessionHostService.focusedHost.get().chat.get()?.resource, sourceResource)) {
				throw new CancellationError();
			}
		};
		ensureActiveSource();
		const provider = this._providers.getProvider(LOCAL_AGENT_HOST_PROVIDER_ID);
		if (!(provider instanceof LocalAgentHostSessionsProvider)) {
			throw new Error(localize('agentHost.policyContinuation.providerMissing', "The local agent host is unavailable. Try again to open the copied conversation."));
		}
		const session = await provider.resolveCreatedSession(resource);
		ensureActiveSource();
		if (!await this._sessions.canOpenSession(session)) {
			throw new CancellationError();
		}
		ensureActiveSource();
		await this._sessions.openSession(session.resource);
	}
}
