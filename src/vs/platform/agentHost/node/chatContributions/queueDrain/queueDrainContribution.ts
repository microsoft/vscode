/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentHostClientType } from '../../../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../../common/agentHostTelemetry.js';
import { IAgentHostChatContributions, createChatMementoKey, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAgentHostChatContributionHost, type IObservedAction, type IQueuedMessageSender, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri, PendingMessageKind, ResponsePartKind, type Message, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { createAgentChatContext } from '../../agentChatContext.js';
import { IAgentHostProviderLocator } from '../../agentHostProviderLocator.js';
import { IAgentHostSessionTitleController } from '../../agentHostSessionTitleController.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter } from '../../agentHostTelemetryReporter.js';
import { getTurnTelemetryContext } from '../../agentHostTurnTelemetryContext.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../agentHostTurnTracker.js';
import { AgentHostLocalCommands, IAgentHostLocalCommands } from '../../localCommands/localChatCommand.js';

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
		@IAgentHostProviderLocator private readonly _providerLocator: IAgentHostProviderLocator,
		@IAgentHostSessionTitleController private readonly _titleController: IAgentHostSessionTitleController,
		@IAgentHostTelemetryReporter private readonly _telemetryReporter: AgentHostTelemetryReporter,
		@IAgentHostTurnTracker private readonly _turnTracker: AgentHostTurnTracker,
		@IAgentHostLocalCommands private readonly _localCommands: AgentHostLocalCommands,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success' || turn.reason.kind === 'localCommand') {
			this._tryConsumeNextQueuedMessage(turn.channel);
		}
	}

	onAction(observed: IObservedAction): void {
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
		this._providerLocator.getAgent(session)?.setPendingMessages?.(URI.parse(channel), state.steeringMessage, []);
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
		const handled = this._localCommands.tryHandle({ turnChannel: channel, turnId, text: message.text });
		if (handled) {
			if (handled.suggestedTitle !== undefined) {
				this._titleController.seedProvisionalTitle(sessionChannel, handled.suggestedTitle, channel);
			}
			return;
		}

		this._titleController.seedTitleFromFirstMessage(sessionChannel, message.text, channel);
		const agent = this._providerLocator.getAgent(sessionChannel);
		if (!agent) {
			this._stateManager.dispatchServerAction(channel, {
				type: ActionType.ChatError,
				turnId,
				duration: Math.max(0, turnStopWatch.elapsed()),
				part: { kind: ResponsePartKind.Error, error: { errorType: 'noAgent', message: 'No agent found for session' } },
			});
			return;
		}

		const state = this._stateManager.getSessionState(channel);
		this._telemetryReporter.userMessageSent(agent.id, sender.clientId, sender.clientContext, channel, turnId, state, 'queued', message);
		const { model, modelTelemetryKind, modelSelectionKind, permissionLevel, interactionMode } = getTurnTelemetryContext(agent, channel, createAgentChatContext(this._stateManager, sessionChannel, channel), state, message.model?.id);
		this._turnTracker.turnStarted(agent, channel, turnId, model, modelTelemetryKind, modelSelectionKind, permissionLevel, interactionMode, sender.clientContext, sender.clientId);
		host.sendTurnMessage({
			agent,
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
