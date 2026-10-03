/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, isChatInSessionReadAggregate, SessionStatus } from '../../../common/state/sessionState.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Marks a read session unread after a terminal turn outcome. */
export class MarkUnreadContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'markUnread';
	// This hook was originally dispatched after all turn-complete side effects.
	// Keep it as the terminal tail while newer side effects use explicit orders.
	readonly order = 500;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		// Rejected requests never ran; marking an archived session unread would resurface it. Local commands preserve read state.
		if (turn.reason.kind === 'localCommand' || turn.reason.kind === 'rejected') {
			return;
		}
		const session = this._stateManager.getSessionState(turn.session);
		const chatSummary = isAhpChatChannel(turn.channel)
			? session?.chats.find(chat => chat.resource === turn.channel)
			: undefined;
		const isKnownChat = !!chatSummary;
		if (isKnownChat) {
			this._stateManager.dispatchServerAction(turn.channel, { type: ActionType.ChatIsReadChanged, isRead: false });
		}
		if (!isChatInSessionReadAggregate(turn.channel, chatSummary?.origin)) {
			return;
		}
		const status = this._stateManager.getSessionSummary(turn.session)?.status ?? 0;
		if (!(status & SessionStatus.IsRead)) {
			return;
		}
		// Persistence rides the envelope observer set up in the constructor.
		this._stateManager.dispatchServerAction(turn.session, { type: ActionType.SessionIsReadChanged, isRead: false });
	}
}
