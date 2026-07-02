/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInvokedClassification, LanguageModelToolInvokedEvent } from '../../telemetry/common/languageModelToolTelemetry.js';
import type { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentSession } from '../common/agentService.js';
import type { MessageAttachment, ToolDefinition } from '../common/state/protocol/state.js';
import { isAhpChatChannel, isSubagentSession, parseRequiredSessionUriFromChatUri, type ISessionWithDefaultChat } from '../common/state/sessionState.js';
import type { ToolInvokedResult } from './agentHostToolCallTracker.js';
import { multiplexProperties, type IAgentHostRestrictedTelemetry } from './agentHostRestrictedTelemetry.js';

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

export interface IAgentHostToolInvokedReport {
	provider: string;
	session: string;
	toolId: string;
	toolSourceKind: string;
	result: ToolInvokedResult;
	invocationTimeMs: number;
}

export class AgentHostTelemetryReporter {

	constructor(private readonly _telemetryService: ITelemetryService) { }

	/** The restricted GH/MSFT telemetry surface, present when the agent-host telemetry service is wired. */
	private get _restricted(): IAgentHostRestrictedTelemetry | undefined {
		const ts = this._telemetryService as Partial<IAgentHostRestrictedTelemetry>;
		return typeof ts.sendEnhancedGHTelemetryEvent === 'function' ? ts as IAgentHostRestrictedTelemetry : undefined;
	}

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

	/**
	 * Mirrors the Copilot extension's enhanced GH `request.options.tools` event for the agent-host
	 * flow. The extension emits it per LLM request from its model fetcher; the agent host observes
	 * the equivalent boundary when an `assistant.message` arrives (one per model call). The
	 * extension populates `headerRequestId` with the client-minted `x-request-id`, which the SDK
	 * does not surface on success; we keep the same field name (so science queries are undisturbed)
	 * but fill it with the model call's `x-copilot-service-request-id`, the per-call id the SDK does
	 * expose. `messagesJson` is the raw tool definitions offered for the call, multiplexed across
	 * ~8192-char chunks like the extension, so it lands identically downstream.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param serviceRequestId The model call's `x-copilot-service-request-id`, mapped to the extension's `headerRequestId`. No-ops when absent (e.g. providers that don't surface it).
	 * @param tools The tool definitions offered to the model for this call.
	 */
	assistantMessageReceived(session: string, serviceRequestId: string | undefined, tools: readonly ToolDefinition[]): void {
		const restricted = this._restricted;
		if (!restricted || !serviceRequestId || tools.length === 0) {
			return;
		}
		restricted.sendEnhancedGHTelemetryEvent('request.options.tools', multiplexProperties({
			headerRequestId: serviceRequestId,
			conversationId: AgentSession.id(session),
			messagesJson: JSON.stringify(tools),
		}));
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

	toolInvoked(report: IAgentHostToolInvokedReport): void {
		// `chatSessionId` is the full session URI string (matching the value
		// previously emitted by `CopilotAgentSession`). Action signals are keyed
		// by their chat-channel URI, so normalize it back to the session URI.
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<LanguageModelToolInvokedEvent, LanguageModelToolInvokedClassification>('languageModelToolInvoked', {
			result: report.result,
			chatSessionId: session,
			toolId: report.toolId,
			toolExtensionId: undefined,
			toolSourceKind: report.toolSourceKind,
			invocationTimeMs: report.invocationTimeMs,
			provider: report.provider,
		});
	}
}
