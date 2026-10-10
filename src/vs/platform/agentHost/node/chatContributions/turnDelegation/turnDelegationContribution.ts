/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IHydrationContext, IOutgoingTurn } from '../../../common/agentHostChatContributionsService.js';
import { parseAgentMessageDelegationMeta, readAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from '../../../common/meta/agentMessageDelegationMeta.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { chatStorageUri, MessageKind, type Turn } from '../../../common/state/sessionState.js';

/** Persists agent-authored turn delegation and restores it after provider replay. */
export class TurnDelegationContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'turnDelegation';
	readonly order = 50;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<undefined> {
		const delegation = readAgentMessageDelegationMeta(turn.message);
		if (!delegation) {
			return undefined;
		}
		const storage = chatStorageUri(turn.chat);
		if (!storage) {
			return undefined;
		}
		const ref = this._sessionDataService.openDatabase(storage);
		try {
			await ref.object.setTurnDelegation(turn.turnId, JSON.stringify(delegation));
		} finally {
			ref.dispose();
		}
		return undefined;
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		if (turns.length === 0) {
			return turns;
		}
		const storage = chatStorageUri(URI.parse(context.chat));
		if (!storage) {
			return turns;
		}
		const ref = await this._sessionDataService.tryOpenDatabase(storage);
		if (!ref) {
			return turns;
		}
		let delegations: Map<string, string>;
		try {
			delegations = await ref.object.getTurnDelegations();
		} catch (error) {
			this._logService.warn(`[TurnDelegationContribution] Failed to restore turn delegation for ${storage.toString()}`, error);
			return turns;
		} finally {
			ref.dispose();
		}
		if (delegations.size === 0) {
			return turns;
		}
		return turns.map(turn => {
			const raw = delegations.get(turn.id);
			if (!raw) {
				return turn;
			}
			let delegation;
			try {
				delegation = parseAgentMessageDelegationMeta(JSON.parse(raw));
			} catch {
				return turn;
			}
			if (!delegation) {
				return turn;
			}
			return {
				...turn,
				message: {
					...turn.message,
					origin: { kind: MessageKind.Agent },
					_meta: {
						...turn.message._meta,
						...toAgentMessageDelegationMeta(delegation),
					},
				},
			};
		});
	}
}
