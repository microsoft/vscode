/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { SessionStatus } from '../../../common/state/sessionState.js';
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
		// Deliberately ignore agent turn outcomes: success, cancellation, and
		// error all retain the current behavior of marking a read session unread.
		// Local commands deliberately preserve the existing read state.
		if (turn.reason.kind === 'localCommand') {
			return;
		}
		// Route subagent turns to their owning session too (a background subagent
		// can complete after the parent turn). Each client keeps its active session
		// read; marking it unread is idempotent.
		const status = this._stateManager.getSessionSummary(turn.session)?.status ?? 0;
		if (!(status & SessionStatus.IsRead)) {
			return;
		}
		// Persistence rides the envelope observer set up in the constructor.
		this._stateManager.dispatchServerAction(turn.session, { type: ActionType.SessionIsReadChanged, isRead: false });
	}
}
