/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostScheduledChatMoves } from './scheduledChatMovesService.js';

/**
 * Applies a move of the calling chat that `move_session` scheduled once the requesting turn succeeded, and drops it
 * when the turn ended any other way. Runs after a workspace change the same turn requested (150) and before queued
 * turns drain (200).
 */
export class ScheduledChatMovesContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'scheduledChatMoves';
	readonly order = 160;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostScheduledChatMoves private readonly _scheduledMoves: IAgentHostScheduledChatMoves,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		// A refused request never started a turn, so no move was scheduled for it.
		if (turn.reason.kind === 'rejected') {
			return;
		}
		this._scheduledMoves.turnEnded(turn.channel, turn.turnId, turn.reason.kind === 'success');
	}
}
