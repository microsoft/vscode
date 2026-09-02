/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction, IHydrationContext } from '../../../common/agentHostChatContributionsService.js';
import { ISessionDatabase, ISessionDataService } from '../../../common/sessionDataService.js';
import { ActionType, isChatAction, type ChatAction } from '../../../common/state/sessionActions.js';
import { chatStorageUri, createErrorResponsePart, isAhpChatChannel, isSubagentChatUri, TurnState, type Turn, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Chat metadata key holding the turn the host has in flight; empty once that turn ends. */
export const OPEN_TURN_METADATA_KEY = 'ah.openTurn';

interface IOpenTurnMarker {
	readonly turnId: string;
	readonly startedAt: string;
}

/**
 * Records which turn a chat has in flight so that, after the host dies mid-turn, restore can
 * mark the trailing turn as interrupted even when the provider's replay cannot tell.
 */
export class InterruptedTurnContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'interruptedTurn';
	readonly order = 150;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined || !isAhpChatChannel(dispatched.channel) || !isChatAction(dispatched.action) || isSubagentChatUri(dispatched.channel)) {
			return;
		}
		const marker = this._markerAfter(dispatched.channel, dispatched.action);
		if (marker !== undefined) {
			this._writeMarker(dispatched.channel, marker);
		}
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		if (isSubagentChatUri(context.chat)) {
			return turns;
		}
		const storage = chatStorageUri(context.chat);
		if (!storage) {
			return turns;
		}
		const ref = await this._sessionDataService.tryOpenDatabase(storage);
		if (!ref) {
			return turns;
		}
		try {
			const raw = await ref.object.getMetadata(OPEN_TURN_METADATA_KEY);
			// A marker alongside a live turn belongs to that turn, not to a restore.
			if (!raw || this._stateManager.getChatState(context.chat)?.activeTurn) {
				return turns;
			}
			await ref.object.setMetadata(OPEN_TURN_METADATA_KEY, '');
			return this._markInterruptedTurn(context.chat, turns, parseOpenTurnMarker(raw));
		} catch (err) {
			this._logService.warn(`[InterruptedTurnContribution] Failed to resolve the open turn for ${context.chat}`, err);
			return turns;
		} finally {
			ref.dispose();
		}
	}

	private _markInterruptedTurn(chat: ProtocolURI, turns: readonly Turn[], marker: IOpenTurnMarker | undefined): readonly Turn[] {
		const trailing = turns.at(-1);
		if (!marker || !trailing || trailing.state === TurnState.Error || !isOpenTurn(trailing, marker)) {
			this._logService.info(`[InterruptedTurnContribution] No restored turn matches open turn ${marker?.turnId} for ${chat}`);
			return turns;
		}
		this._logService.info(`[InterruptedTurnContribution] Marking restored turn ${trailing.id} as interrupted for ${chat}`);
		const part = createErrorResponsePart({
			errorType: 'executionInterrupted',
			message: localize('interruptedTurn.hostInterrupted', "The agent was interrupted before this request finished."),
		});
		return [...turns.slice(0, -1), { ...trailing, state: TurnState.Error, responseParts: [...trailing.responseParts, part] }];
	}

	/** The marker an action leaves behind: the newly open turn, `''` once a turn ends, or `undefined` when unaffected. */
	private _markerAfter(channel: ProtocolURI, action: ChatAction): string | undefined {
		switch (action.type) {
			case ActionType.ChatTurnStarted:
				return JSON.stringify({ turnId: action.turnId, startedAt: action.startedAt } satisfies IOpenTurnMarker);
			case ActionType.ChatTurnResume: {
				const activeTurn = this._stateManager.getChatState(channel)?.activeTurn;
				return activeTurn?.id === action.turnId ? JSON.stringify({ turnId: activeTurn.id, startedAt: activeTurn.startedAt } satisfies IOpenTurnMarker) : undefined;
			}
			case ActionType.ChatTurnComplete:
			case ActionType.ChatTurnCancelled:
			case ActionType.ChatError:
			case ActionType.ChatTruncated:
				return '';
			default:
				return undefined;
		}
	}

	private _writeMarker(channel: ProtocolURI, value: string): void {
		const storage = chatStorageUri(channel);
		if (!storage) {
			return;
		}
		let ref: IReference<ISessionDatabase>;
		try {
			ref = this._sessionDataService.openDatabase(storage);
		} catch (err) {
			this._logService.warn(`[InterruptedTurnContribution] Failed to open database to record the open turn for ${channel}`, err);
			return;
		}
		ref.object.setMetadata(OPEN_TURN_METADATA_KEY, value).catch(err => {
			this._logService.warn(`[InterruptedTurnContribution] Failed to record the open turn for ${channel}`, err);
		}).finally(() => ref.dispose());
	}
}

function parseOpenTurnMarker(raw: string): IOpenTurnMarker | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return undefined;
		}
		const { turnId, startedAt } = parsed as Partial<IOpenTurnMarker>;
		return typeof turnId === 'string' && typeof startedAt === 'string' ? { turnId, startedAt } : undefined;
	} catch {
		return undefined;
	}
}

/** Codex persists turn start times in whole seconds, which can floor a turn's start below the host's marker. */
const START_TIME_TOLERANCE_MS = 1000;

/** Matches by id, or by start time for providers whose replay re-keys turns (Claude keys them by transcript uuid). */
function isOpenTurn(turn: Turn, marker: IOpenTurnMarker): boolean {
	if (turn.id === marker.turnId) {
		return true;
	}
	const startedAt = turn.startedAt === undefined ? Number.NaN : Date.parse(turn.startedAt);
	return startedAt + START_TIME_TOLERANCE_MS >= Date.parse(marker.startedAt);
}
