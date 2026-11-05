/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentSession } from '../../../common/agent.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IIncomingRequest, IncomingRequestDisposition } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

/** Rejects broken sessions before local commands or provider execution. */
export class WorktreeFailureContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'worktreeFailure';
	readonly order = 25;

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		const error = this._worktree.getCreationError(AgentSession.id(request.session));
		return error ? { kind: 'reject', error: { errorType: 'workingDirectoryFailed', message: error.message }, stage: 'workingDirectory' } : undefined;
	}
}
