/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../log/common/log.js';
import { IAgentHostChatContributions, type IAgentHostChatContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';

/** Starts the next queued message after a successful turn. */
export class QueueDrainContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'queueDrain';
	readonly order = 200;

	constructor(
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success') {
			const host = this._chatContributions.getHost();
			if (!host) {
				this._logService.warn('[QueueDrainContribution] Chat contribution host is not registered');
				return;
			}
			host.drainQueuedMessages(turn.channel);
		}
	}
}
