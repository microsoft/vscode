/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../../base/common/async.js';
import { Disposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { type IPersistedTurnRecord, type ISessionDatabase, ISessionDataService } from '../../../common/sessionDataService.js';
import { isAhpChatChannel, type Turn } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostLocalTurns, parsePersistedTurn } from '../../agentHostLocalTurns.js';

const persistedFailedTurnIds = createChatMementoKey<Set<string>>('persistedFailedTurns.ids', () => new Set());

/**
 * Persists turns that completed with an error before their provider transcript
 * could record them, then overlays those turns when the provider has no copy.
 */
export class PersistedFailedTurnsContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'persistedFailedTurns';
	readonly order = 110;

	private readonly _mutationSequencer = new SequencerByKey<string>();

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostLocalTurns private readonly _localTurns: IAgentHostLocalTurns,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onTurnEnd(ended: ITurnEnd): void {
		if (!isAhpChatChannel(ended.channel) || !ended.turnId) {
			return;
		}
		const turnId = ended.turnId;
		const knownTurnIds = this._context.memento(persistedFailedTurnIds, ended.channel).get();
		if (ended.reason.kind === 'success') {
			if (knownTurnIds.delete(turnId)) {
				this._enqueueMutation(ended.channel, turnId, () => this._delete(ended.session, turnId));
			}
			return;
		}
		if (ended.reason.kind !== 'error' || ended.reason.resumable) {
			return;
		}

		const turns = this._stateManager.getChatState(ended.channel)?.turns;
		const turn = turns?.find(candidate => candidate.id === turnId);
		if (!turn || !turns) {
			return;
		}
		const anchorTurnId = this._localTurns.findAnchorTurnId(ended.channel, turns, turn.id);
		knownTurnIds.add(turn.id);
		this._enqueueMutation(ended.channel, turn.id, () => this._persist(ended.session, ended.channel, turn, anchorTurnId));
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		const records = await this._read(context.session, context.chat);
		if (records.length === 0) {
			return turns;
		}

		const existing = new Set(turns.map(turn => turn.id));
		const restored: Turn[] = [...turns];
		const knownTurnIds = this._context.memento(persistedFailedTurnIds, context.chat).get();
		for (const record of records) {
			knownTurnIds.add(record.turnId);
			if (existing.has(record.turnId)) {
				knownTurnIds.delete(record.turnId);
				this._enqueueMutation(context.chat, record.turnId, () => this._delete(context.session, record.turnId));
				continue;
			}
			const turn = parsePersistedTurn(record, this._logService, PersistedFailedTurnsContribution.id);
			if (!turn) {
				continue;
			}
			const anchorIndex = record.anchorTurnId === undefined ? -1 : restored.findIndex(candidate => candidate.id === record.anchorTurnId);
			if (record.anchorTurnId !== undefined && anchorIndex === -1) {
				this._logService.warn(`[PersistedFailedTurnsContribution] Skipping failed turn ${record.turnId} because its anchor is unavailable`);
				continue;
			}
			restored.splice(anchorIndex + 1, 0, turn);
			existing.add(turn.id);
		}
		return restored;
	}

	private _enqueueMutation(chat: string, turnId: string, mutation: () => Promise<void>): void {
		void this._mutationSequencer.queue(chat, mutation).catch(error => {
			this._logService.warn(`[PersistedFailedTurnsContribution] Failed to update persisted failed turn ${turnId}`, error);
		});
	}

	private async _persist(session: string, chat: string, turn: Turn, anchorTurnId: string | undefined): Promise<void> {
		let ref: IReference<ISessionDatabase>;
		try {
			ref = this._sessionDataService.openDatabase(URI.parse(session));
		} catch (error) {
			this._logService.warn(`[PersistedFailedTurnsContribution] Failed to open database for ${chat}`, error);
			return;
		}
		const record: IPersistedTurnRecord = { kind: 'failed', turnId: turn.id, chatUri: chat, anchorTurnId, payload: JSON.stringify(turn) };
		try {
			await ref.object.insertPersistedTurn(record);
		} finally {
			ref.dispose();
		}
	}

	private async _delete(session: string, turnId: string): Promise<void> {
		let ref: IReference<ISessionDatabase>;
		try {
			ref = this._sessionDataService.openDatabase(URI.parse(session));
		} catch (error) {
			this._logService.warn(`[PersistedFailedTurnsContribution] Failed to open database to delete failed turn ${turnId}`, error);
			return;
		}
		try {
			await ref.object.deletePersistedTurns([turnId]);
		} finally {
			ref.dispose();
		}
	}

	private async _read(session: string, chat: string): Promise<Array<IPersistedTurnRecord & { seq: number }>> {
		const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(session));
		if (!ref) {
			return [];
		}
		try {
			return (await ref.object.getPersistedTurns()).filter(record => record.kind === 'failed' && record.chatUri === chat);
		} catch (error) {
			this._logService.warn(`[PersistedFailedTurnsContribution] Failed to read persisted failed turns for ${chat}`, error);
			return [];
		} finally {
			ref.dispose();
		}
	}
}
