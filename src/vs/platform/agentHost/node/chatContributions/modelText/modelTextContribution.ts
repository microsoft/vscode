/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction, IHydrationContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { readAgentHostCommand, readAgentModelText } from '../../../common/meta/agentMessageMeta.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { chatStorageUri, isAhpChatChannel, type Message, type Turn } from '../../../common/state/sessionState.js';

const metadataPrefix = 'modelText.display.';

export class ModelTextContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'modelText';
	readonly order = 50;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const command = readAgentHostCommand(turn.message);
		const text = command ? `/compact${command.focus ? ` ${command.focus}` : ''}` : readAgentModelText(turn.message);
		if (text !== undefined) {
			await this._persistDisplayText(turn.chat, turn.turnId, turn.message);
		}
		return text === undefined ? undefined : { text };
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		const { action } = dispatched;
		if (dispatched.rejectionReason || !isAhpChatChannel(dispatched.channel) || action.type !== ActionType.ChatTurnStarted
			|| !action.queuedMessageId || readAgentModelText(action.message) === undefined) {
			return;
		}
		void this._persistDisplayText(dispatched.channel, action.turnId, action.message).catch(error => {
			this._logService.warn('[ModelTextContribution] Failed to persist steering display text', error);
		});
	}

	private async _persistDisplayText(chat: string, turnId: string, message: Message): Promise<void> {
		const storage = chatStorageUri(URI.parse(chat));
		if (storage) {
			const store = new DisposableStore();
			try {
				const ref = store.add(this._sessionDataService.openDatabase(storage));
				await ref.object.setMetadata(metadataPrefix + turnId, JSON.stringify({ text: message.text, meta: message._meta }));
			} catch (error) {
				this._logService.warn('[ModelTextContribution] Failed to persist display text', error);
			} finally {
				store.dispose();
			}
		}
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		const storage = chatStorageUri(URI.parse(context.chat));
		if (!storage || turns.length === 0) {
			return turns;
		}
		const store = new DisposableStore();
		try {
			const ref = await this._sessionDataService.tryOpenDatabase(storage);
			if (!ref) {
				return turns;
			}
			store.add(ref);
			const stored = await ref.object.getTurnMetadata(metadataPrefix);
			return turns.map(turn => {
				const raw = stored.get(turn.id);
				if (!raw) {
					return turn;
				}
				let value: unknown;
				try {
					value = JSON.parse(raw);
				} catch (error) {
					this._logService.warn('[ModelTextContribution] Invalid stored display metadata', error);
					return turn;
				}
				const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
				if (!record || typeof record.text !== 'string'
					|| !record.meta || typeof record.meta !== 'object' || Array.isArray(record.meta)) {
					this._logService.warn('[ModelTextContribution] Invalid stored display metadata');
					return turn;
				}
				return { ...turn, message: { ...turn.message, text: record.text, _meta: record.meta as Record<string, unknown> } };
			});
		} finally {
			store.dispose();
		}
	}
}
