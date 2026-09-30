/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IAppliedClientAction } from '../../../common/agentHostChatContributionsService.js';
import { readSessionIsPromoted, SESSION_IS_PROMOTED_METADATA_KEY, withSessionIsPromoted } from '../../../common/meta/agentSessionPromotionMeta.js';
import { readMessageRetryOf } from '../../../common/meta/agentMessageRetryMeta.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { MessageKind, PendingMessageKind, TurnState } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostSessionMetadataPersistence } from '../../shared/persistSessionMetadata.js';

export class SessionPromotionContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'sessionPromotion';
	// Observe accepted pending messages before QueueDrainContribution can consume them.
	readonly order = 150;

	private readonly _pending = new Map<string, Promise<void>>();
	private readonly _retrySessions = new Set<string>();
	private readonly _retry = this._register(new RunOnceScheduler(() => {
		for (const session of this._retrySessions) {
			this.recordPromotion(session);
		}
	}, 1000));

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostSessionMetadataPersistence private readonly _metadataPersistence: IAgentHostSessionMetadataPersistence,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onDidApplyClientAction({ session, channel, action, isReplay }: IAppliedClientAction): void {
		if (isReplay || (action.type !== ActionType.ChatTurnStarted && action.type !== ActionType.ChatPendingMessageSet)) {
			return;
		}
		if (action.message.origin.kind !== MessageKind.User || readMessageRetryOf(action.message)) {
			return;
		}
		const chat = this._stateManager.getChatState(channel);
		if (action.type === ActionType.ChatTurnStarted) {
			const lastTurn = chat?.turns.at(-1);
			if (action.queuedMessageId || (chat?.activeTurn?.id !== action.turnId
				&& !(lastTurn?.id === action.turnId && lastTurn.state === TurnState.Complete))) {
				return;
			}
		} else if (action.kind === PendingMessageKind.Queued
			? !chat?.queuedMessages?.some(message => message.id === action.id)
			: chat?.steeringMessage?.id !== action.id) {
			return;
		}
		this.recordPromotion(session);
	}

	private recordPromotion(session: string): void {
		void this.promoteSession(session).then(() => this._retrySessions.delete(session)).catch(error => {
			this._logService.error('[SessionPromotion] Failed to persist session promotion', error);
			if (!this._store.isDisposed) {
				this._retrySessions.add(session);
				this._retry.schedule();
			}
		});
	}

	async promoteSession(session: string): Promise<void> {
		const state = this._stateManager.getSessionState(session);
		if (readSessionIsPromoted(state) || this._stateManager.isEphemeralSession(session)) {
			return;
		}
		const pending = this._pending.get(session);
		if (pending) {
			return pending;
		}
		const operation = this._persistPromotion(session);
		this._pending.set(session, operation);
		try {
			await operation;
		} finally {
			this._pending.delete(session);
		}
	}

	private async _persistPromotion(session: string): Promise<void> {
		await this._metadataPersistence.persist(URI.parse(session), { [SESSION_IS_PROMOTED_METADATA_KEY]: 'true' });
		const state = this._stateManager.getSessionState(session);
		if (this._store.isDisposed) {
			return;
		}
		if (state && !readSessionIsPromoted(state)) {
			this._stateManager.setSessionMeta(session, withSessionIsPromoted(state._meta));
		} else if (!state) {
			const summary = this._stateManager.getSurfacedSessionSummary(session);
			if (summary) {
				this._stateManager.updateSurfacedSessionMetadata(session, { ...summary, _meta: withSessionIsPromoted(summary._meta) });
			}
		}
	}
}
