/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../log/common/log.js';
import { IAgentHostChatContributions, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { isAhpChatChannel, isDefaultChatUri } from '../../../common/state/sessionState.js';

/** Refines a chat's automatic title after its first successful turn. */
export class TitleRefinementContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'titleRefinement';
	readonly order = 400;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind !== 'success') {
			return;
		}
		const chat = isAhpChatChannel(turn.channel) && !isDefaultChatUri(turn.channel) ? turn.channel : undefined;
		const host = this._chatContributions.getHost();
		if (!host) {
			this._logService.warn('[TitleRefinementContribution] Chat contribution host is not registered');
			return;
		}
		host.refineTitleFromFirstTurn(turn.session, chat);
	}
}
