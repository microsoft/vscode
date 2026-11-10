/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import type { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import type { URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import type { ISessionServerToolMove } from '../../shared/sessionServerTools.js';

export const IAgentHostScheduledChatMoves = createDecorator<IAgentHostScheduledChatMoves>('agentHostScheduledChatMoves');

/**
 * Moves of a calling chat that `move_session` requested, applied when the requesting turn ends, like a workspace
 * change `set_workspace` requests. A move of any other chat is applied at once.
 */
export interface IAgentHostScheduledChatMoves {
	readonly _serviceBrand: undefined;
	/** Schedules {@link move} for when turn {@link turnId} of {@link chat} ends; refuses a second move for that turn. */
	schedule(chat: ProtocolURI, turnId: string, move: ISessionServerToolMove): void;
	/**
	 * Applies the move turn {@link turnId} of {@link chat} scheduled when the turn succeeded, and drops it otherwise.
	 * The chat's queued turns are held from this call until the move is done, so a turn that ending makes start (queue
	 * drain runs later in the same turn end) starts once the chat is where it moved to.
	 */
	turnEnded(chat: ProtocolURI, turnId: string | undefined, succeeded: boolean): void;
}

/** What applies a scheduled move: the host operation `move_session` applies any other move with. */
export interface IAgentHostScheduledChatMoveHost {
	applyChatMove(move: ISessionServerToolMove): Promise<URI>;
}

/** Holds at most one move per chat, for the turn that requested it. */
export class AgentHostScheduledChatMoves extends Disposable implements IAgentHostScheduledChatMoves {

	declare readonly _serviceBrand: undefined;

	private readonly _scheduled = new Map<ProtocolURI, { readonly turnId: string; readonly move: ISessionServerToolMove }>();

	constructor(
		private readonly _host: IAgentHostScheduledChatMoveHost,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// A moved chat stays registered; a deleted one, or one of a removed session, takes its move along.
		this._register(this._stateManager.onDidUnregisterChat(({ chat }) => this._scheduled.delete(chat)));
	}

	schedule(chat: ProtocolURI, turnId: string, move: ISessionServerToolMove): void {
		if (this._scheduled.get(chat)?.turnId === turnId) {
			throw new Error('A move of this chat is already scheduled for when this turn ends.');
		}
		this._scheduled.set(chat, { turnId, move });
	}

	turnEnded(chat: ProtocolURI, turnId: string | undefined, succeeded: boolean): void {
		const scheduled = this._scheduled.get(chat);
		if (!scheduled || scheduled.turnId !== turnId) {
			return;
		}
		this._scheduled.delete(chat);
		if (!succeeded) {
			this._logService.info(`[AgentHostScheduledChatMoves] Dropped the move of ${chat}: its turn ${turnId} did not complete.`);
			return;
		}
		// Taken now, before this turn end's queue drain: the move itself also holds the chat, but only once it runs.
		const admission = this._stateManager.holdChatAdmission([chat]);
		void this._apply(chat, turnId, scheduled.move, admission);
	}

	private async _apply(chat: ProtocolURI, turnId: string | undefined, move: ISessionServerToolMove, admission: IDisposable): Promise<void> {
		try {
			await this._host.applyChatMove(move);
		} catch (error) {
			// The host logs why it refused the move; the chat goes on where it is.
			this._logService.warn(`[AgentHostScheduledChatMoves] The move of ${chat} requested in turn ${turnId} was not applied: ${toErrorMessage(error)}`);
		} finally {
			admission.dispose();
		}
	}
}
