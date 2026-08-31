/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentHostClientType } from '../../../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../../common/agentHostTelemetry.js';
import { IAgentHostChatContributions, createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAgentHostChatContributionHost, type IAppliedClientAction, type IQueuedMessageSender, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { getErrorResponsePart, isAhpChatChannel, parseRequiredSessionUriFromChatUri, PendingMessageKind, TurnState, type Message, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { startTurn } from '../../agentHostTurnStarter.js';

const QueuedSender = createChatMementoKey<IQueuedMessageSender | undefined, [messageId: string]>('queueDrain.sender', () => undefined);

/** Owns queued-message sender state and decides when a queued turn can be admitted. */
export class QueueDrainContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'queueDrain';
	readonly order = 200;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success' || turn.reason.kind === 'localCommand') {
			this._tryConsumeNextQueuedMessage(turn.channel);
		}
	}

	onDidApplyClientAction(observed: IAppliedClientAction): void {
		if (!isAhpChatChannel(observed.channel)) {
			return;
		}

		const action = observed.action;
		switch (action.type) {
			case ActionType.ChatPendingMessageSet: {
				const queuedMessageExists = this._stateManager.getChatState(observed.channel)?.queuedMessages?.some(message => message.id === action.id) === true;
				if (action.kind === PendingMessageKind.Queued && queuedMessageExists) {
					this._context.memento(QueuedSender, observed.channel, action.id).set({
						clientId: observed.clientId,
						clientContext: observed.clientContext,
					}, undefined);
				}
				this._syncPendingMessages(observed.channel);
				break;
			}
			case ActionType.ChatPendingMessageRemoved: {
				if (action.kind === PendingMessageKind.Queued) {
					this._context.deleteMemento(QueuedSender, observed.channel, action.id);
				}
				this._syncPendingMessages(observed.channel);
				break;
			}
			case ActionType.ChatQueuedMessagesReordered:
				this._syncPendingMessages(observed.channel);
				break;
		}
	}

	private _syncPendingMessages(channel: ProtocolURI): void {
		const state = this._stateManager.getSessionState(channel);
		if (!state) {
			return;
		}
		const host = this._getHost();
		if (!host) {
			return;
		}
		const session = parseRequiredSessionUriFromChatUri(channel);
		this._providerService.getProviderForSession(session)?.setPendingMessages?.(URI.parse(channel), state.steeringMessage, []);
		this._tryConsumeNextQueuedMessage(channel);
	}

	private _tryConsumeNextQueuedMessage(channel: ProtocolURI): void {
		if (this._stateManager.getActiveTurnId(channel)) {
			return;
		}
		const state = this._stateManager.getSessionState(channel);
		if (!state?.queuedMessages?.length || state.steeringMessage) {
			return;
		}
		const latestTurn = state.turns.at(-1);
		if (latestTurn?.state === TurnState.Error && getErrorResponsePart(latestTurn)?.resumable) {
			return;
		}
		const host = this._getHost();
		if (!host) {
			return;
		}
		const message = state.queuedMessages[0];
		const sender = this._context.memento(QueuedSender, channel, message.id).get() ?? {
			clientId: undefined,
			clientContext: {
				...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown),
				hostLaunchKind: host.hostLaunchKind,
			},
		};
		// Drop the entry rather than blanking it: the memento is keyed by message
		// id, so a long-lived chat would otherwise retain one per message queued.
		this._context.deleteMemento(QueuedSender, channel, message.id);
		this._admitQueuedTurn(host, channel, message.message, message.id, sender);
	}

	private _admitQueuedTurn(host: IAgentHostChatContributionHost, channel: ProtocolURI, message: Message, messageId: string, sender: IQueuedMessageSender): void {
		const sessionChannel = parseRequiredSessionUriFromChatUri(channel);
		const turnId = generateUuid();
		this._stateManager.dispatchServerAction(channel, {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message,
			queuedMessageId: messageId,
		});
		const turnStopWatch = StopWatch.create(false);
		const started = this._instantiationService.invokeFunction(startTurn, {
			session: sessionChannel,
			chat: channel,
			turnChannel: channel,
			turnId,
			message,
			source: 'queued',
			clientId: sender.clientId,
			clientContext: sender.clientContext,
			turnStopWatch,
		});
		if (!started) {
			return;
		}
		host.sendTurnMessage({
			agent: started.agent,
			sessionChannel,
			turnChannel: channel,
			chat: channel,
			message,
			turnId,
			senderClientId: sender.clientId,
			clientContext: sender.clientContext,
			turnStopWatch,
		});
	}

	private _getHost() {
		const host = this._chatContributions.getHost();
		if (!host) {
			this._logService.warn('[QueueDrainContribution] Chat contribution host is not registered');
		}
		return host;
	}
}
