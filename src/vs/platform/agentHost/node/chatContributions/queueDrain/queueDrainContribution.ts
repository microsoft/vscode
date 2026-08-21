/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentHostChatContributionRegistry, IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../chatContribution.js';

/** Starts the next queued message after a successful turn. */
class QueueDrainContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'queueDrain';
	readonly order = 200;

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success') {
			this._context.drainQueuedMessages(turn.channel);
		}
	}
}

AgentHostChatContributionRegistry.register(QueueDrainContribution);
