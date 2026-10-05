/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../base/common/stopwatch.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { AgentHostClientType } from '../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext, type IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { IAgentHostChatContributions } from '../common/agentHostChatContributionsService.js';
import { ActionType } from '../common/state/sessionActions.js';
import type { ChatTurnStartedAction } from '../common/state/protocol/actions.js';
import { createErrorResponsePart, parseRequiredSessionUriFromChatUri, type ErrorInfo, type Message, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { startTurn } from './agentHostTurnStarter.js';

export const IAgentHostTurnService = createDecorator<IAgentHostTurnService>('agentHostTurnService');

/** An active host-authored turn whose provider execution has not started yet. */
export interface IDeferredAgentHostTurn {
	readonly turnId: string;
}

/** Starts host-authored turns through the standard admission and provider-send path. */
export interface IAgentHostTurnService {
	readonly _serviceBrand: undefined;
	startTurnMessage(chat: URI, message: Message): void;
	beginDeferredTurnMessage(chat: URI, message: Message): IDeferredAgentHostTurn;
	continueDeferredTurnMessage(chat: URI, turn: IDeferredAgentHostTurn, message: Message): boolean;
	failDeferredTurnMessage(chat: URI, turn: IDeferredAgentHostTurn, error: ErrorInfo): boolean;
	handleTurnStarted(channel: ProtocolURI, action: ChatTurnStartedAction, clientId?: string, clientContextOrType?: IAgentHostClientTelemetryContext | AgentHostClientType): void;
}

/** Standard turn admission and provider routing shared by client- and host-authored turns. */
export class AgentHostTurnService implements IAgentHostTurnService {

	declare readonly _serviceBrand: undefined;

	private readonly _deferredTurns = new Map<ProtocolURI, ChatTurnStartedAction>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	startTurnMessage(chat: URI, message: Message): void {
		const channel = chat.toString();
		const action = this._dispatchTurnStarted(channel, message);
		this.handleTurnStarted(channel, action);
	}

	beginDeferredTurnMessage(chat: URI, message: Message): IDeferredAgentHostTurn {
		const channel = chat.toString();
		if (this._deferredTurns.has(channel) || this._stateManager.getActiveTurnId(channel) !== undefined) {
			throw new Error(`Cannot defer another turn while a turn is active: ${channel}`);
		}
		const action = this._dispatchTurnStarted(channel, message);
		this._deferredTurns.set(channel, action);
		return { turnId: action.turnId };
	}

	continueDeferredTurnMessage(chat: URI, turn: IDeferredAgentHostTurn, message: Message): boolean {
		const channel = chat.toString();
		const action = this._getDeferredTurn(channel, turn);
		if (!action) {
			return false;
		}
		if (this._stateManager.getActiveTurnId(channel) !== action.turnId) {
			this._deferredTurns.delete(channel);
			return false;
		}
		this.handleTurnStarted(channel, { ...action, message });
		this._deferredTurns.delete(channel);
		return true;
	}

	failDeferredTurnMessage(chat: URI, turn: IDeferredAgentHostTurn, error: ErrorInfo): boolean {
		const channel = chat.toString();
		const action = this._getDeferredTurn(channel, turn);
		if (!action) {
			return false;
		}
		if (this._stateManager.getActiveTurnId(channel) !== action.turnId) {
			this._deferredTurns.delete(channel);
			return false;
		}
		this._stateManager.dispatchServerAction(channel, {
			type: ActionType.ChatError,
			turnId: action.turnId,
			duration: Math.max(0, Date.now() - Date.parse(action.startedAt)),
			part: createErrorResponsePart(error),
		});
		this._chatContributions.turnEnd({
			session: parseRequiredSessionUriFromChatUri(channel),
			channel,
			turnId: action.turnId,
			reason: { kind: 'error', error, resumable: false },
		});
		this._deferredTurns.delete(channel);
		return true;
	}

	handleTurnStarted(channel: ProtocolURI, action: ChatTurnStartedAction, clientId?: string, clientContextOrType?: IAgentHostClientTelemetryContext | AgentHostClientType): void {
		const host = this._chatContributions.getHost();
		if (!host) {
			throw new Error('Agent Host turn routing is unavailable.');
		}
		const sessionChannel = parseRequiredSessionUriFromChatUri(channel);
		const turnStopWatch = StopWatch.create(false);
		const clientContext = clientContextOrType === undefined
			? {
				...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown),
				hostLaunchKind: host.hostLaunchKind,
			}
			: typeof clientContextOrType === 'string'
				? createUnknownAgentHostClientTelemetryContext(clientContextOrType)
				: clientContextOrType;
		const started = this._instantiationService.invokeFunction(startTurn, {
			session: sessionChannel,
			chat: channel,
			turnChannel: channel,
			turnId: action.turnId,
			message: action.message,
			source: 'direct',
			clientId,
			clientContext,
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
			message: action.message,
			turnId: action.turnId,
			senderClientId: clientId,
			clientContext,
			turnStopWatch,
		});
	}

	private _dispatchTurnStarted(channel: ProtocolURI, message: Message): ChatTurnStartedAction {
		const action: ChatTurnStartedAction = {
			type: ActionType.ChatTurnStarted,
			turnId: generateUuid(),
			startedAt: new Date().toISOString(),
			message,
		};
		this._stateManager.dispatchServerAction(channel, action);
		return action;
	}

	private _getDeferredTurn(channel: ProtocolURI, turn: IDeferredAgentHostTurn): ChatTurnStartedAction | undefined {
		const action = this._deferredTurns.get(channel);
		if (action?.turnId !== turn.turnId) {
			return undefined;
		}
		return action;
	}
}
