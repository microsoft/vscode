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
import type { IAgentPendingMessageSender } from '../../../common/agent.js';
import { getPendingSteeringMessages } from '../../../common/agentSessionMessage.js';
import { AgentHostClientType } from '../../../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../../common/agentHostTelemetry.js';
import { IAgentHostChatContributions, createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAgentHostChatContributionHost, type IAppliedClientAction, type IDispatchedAction, type IQueuedMessageSender, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ActionType, isChatAction, type ChatAction, type ChatPendingMessageSetAction } from '../../../common/state/sessionActions.js';
import { getErrorResponsePart, isAhpChatChannel, parseRequiredSessionUriFromChatUri, PendingMessageKind, TurnState, type Message, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../agentHostTurnTracker.js';
import { startTurn } from '../../agentHostTurnStarter.js';
import { ISessionWorkspaceConversionService } from '../sessionWorkspaceConversion/sessionWorkspaceConversionService.js';

const QueuedSender = createChatMementoKey<IQueuedMessageSender | undefined, [messageId: string]>('queueDrain.sender', () => undefined);
const SteeringSender = createChatMementoKey<{ readonly messageId: string; readonly sender: IAgentPendingMessageSender } | undefined>('queueDrain.steeringSender', () => undefined);
const ListedSteeringSender = createChatMementoKey<IAgentPendingMessageSender | undefined, [messageId: string]>('queueDrain.listedSteeringSender', () => undefined);
const SubmittedSteering = createChatMementoKey<ReadonlySet<string>>('queueDrain.submittedSteering', () => new Set());
const DeferredLegacySteering = createChatMementoKey<boolean>('queueDrain.deferredLegacySteering', () => false);

/** Owns pending-message synchronization and decides when a queued turn can be admitted. */
export class QueueDrainContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'queueDrain';
	readonly order = 200;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostTurnTracker private readonly _turnTracker: AgentHostTurnTracker,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionWorkspaceConversionService private readonly _conversionService: ISessionWorkspaceConversionService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success' || turn.reason.kind === 'localCommand') {
			this._tryConsumeNextQueuedMessage(turn.channel);
		}
	}

	onDidApplyClientAction(observed: IAppliedClientAction): void {
		if (!isAhpChatChannel(observed.channel) || !isChatAction(observed.action)) {
			return;
		}

		const action = observed.action;
		if (action.type === ActionType.ChatSteeringMessageSet) {
			this._context.memento(ListedSteeringSender, observed.channel, action.steeringMessage.id).set({
				clientId: observed.clientId,
				clientContext: observed.clientContext,
			}, undefined);
		}
		if (action.type === ActionType.ChatPendingMessageSet) {
			if (this._isAcceptedQueuedMessage(observed.channel, action)) {
				this._context.memento(QueuedSender, observed.channel, action.id).set({
					clientId: observed.clientId,
					clientContext: observed.clientContext,
				}, undefined);
			} else if (this._isAcceptedSteeringMessage(observed.channel, action)) {
				this._context.memento(SteeringSender, observed.channel).set({
					messageId: action.id,
					sender: {
						clientId: observed.clientId,
						clientContext: observed.clientContext,
					},
				}, undefined);
			}
		}
		if (this._handlePendingMessageAction(observed.channel, action)) {
			this._tryConsumeNextQueuedMessage(observed.channel);
		}
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.origin || dispatched.rejectionReason || !isAhpChatChannel(dispatched.channel) || !isChatAction(dispatched.action)) {
			return;
		}
		const action = dispatched.action;
		if (!this._handlePendingMessageAction(dispatched.channel, action)) {
			const state = this._stateManager.getChatState(dispatched.channel);
			if (state?.activeTurn && (state.steeringMessage || state.steeringMessages?.length)) {
				const legacyDeferred = this._context.memento(DeferredLegacySteering, dispatched.channel).get();
				const submitted = this._context.memento(SubmittedSteering, dispatched.channel).get();
				if (legacyDeferred || state.steeringMessages?.some(message => !submitted.has(message.id))) {
					this._syncPendingMessages(dispatched.channel, legacyDeferred);
				}
			}
		}
		if (action.type === ActionType.ChatPendingMessageSet && this._isAcceptedQueuedMessage(dispatched.channel, action)) {
			this._tryConsumeNextQueuedMessage(dispatched.channel);
		}
	}

	private _handlePendingMessageAction(channel: ProtocolURI, action: ChatAction): boolean {
		switch (action.type) {
			case ActionType.ChatSteeringMessageSet: {
				const turnId = this._stateManager.getActiveTurnId(channel);
				if (turnId) {
					this._turnTracker.markSteering(channel, turnId, 'received');
				}
				this._syncPendingMessages(channel, false);
				return true;
			}
			case ActionType.ChatSteeringMessageRemoved:
				this._context.deleteMemento(ListedSteeringSender, channel, action.id);
				this._syncPendingMessages(channel, false);
				return true;
			case ActionType.ChatTurnStarted:
				if (action.queuedMessageId) {
					this._context.deleteMemento(ListedSteeringSender, channel, action.queuedMessageId);
				}
				this._syncPendingMessages(channel, this._context.memento(DeferredLegacySteering, channel).get());
				return true;
			case ActionType.ChatPendingMessageSet:
				if (this._isAcceptedSteeringMessage(channel, action)) {
					const turnId = this._stateManager.getActiveTurnId(channel);
					if (turnId) {
						this._turnTracker.markSteering(channel, turnId, 'received');
					}
				}
				this._syncPendingMessages(channel);
				return true;
			case ActionType.ChatPendingMessageRemoved:
				if (action.kind === PendingMessageKind.Queued) {
					this._context.deleteMemento(QueuedSender, channel, action.id);
				} else {
					const steeringSender = this._context.memento(SteeringSender, channel);
					if (steeringSender.get()?.messageId === action.id) {
						steeringSender.set(undefined, undefined);
					}
				}
				this._syncPendingMessages(channel);
				return true;
			case ActionType.ChatQueuedMessagesReordered:
				this._syncPendingMessages(channel);
				return true;
			default:
				return false;
		}
	}

	private _isAcceptedQueuedMessage(channel: ProtocolURI, action: ChatPendingMessageSetAction): boolean {
		return action.kind === PendingMessageKind.Queued
			&& this._stateManager.getChatState(channel)?.queuedMessages?.some(message => message.id === action.id) === true;
	}

	private _isAcceptedSteeringMessage(channel: ProtocolURI, action: ChatPendingMessageSetAction): boolean {
		return action.kind === PendingMessageKind.Steering
			&& this._stateManager.getChatState(channel)?.steeringMessage?.id === action.id;
	}

	private _syncPendingMessages(channel: ProtocolURI, syncLegacyMessage = true): void {
		const state = this._stateManager.getSessionState(channel);
		if (!state) {
			return;
		}
		const host = this._getHost();
		if (!host) {
			return;
		}
		const session = parseRequiredSessionUriFromChatUri(channel);
		const steeringSender = this._context.memento(SteeringSender, channel).get();
		const provider = this._providerService.getProviderForSession(session);
		if (syncLegacyMessage) {
			const accepted = provider?.setPendingMessages?.(
				URI.parse(channel), state.steeringMessage, [],
				steeringSender && steeringSender.messageId === state.steeringMessage?.id ? steeringSender.sender : undefined,
			);
			this._context.memento(DeferredLegacySteering, channel).set(!!state.steeringMessage && accepted === false, undefined);
		}
		const pending = state.steeringMessages ?? [];
		const submitted = this._context.memento(SubmittedSteering, channel);
		const pendingIds = new Set(pending.map(message => message.id));
		submitted.set(new Set([...submitted.get()].filter(id => pendingIds.has(id))), undefined);
		if (!provider?.setPendingMessages || !state.activeTurn) {
			return;
		}
		for (const message of pending) {
			const currentState = this._stateManager.getChatState(channel);
			if (submitted.get().has(message.id) || !currentState?.activeTurn || !getPendingSteeringMessages(currentState).some(pending => pending.id === message.id)) {
				continue;
			}
			submitted.set(new Set([...submitted.get(), message.id]), undefined);
			const sender = this._context.memento(ListedSteeringSender, channel, message.id).get();
			if (provider.setPendingMessages(URI.parse(channel), message, [], sender) === false) {
				submitted.set(new Set([...submitted.get()].filter(id => id !== message.id)), undefined);
			}
		}
	}

	private _tryConsumeNextQueuedMessage(channel: ProtocolURI): void {
		if (this._conversionService.isPending(channel)) {
			return;
		}
		if (this._stateManager.getActiveTurnId(channel)) {
			return;
		}
		const state = this._stateManager.getSessionState(channel);
		if (!state?.queuedMessages?.length || getPendingSteeringMessages(state).length > 0) {
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
