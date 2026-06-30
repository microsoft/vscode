/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentSession } from '../common/agentService.js';
import type { MessageAttachment } from '../common/state/protocol/state.js';
import { isAhpChatChannel, isSubagentSession, parseRequiredSessionUriFromChatUri, type ISessionWithDefaultChat } from '../common/state/sessionState.js';

export type AgentHostUserMessageSentSource = 'direct' | 'queued';

export interface IAgentHostUserMessageSentEvent {
	provider: string;
	agentSessionId: string;
	source: AgentHostUserMessageSentSource;
	isSubagentSession: boolean;
	turnCount: number;
	activeClientId?: string;
	activeClientToolCount?: number;
	activeClientCustomizationCount?: number;
	attachmentCount: number;
}

export type IAgentHostUserMessageSentClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user message was sent directly or from the queued-message flow.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the message was sent to a subagent session.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of completed turns in the session when the message was sent.' };
	activeClientId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the first active client for the session, if any.' };
	activeClientToolCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of tools provided by the active clients, if any.' };
	activeClientCustomizationCount?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of customizations provided by the active clients, if any.' };
	attachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of attachments included with the user message.' };
	owner: 'roblourens';
	comment: 'Tracks user messages sent from the agent host process to an agent provider.';
};

export type AgentHostTurnResult = 'success' | 'error' | 'cancelled';

export interface IAgentHostTurnCompletedEvent {
	provider: string;
	agentSessionId: string;
	timeToFirstProgress: number | undefined;
	totalTime: number;
	result: AgentHostTurnResult;
	model: string | undefined;
	permissionLevel: string | undefined;
}

export type IAgentHostTurnCompletedClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from turn start to the first visible progress (text delta, response part, tool call start, or reasoning).' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from turn start to turn completion.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the turn completed successfully, with an error, or was cancelled.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model identifier selected for the session at turn start (e.g. gemini-3.5-flash).' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool auto-approval level configured for the session at turn start (e.g. default, autoApprove, autopilot).' };
	owner: 'roblourens';
	comment: 'Tracks agent host turn performance including time to first visible progress and total turn duration.';
};

export interface IAgentHostTurnCompletedReport {
	provider: string;
	session: string;
	timeToFirstProgress: number | undefined;
	totalTime: number;
	result: AgentHostTurnResult;
	model: string | undefined;
	permissionLevel: string | undefined;
}

export class AgentHostTelemetryReporter {

	constructor(private readonly _telemetryService: ITelemetryService) { }

	userMessageSent(provider: string, session: string, sessionState: ISessionWithDefaultChat | undefined, source: AgentHostUserMessageSentSource, attachments: readonly MessageAttachment[] | undefined): void {
		const attachmentCount = attachments?.length ?? 0;
		const activeClients = sessionState?.activeClients ?? [];
		const sessionUri = isAhpChatChannel(session) ? parseRequiredSessionUriFromChatUri(session) : session;
		this._telemetryService.publicLog2<IAgentHostUserMessageSentEvent, IAgentHostUserMessageSentClassification>('agentHost.userMessageSent', {
			provider,
			agentSessionId: AgentSession.id(sessionUri),
			source,
			isSubagentSession: isSubagentSession(sessionUri),
			turnCount: sessionState?.turns.length ?? 0,
			...(activeClients.length > 0 ? {
				activeClientId: activeClients[0].clientId,
				activeClientToolCount: activeClients.reduce((sum, client) => sum + client.tools.length, 0),
				activeClientCustomizationCount: activeClients.reduce((sum, client) => sum + (client.customizations?.length ?? 0), 0),
			} : {}),
			attachmentCount,
		});
	}

	turnCompleted(report: IAgentHostTurnCompletedReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<IAgentHostTurnCompletedEvent, IAgentHostTurnCompletedClassification>('agentHost.turnCompleted', {
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			timeToFirstProgress: report.timeToFirstProgress,
			totalTime: report.totalTime,
			result: report.result,
			model: report.model,
			permissionLevel: report.permissionLevel,
		});
	}
}
