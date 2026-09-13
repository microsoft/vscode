/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IHydrationContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ISessionDatabase, ISessionDataService } from '../../../common/sessionDataService.js';
import { ActionType, isChatAction, type ChatAction } from '../../../common/state/sessionActions.js';
import { chatStorageUri, hasReportedUsage, isAhpChatChannel, isSubagentChatUri, type Turn, type URI as ProtocolURI, type UsageInfo } from '../../../common/state/sessionState.js';

/** Owns persisted per-turn usage in both directions, recording it live and re-attaching it to restored turns. */
export class PersistedTurnUsageContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'persistedTurnUsage';
	readonly order = 100;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		// A rejected action never reduced, so its payload must not be persisted as though
		// it had. `ChatUsage` is server-only today and cannot be rejected, but the guard
		// keeps that from becoming a silent durable-state bug if it ever becomes
		// client-dispatchable.
		if (dispatched.rejectionReason !== undefined) {
			return;
		}
		if (isAhpChatChannel(dispatched.channel) && isChatAction(dispatched.action)) {
			this._trackTurnUsage(dispatched.channel, dispatched.action);
		}
	}

	/**
	 * Re-attaches persisted per-turn {@link UsageInfo} to reconstructed turns.
	 *
	 * Agent backends don't durably record token/credit usage - the Copilot
	 * SDK's `assistant.usage` event is explicitly ephemeral and the Claude
	 * transcript replay produces none - so restored turns come back without it.
	 * Without this the chat's context-usage gauge stays hidden after a reload
	 * and the session cost total restarts from zero. Usage recorded live by this
	 * contribution is looked up by turn id (or the turn's SDK event id, which is
	 * what a restored turn is keyed by).
	 *
	 * NOTE: the lookup only lands for providers that record the bridge between
	 * the live protocol turn id (a host-generated uuid) and the id a restored
	 * turn is keyed by. Today only Copilot does, via `setTurnEventId`. Claude
	 * restores turns keyed by transcript uuid and never populates
	 * `turns.event_id`, so its rows are written but never matched; giving it a
	 * gauge after reload needs that bridge recorded first.
	 */
	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		const chat = URI.parse(context.chat);
		if (turns.length === 0 || turns.every(turn => hasReportedUsage(turn.usage)) || isSubagentChatUri(chat.toString())) {
			return turns;
		}
		// Same storage the writer used; see `chatStorageUri`.
		const storage = chatStorageUri(chat);
		if (!storage) {
			return turns;
		}
		let usages: Map<string, string>;
		const ref = await this._sessionDataService.tryOpenDatabase(storage);
		if (!ref) {
			return turns;
		}
		try {
			usages = await ref.object.getTurnUsages();
			this._logService.trace(`[AgentService] getTurnUsages done: ${usages.size} row(s) for ${storage.toString()}`);
		} catch (err) {
			this._logService.warn(`[AgentService] Failed to read persisted turn usage for ${storage.toString()}`, err);
			return turns;
		} finally {
			ref.dispose();
		}
		if (usages.size === 0) {
			return turns;
		}
		return turns.map(turn => {
			const raw = hasReportedUsage(turn.usage) ? undefined : usages.get(turn.id);
			if (!raw) {
				return turn;
			}
			try {
				const parsed: unknown = JSON.parse(raw);
				// Never spread an untyped payload blind: a corrupted column
				// holding a string or array would splat index keys onto the
				// turn's usage and flow that malformed shape to the renderer.
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					return turn;
				}
				const persisted = parsed as UsageInfo;
				// Merge rather than replace: a turn that ran on Auto already
				// carries a token-less stub holding `_meta.autoModeResolved`
				// (see `mapSessionEvents`), which drives the "Auto (model)"
				// label. Persisted values win; the stub fills what they lack.
				const meta = { ...turn.usage?._meta, ...persisted._meta };
				return {
					...turn,
					usage: {
						...turn.usage,
						...persisted,
						...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
					},
				};
			} catch {
				return turn;
			}
		});
	}

	/**
	 * Persists the usage reported for a chat's turn.
	 *
	 * Agent backends do not durably record token/credit usage themselves (the
	 * Copilot SDK's `assistant.usage` event is explicitly ephemeral, and the
	 * Claude transcript replay produces none), so a restored session would
	 * otherwise come back with no context-usage gauge and a session cost of 0.
	 * See this contribution's {@link onHydrateTurns} for which providers can
	 * currently match these rows back on restore.
	 *
	 * Written on every report rather than buffered until the turn ends: the row
	 * is keyed by turn id and written with `INSERT OR REPLACE` through a
	 * sequencer, so "last report wins" is already a property of the storage
	 * layer, and persisting eagerly means a turn cut short by a crash or
	 * disconnect keeps the usage it had already accrued.
	 *
	 * Subagent chats are skipped: their cost is already folded into the parent
	 * turn's aggregate, so recording it again would double-count.
	 */
	private _trackTurnUsage(channel: ProtocolURI, action: ChatAction): void {
		if (action.type !== ActionType.ChatUsage || isSubagentChatUri(channel)) {
			return;
		}
		// Usage reported with no active turn carries an empty turn id (see
		// `CopilotAgentSession._turnId`). No turn can ever match it, and no
		// prune path can remove it, so it would be a permanent orphan row.
		if (!action.turnId) {
			return;
		}
		// Agents key their storage by the chat's own URI, which is where the
		// `turns` rows that `getTurnUsages` joins against live.
		const storage = chatStorageUri(channel);
		if (!storage) {
			return;
		}
		let ref: IReference<ISessionDatabase>;
		try {
			ref = this._sessionDataService.openDatabase(storage);
		} catch (err) {
			this._logService.warn(`[AgentSideEffects] Failed to open database to persist turn usage for ${channel}`, err);
			return;
		}
		ref.object.setTurnUsage(action.turnId, JSON.stringify(action.usage)).catch(err => {
			this._logService.warn(`[AgentSideEffects] Failed to persist turn usage for ${channel}/${action.turnId}`, err);
		}).finally(() => ref.dispose());
	}
}
