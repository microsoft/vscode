/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { StopWatch } from '../../../base/common/stopwatch.js';
import { ServicesAccessor } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import type { IAgent } from '../common/agent.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { IAgentHostChatContributions } from '../common/agentHostChatContributionsService.js';
import { ActionType } from '../common/state/sessionActions.js';
import { createErrorResponsePart, type ErrorInfo, type Message, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { createAgentChatContext } from './agentChatContext.js';
import { IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { IAgentHostSessionTitleController } from './agentHostSessionTitleController.js';
import { getMessageOriginTelemetryKind, IAgentHostTelemetryReporter } from './agentHostTelemetryReporter.js';
import { getTurnTelemetryContext } from './agentHostTurnTelemetryContext.js';
import { IAgentHostTurnTracker } from './agentHostTurnTracker.js';

/** The resolved agent for a turn that has passed host admission. */
export interface IStartedTurn {
	readonly agent: IAgent;
}

/** The host state and client context needed to admit a turn before it is sent. */
export interface ITurnStartRequest {
	readonly session: ProtocolURI;
	readonly chat: ProtocolURI;
	readonly turnChannel: ProtocolURI;
	readonly turnId: string;
	readonly message: Message;
	readonly source: 'direct' | 'queued';
	readonly clientId: string | undefined;
	readonly clientContext: IAgentHostClientTelemetryContext;
	readonly turnStopWatch: StopWatch;
}

/**
 * Admits a turn, records its telemetry, and resolves the provider that will send it.
 * Both the direct (`handleAction`) and queued (`QueueDrainContribution`) admission paths
 * run this, so the preamble has one copy.
 *
 * This is a plain function rather than a service because it holds no state: registering it
 * in DI bought nothing and cost a registration in every hand-built test service graph. Keep
 * it a function unless it acquires state.
 *
 * The gate runs before {@link IAgentHostTurnTracker.turnStarted}, so a refused request has
 * no turn to complete: it reports neither `userMessageSent` nor `turnCompleted`, and does
 * not call `_completeTurn` or clear the tool-call tracker. That is deliberate, not an
 * oversight — a rejection is observable through `onTurnEnd` with `kind === 'rejected'`, so
 * measure rejection volume from a contribution rather than by reviving the turn-completion
 * path.
 */
export function startTurn(accessor: ServicesAccessor, request: ITurnStartRequest): IStartedTurn | undefined {
	const chatContributions = accessor.get(IAgentHostChatContributions);
	const stateManager = accessor.get(IAgentHostStateManager);
	const providerService = accessor.get(IAgentHostProviderService);
	const titleController = accessor.get(IAgentHostSessionTitleController);
	const telemetryReporter = accessor.get(IAgentHostTelemetryReporter);
	const turnTracker = accessor.get(IAgentHostTurnTracker);
	const logService = accessor.get(ILogService);
	const disposition = chatContributions.incomingRequest({
		session: request.session,
		chat: request.chat,
		turnChannel: request.turnChannel,
		message: request.message,
		turnId: request.turnId,
		source: request.source,
		clientId: request.clientId,
		clientContext: request.clientContext,
	});
	if (disposition.kind === 'handled') {
		return undefined;
	}
	if (disposition.kind === 'reject') {
		stateManager.dispatchServerAction(request.turnChannel, {
			type: ActionType.ChatError,
			turnId: request.turnId,
			duration: Math.max(0, request.turnStopWatch.elapsed()),
			part: createErrorResponsePart(disposition.error),
		});
		chatContributions.turnEnd({
			session: request.session,
			channel: request.turnChannel,
			turnId: request.turnId,
			reason: { kind: 'rejected', error: disposition.error },
			clientContext: request.clientContext,
		});
		return undefined;
	}

	const state = stateManager.getSessionState(request.chat);
	if (!state) {
		logService.info(`[AgentHostTurnStarter] Turn started for session not in state manager: ${request.chat}, turnId=${request.turnId} - status/summary updates may be dropped unless the session is restored`);
	}
	titleController.seedTitleFromFirstMessage(request.session, request.message.text, request.chat);

	const agent = providerService.getProviderForSession(request.session);
	if (!agent) {
		const error: ErrorInfo = { errorType: 'noAgent', message: 'No agent found for session' };
		stateManager.dispatchServerAction(request.turnChannel, {
			type: ActionType.ChatError,
			turnId: request.turnId,
			duration: Math.max(0, request.turnStopWatch.elapsed()),
			part: createErrorResponsePart(error),
		});
		chatContributions.turnEnd({
			session: request.session,
			channel: request.turnChannel,
			turnId: request.turnId,
			reason: { kind: 'rejected', error },
			clientContext: request.clientContext,
		});
		return undefined;
	}

	telemetryReporter.userMessageSent(agent.id, request.clientId, request.clientContext, request.chat, request.turnId, state, request.source, request.message);
	const { model, modelTelemetryKind, modelSelectionKind, permissionLevel, interactionMode } = getTurnTelemetryContext(agent, request.chat, createAgentChatContext(stateManager, request.session, request.chat), state, request.message.model?.id);
	turnTracker.turnStarted(agent, request.chat, request.turnId, model, modelTelemetryKind, modelSelectionKind, permissionLevel, interactionMode, request.clientContext, request.clientId, undefined, undefined, getMessageOriginTelemetryKind(request.message));
	return { agent };
}
