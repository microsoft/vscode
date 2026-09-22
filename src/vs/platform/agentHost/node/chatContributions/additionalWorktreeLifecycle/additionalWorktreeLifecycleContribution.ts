/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel } from '../../../common/state/sessionState.js';
import { IAdditionalWorktreeLifecycleService } from './additionalWorktreeLifecycleService.js';

export class AdditionalWorktreeLifecycleContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'additionalWorktreeLifecycle';
	readonly order = 750;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAdditionalWorktreeLifecycleService private readonly _lifecycleService: IAdditionalWorktreeLifecycleService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason
			|| dispatched.action.type !== ActionType.SessionIsArchivedChanged
			|| isAhpChatChannel(dispatched.channel)) {
			return;
		}
		const isArchived = dispatched.action.isArchived;
		const operation = this._lifecycleService.synchronizeArchiveState(URI.parse(dispatched.session), isArchived);
		void operation.catch(error => this._logService.warn(`[AdditionalWorktreeLifecycleContribution] Additional worktree ${isArchived ? 'cleanup' : 'recreate'} failed for ${dispatched.session}`, error));
	}
}
