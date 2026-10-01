/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, isDefaultChatUri, SessionStatus } from '../../../common/state/sessionState.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostPeerChatPersistenceService } from '../../agentHostPeerChatStore.js';

/** Marks a read session unread after a terminal turn outcome. */
export class MarkUnreadContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'markUnread';
	// This hook was originally dispatched after all turn-complete side effects.
	// Keep it as the terminal tail while newer side effects use explicit orders.
	readonly order = 500;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostPeerChatPersistenceService private readonly _peerChatPersistenceService: IAgentHostPeerChatPersistenceService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		// Rejected requests never ran; marking an archived session unread would resurface it. Local commands preserve read state.
		if (turn.reason.kind === 'localCommand' || turn.reason.kind === 'rejected') {
			return;
		}
		if (isAhpChatChannel(turn.channel) && !isDefaultChatUri(turn.channel)) {
			void this._peerChatPersistenceService.setRead(URI.parse(turn.session), URI.parse(turn.channel), false)
				.catch(error => this._logService.error(error, `[MarkUnreadContribution] Failed to persist unread state for ${turn.channel}`));
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
