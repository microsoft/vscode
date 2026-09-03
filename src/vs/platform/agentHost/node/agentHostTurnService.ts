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
import { parseRequiredSessionUriFromChatUri, type Message, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { startTurn } from './agentHostTurnStarter.js';

export const IAgentHostTurnService = createDecorator<IAgentHostTurnService>('agentHostTurnService');

/** Starts host-authored turns through the standard admission and provider-send path. */
export interface IAgentHostTurnService {
	readonly _serviceBrand: undefined;
	startTurnMessage(chat: URI, message: Message): void;
	handleTurnStarted(channel: ProtocolURI, action: ChatTurnStartedAction, clientId?: string, clientContextOrType?: IAgentHostClientTelemetryContext | AgentHostClientType): void;
}

/** Standard turn admission and provider routing shared by client- and host-authored turns. */
export class AgentHostTurnService implements IAgentHostTurnService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	startTurnMessage(chat: URI, message: Message): void {
		const channel = chat.toString();
		const action = {
			type: ActionType.ChatTurnStarted,
			turnId: generateUuid(),
			startedAt: new Date().toISOString(),
			message,
		} as const;
		this._stateManager.dispatchServerAction(channel, action);
		this.handleTurnStarted(channel, action);
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
}
