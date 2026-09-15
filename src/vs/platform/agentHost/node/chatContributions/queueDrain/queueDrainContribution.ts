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
import { ISessionWorkspaceConversionService } from '../sessionWorkspaceConversion/sessionWorkspaceConversionService.js';
import { IAgentHostCanvasesService } from '../../agentHostCanvasesService.js';

const QueuedSender = createChatMementoKey<IQueuedMessageSender | undefined, [messageId: string]>('queueDrain.sender', () => undefined);
const InitializationFailed = createChatMementoKey<boolean>('queueDrain.initializationFailed', () => false);

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
		@ISessionWorkspaceConversionService private readonly _conversionService: ISessionWorkspaceConversionService,
		@IAgentHostCanvasesService private readonly _canvases: IAgentHostCanvasesService,
	) {
		super();
		this._register(this._canvases.onDidReleaseHold(session => {
			for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
				this._tryConsumeNextQueuedMessage(chat.resource);
			}
		}));
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
		this._context.memento(InitializationFailed, channel).set(false, undefined);
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
		if (this._conversionService.isPending(channel) || this._canvases.isChatInitializing(channel) || this._stateManager.getDeferredTurnId(channel)
			|| this._context.memento(InitializationFailed, channel).get()) {
			return;
		}
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
		this._admitQueuedTurn(host, channel, message.message, message.id, sender);
	}

	private _admitQueuedTurn(host: IAgentHostChatContributionHost, channel: ProtocolURI, message: Message, messageId: string, sender: IQueuedMessageSender, turnId = generateUuid(), prepared = false): void {
		const sessionChannel = parseRequiredSessionUriFromChatUri(channel);
		if (!prepared && this._canvases.needsTurnInitialization(channel)) {
			const disposition = this._chatContributions.incomingRequest({
				phase: 'preparation', session: sessionChannel, chat: channel, turnChannel: channel, turnId, message,
				source: 'queued', clientId: sender.clientId, clientContext: sender.clientContext,
			});
			if (disposition.kind === 'reject') {
				return;
			}
			if (disposition.kind === 'accept') {
				const preparation = this._canvases.beginTurnPreparation(channel, turnId, sender.clientId);
				const generation = this._stateManager.getChatGeneration(channel);
				void preparation.run(message.text).then(() => {
					preparation.commit();
					if (this._stateManager.getChatState(channel)?.queuedMessages?.some(queued => queued.id === messageId)) {
						this._admitQueuedTurn(host, channel, message, messageId, sender, turnId, true);
					}
				}).catch(error => {
					if (generation === this._stateManager.getChatGeneration(channel)) {
						this._context.memento(InitializationFailed, channel).set(true, undefined);
					}
					this._logService.warn('[QueueDrainContribution] Canvas initialization failed; the queued message was not sent', error);
				}).finally(() => preparation.dispose());
				return;
			}
		}
		this._context.deleteMemento(QueuedSender, channel, messageId);
		const action = {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message,
			queuedMessageId: messageId,
		} as const;
		if (prepared && this._providerService.getProviderForSession(sessionChannel)?.canvases?.defersHostTurnStart) {
			this._stateManager.deferTurn(channel, action, undefined, sender.clientContext, () => { });
		} else {
			this._stateManager.dispatchServerAction(channel, action);
		}
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
