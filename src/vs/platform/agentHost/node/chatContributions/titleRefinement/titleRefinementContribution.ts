/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isAhpChatChannel, isDefaultChatUri } from '../../../common/state/sessionState.js';
import { AgentHostChatContributionRegistry, IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../chatContribution.js';

/** Refines a chat's automatic title after its first successful turn. */
class TitleRefinementContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'titleRefinement';
	readonly order = 400;

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind !== 'success') {
			return;
		}
		const chat = isAhpChatChannel(turn.channel) && !isDefaultChatUri(turn.channel) ? turn.channel : undefined;
		this._context.refineTitleFromFirstTurn(turn.session, chat);
	}
}

AgentHostChatContributionRegistry.register(TitleRefinementContribution);
