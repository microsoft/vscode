/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { SessionStatus } from '../../../common/state/sessionState.js';
import { AgentHostChatContributionRegistry, IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../chatContribution.js';

/** Marks a read session unread after a terminal turn outcome. */
class MarkUnreadContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'markUnread';
	// This hook was originally dispatched after all turn-complete side effects.
	// Keep it as the terminal tail while newer side effects use explicit orders.
	readonly order = 500;

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		// Deliberately ignore `reason`: success, cancellation, and error all
		// retain the current behavior of marking a read session unread.
		// Route subagent turns to their owning session too (a background subagent
		// can complete after the parent turn). Each client keeps its active session
		// read; marking it unread is idempotent.
		const status = this._context.getSessionSummary(turn.session)?.status ?? 0;
		if (!(status & SessionStatus.IsRead)) {
			return;
		}
		// Persistence rides the envelope observer set up in the constructor.
		this._context.dispatch(turn.session, { type: ActionType.SessionIsReadChanged, isRead: false });
	}
}

AgentHostChatContributionRegistry.register(MarkUnreadContribution);
