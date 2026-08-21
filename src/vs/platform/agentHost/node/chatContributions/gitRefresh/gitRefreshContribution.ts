/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentHostChatContributionRegistry, IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../chatContribution.js';

/** Notifies the host to refresh the owning session's git state after success. */
class GitRefreshContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'gitRefresh';
	readonly order = 300;

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success') {
			this._context.notifyTurnComplete(turn.session);
		}
	}
}

AgentHostChatContributionRegistry.register(GitRefreshContribution);
