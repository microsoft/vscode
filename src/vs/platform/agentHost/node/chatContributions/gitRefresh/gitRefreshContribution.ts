/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../log/common/log.js';
import { IAgentHostChatContributions, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';

/** Notifies the host to refresh the owning session's git state after success. */
export class GitRefreshContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'gitRefresh';
	readonly order = 300;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success') {
			const host = this._chatContributions.getHost();
			if (!host) {
				this._logService.warn('[GitRefreshContribution] Chat contribution host is not registered');
				return;
			}
			host.notifyTurnComplete(turn.session);
		}
	}
}
