/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInvokedClassification, LanguageModelToolInvokedEvent } from '../../telemetry/common/languageModelToolTelemetry.js';
import type { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../telemetry/common/telemetryUtils.js';
import { hash } from '../../../base/common/hash.js';
import { AgentSession } from '../common/agentService.js';
import type { ErrorInfo, MessageAttachment, SessionInputRequestKind, ToolDefinition } from '../common/state/protocol/state.js';
import { isAhpChatChannel, isSubagentChatUri, isSubagentSession, parseRequiredSessionUriFromChatUri, type ISessionWithDefaultChat } from '../common/state/sessionState.js';
import type { ToolInvokedResult } from './agentHostToolCallTracker.js';
import { multiplexProperties, type IAgentHostRestrictedTelemetry, type IAgentHostRestrictedTelemetryContext } from './agentHostRestrictedTelemetry.js';
import type { AgentHostClientType } from '../common/agentHostClientInfo.js';

export type AgentHostUserMessageSentSource = 'direct' | 'queued';

export interface IAgentHostUserMessageSentEvent {
	provider: string;
	initiatorClientType: AgentHostClientType;
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
	initiatorClientType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of AHP client that initiated the user message.' };
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
export type AgentHostModelTelemetryKind = 'trusted' | 'byok' | 'unknown';
type AgentHostModelSelectionKind = 'default' | 'auto' | 'explicit';
export type AgentHostTurnFailureStage = 'validation' | 'workingDirectory' | 'modelSelection' | 'sendMessage' | 'provider';

export interface IAgentHostTurnCompletedEvent {
	provider: string;
	agentSessionId: string;
	turnId: string;
	timeToFirstProgress: number | undefined;
	totalTime: number;
	result: AgentHostTurnResult;
	model: string | TelemetryTrustedValue<string> | undefined;
	modelSelectionKind: AgentHostModelSelectionKind;
	permissionLevel: string | undefined;
	errorType: string | undefined;
	failureStage: AgentHostTurnFailureStage | undefined;
}

export type IAgentHostTurnCompletedClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the turn within the agent host session.' };
	timeToFirstProgress: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from turn start to the first visible progress (text delta, response part, tool call start, or reasoning).' };
	totalTime: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from turn start to turn completion.' };
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the turn completed successfully, with an error, or was cancelled.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The trusted provider model identifier selected at turn start, or a generic value for BYOK and unknown models.' };
	modelSelectionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the client used the provider default, Auto, or an explicit model.' };
	permissionLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool auto-approval level configured for the session at turn start (e.g. default, autoApprove, autopilot).' };
	errorType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The structured agent host or provider error type when the turn fails.' };
	failureStage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded stage at which the agent host turn failed.' };
	owner: 'roblourens';
	comment: 'Tracks agent host turn performance including time to first visible progress and total turn duration.';
};

export interface IAgentHostTurnFailedEvent {
	provider: string;
	agentSessionId: string;
	turnId: string;
	failureStage: AgentHostTurnFailureStage;
	errorType: string;
	errorName: string | undefined;
	errorCode: string | undefined;
	msg: string;
	callstack: string | undefined;
}

export type IAgentHostTurnFailedClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the failed agent host turn.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	turnId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the failed turn within the agent host session.' };
	failureStage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded stage at which the agent host turn failed.' };
	errorType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The structured agent host or provider error type.' };
	errorName: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The name of the exception, when available.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The exception or protocol error code, when available.' };
	msg: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error message. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error stack. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	owner: 'roblourens';
	comment: 'Captures diagnostic details for failed agent host turns.';
};

export interface IAgentHostTurnFailure {
	stage: AgentHostTurnFailureStage;
	error: ErrorInfo;
	errorName?: string;
	errorCode?: string;
	errorStack?: string;
}

export interface IAgentHostTurnCompletedReport {
	provider: string;
	session: string;
	turnId: string;
	timeToFirstProgress: number | undefined;
	totalTime: number;
	result: AgentHostTurnResult;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	permissionLevel: string | undefined;
	failure: IAgentHostTurnFailure | undefined;
}

export interface IAgentHostToolInvokedReport {
	provider: string;
	session: string;
	toolId: string;
	toolSourceKind: string;
	result: ToolInvokedResult;
	invocationTimeMs: number;
}

type AgentHostToolCallResponseType = 'success' | 'cancelled' | 'failed';

export interface IAgentHostToolCallDetailsEvent {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	conversationId: string;
	requestId: string;
	responseType: AgentHostToolCallResponseType;
	toolCounts: string;
	model: string | undefined;
	numRequests: number;
	turnIndex: number;
	turnDuration: number;
	messageCharLen: number | undefined;
	availableToolCount: number;
	totalToolCalls: number;
	parallelToolCallRounds: number;
	parallelToolCallsTotal: number;
}

export type IAgentHostToolCallDetailsClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool-call aggregate belongs to a subagent session.' };
	conversationId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the current chat conversation.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the current turn request.' };
	responseType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the turn completed successfully, was cancelled, or failed.' };
	toolCounts: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of times each tool was requested during the turn.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model used for the final model call in the turn, when known.' };
	numRequests: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of model-call rounds in the turn.' };
	turnIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The zero-based turn ordinal within the agent host session.' };
	turnDuration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The elapsed time in milliseconds for the turn.' };
	messageCharLen: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of characters in the user message, when known.' };
	availableToolCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of tools offered to the model.' };
	totalToolCalls: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The total number of tool calls requested during the turn.' };
	parallelToolCallRounds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of model-call rounds containing multiple tool calls.' };
	parallelToolCallsTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of tool calls belonging to parallel tool-call rounds.' };
	owner: 'roblourens';
	comment: 'Records aggregate information about tool calls during an agent host turn.';
};

export interface IAgentHostToolCallDetailsReport {
	provider: string;
	session: string;
	turnId: string;
	clientType: AgentHostClientType;
	model: string | undefined;
	responseType: AgentHostToolCallResponseType;
	/** Count of invocations keyed by tool name, across all rounds in the turn. */
	toolCounts: Record<string, number>;
	/** Names of the tools offered to the model for this turn. */
	availableTools: readonly string[];
	/** Number of model-call rounds in the turn, including the final tool-free response round (matches the extension's `toolCallRounds.length`). */
	numRequests: number;
	turnIndex: number;
	turnDuration: number;
	messageCharLen: number | undefined;
	totalToolCalls: number;
	parallelToolCallRounds: number;
	parallelToolCallsTotal: number;
}

export interface IAgentHostToolApprovalReport {
	provider: string;
	session: string;
	turnId: string;
	toolId: string;
	toolSourceKind: string;
	confirmKind: AgentHostToolApprovalConfirmKind;
	confirmationNotNeededReason: string | undefined;
	requestUnsandboxedExecution: boolean | undefined;
}

type AgentHostToolApprovalConfirmKind = 'userAction' | 'setting' | 'confirmationNotNeeded' | 'denied';

export interface IAgentHostToolApprovalEvent {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	chatSessionId: string;
	requestId: string;
	toolId: string;
	toolExtensionId: string | undefined;
	toolSourceKind: string;
	confirmKind: AgentHostToolApprovalConfirmKind;
	settingId: string | undefined;
	lmServiceScope: string | undefined;
	customButtonKind: string | undefined;
	confirmationNotNeededReason: string | undefined;
	sandboxWrapped: boolean | undefined;
	requestUnsandboxedExecution: boolean | undefined;
}

export type IAgentHostToolApprovalClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool approval belongs to a subagent session.' };
	chatSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat session that the tool was used within, if applicable.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the chat request turn that this tool approval is associated with, if available.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the tool used.' };
	toolExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that contributed the tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source kind of the tool.' };
	confirmKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the confirmation was resolved (userAction, setting, confirmationNotNeeded, denied).' };
	settingId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is setting, the configuration id that auto-approved the tool.' };
	lmServiceScope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is lmServicePerTool, the scope (session/workspace/profile).' };
	customButtonKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the user clicked a custom button on the confirmation widget, whether the button represents approve or deny semantics.' };
	confirmationNotNeededReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When confirmKind is confirmationNotNeeded, a stable identifier for why the tool did not require confirmation.' };
	sandboxWrapped: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For terminal tool calls, whether this specific invocation runs inside the agent terminal sandbox.' };
	requestUnsandboxedExecution: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For terminal tool calls, whether the model requested to bypass the sandbox for this invocation.' };
	owner: 'roblourens';
	comment: 'Provides insight into how tool confirmations are resolved (user action vs. auto-approval) in agent host sessions.';
};

export interface IAgentHostAutoModeRouterDecisionReport {
	session: string;
	turnId: string;
	clientType: AgentHostClientType;
	chosenModel: string;
	predictedLabel: string | undefined;
	confidence: number | undefined;
	candidateModels: readonly string[] | undefined;
	categoryScores: Readonly<Record<string, number | undefined>> | undefined;
}

export interface IAgentHostSkillContentReadReport {
	clientType: AgentHostClientType;
	/** The skill name. */
	name: string;
	/** Path to the SKILL.md file. */
	path: string;
	/** Full skill content; hashed (never sent raw), matching the extension. */
	content: string;
	/** Where the skill was discovered (project, personal-copilot, plugin, builtin, …). */
	source: string | undefined;
	/** Name of the plugin the skill came from, when applicable (AH-native analog of the extension's skill extension id). */
	pluginName: string | undefined;
	/** Version of the plugin the skill came from, when applicable. */
	pluginVersion: string | undefined;
}

export type AgentHostRepoInfoResult = 'success' | 'filesChanged' | 'diffTooLarge' | 'noChanges' | 'tooManyChanges' | 'mergeBaseTooOld' | 'virtualFileSystem' | 'tooManyCommits';

export interface IAgentHostRepoInfoReport {
	telemetryMessageId: string;
	clientType: AgentHostClientType;
	location: 'begin' | 'end';
	remoteUrl: string;
	repoId: string;
	repoType: 'github' | 'ado';
	headCommitHash: string;
	headBranchName: string | undefined;
	fileRelativePaths: string | undefined;
	diffsJSON: string | undefined;
	result: AgentHostRepoInfoResult;
	isActiveRepository: 'true';
	workspaceFileCount: number;
	changedFileCount: number;
	diffSizeBytes: number;
}

export interface IAgentHostToolCallStalledEvent {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolId: string;
	toolSourceKind: string;
	stalledTimeMs: number;
}

export type IAgentHostToolCallStalledClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the stalled agent host tool call.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the stalled tool call belongs to a subagent session.' };
	blockerKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the tool call is waiting for confirmation or client execution.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the stalled tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the stalled tool is provided by the agent host, an MCP server, or a client.' };
	stalledTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds that the tool call has remained blocked.' };
	owner: 'roblourens';
	comment: 'Tracks agent host tool calls that remain blocked beyond the stall threshold.';
};

export interface IAgentHostToolCallStalledReport {
	provider: string;
	session: string;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolId: string;
	toolSourceKind: string;
	stalledTimeMs: number;
}

export interface IAgentHostStalledToolCallCompletedEvent {
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolId: string;
	toolSourceKind: string;
	result: ToolInvokedResult;
	totalTimeMs: number;
	timeAfterStallMs: number;
}

export type IAgentHostStalledToolCallCompletedClassification = {
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The provider handling the completed agent host tool call.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the completed tool call belongs to a subagent session.' };
	blockerKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the tool call had stalled waiting for confirmation or client execution.' };
	toolId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the completed tool.' };
	toolSourceKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the completed tool is provided by the agent host, an MCP server, or a client.' };
	result: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the stalled tool call eventually completed successfully, with an error, or through user cancellation.' };
	totalTimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total time in milliseconds from tool call start to completion.' };
	timeAfterStallMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from the stall report to tool call completion.' };
	owner: 'roblourens';
	comment: 'Tracks agent host tool calls that complete after previously exceeding the stall threshold.';
};

export interface IAgentHostStalledToolCallCompletedReport {
	provider: string;
	session: string;
	blockerKind: SessionInputRequestKind.ToolConfirmation | SessionInputRequestKind.ToolClientExecution | SessionInputRequestKind.ToolAuthentication;
	toolId: string;
	toolSourceKind: string;
	result: ToolInvokedResult;
	totalTimeMs: number;
	timeAfterStallMs: number;
}

export class AgentHostTelemetryReporter {

	constructor(private readonly _telemetryService: ITelemetryService) { }

	/** The restricted GH/MSFT telemetry surface, present when the agent-host telemetry service is wired. */
	private get _restricted(): IAgentHostRestrictedTelemetry | undefined {
		const ts = this._telemetryService as Partial<IAgentHostRestrictedTelemetry>;
		return typeof ts.sendEnhancedGHTelemetryEvent === 'function' ? ts as IAgentHostRestrictedTelemetry : undefined;
	}

	userMessageSent(provider: string, clientType: AgentHostClientType, session: string, sessionState: ISessionWithDefaultChat | undefined, source: AgentHostUserMessageSentSource, attachments: readonly MessageAttachment[] | undefined): void {
		const attachmentCount = attachments?.length ?? 0;
		const activeClients = sessionState?.activeClients ?? [];
		const sessionUri = isAhpChatChannel(session) ? parseRequiredSessionUriFromChatUri(session) : session;
		this._telemetryService.publicLog2<IAgentHostUserMessageSentEvent, IAgentHostUserMessageSentClassification>('agentHost.userMessageSent', {
			provider,
			initiatorClientType: clientType,
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
	 * `headerRequestId` is the client-minted `x-request-id`, matching the extension. `messagesJson`
	 * is the raw tool definitions offered for the call, multiplexed across ~8192-char chunks like
	 * the extension, so it lands identically downstream.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param clientRequestId The model call's client-minted `x-request-id`, mapped to the extension's `headerRequestId`. No-ops when absent (e.g. providers that don't surface it).
	 * @param tools The tool definitions offered to the model for this call.
	 */
	async assistantMessageReceived(session: string, clientType: AgentHostClientType, clientRequestId: string | undefined, tools: readonly ToolDefinition[]): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || !clientRequestId || tools.length === 0) {
			return;
		}
		restricted.sendEnhancedGHTelemetryEvent('request.options.tools', await multiplexProperties({
			headerRequestId: clientRequestId,
			conversationId: AgentSession.id(session),
			initiatorClientType: clientType,
			messagesJson: JSON.stringify(tools),
		}));
	}

	/**
	 * Mirrors the Copilot extension's restricted `conversation.messageText` event (the panel-chat
	 * prefix of `sendConversationalMessageTelemetry`) for the user's prompt. The extension emits it
	 * for every user and model message, carrying the raw message text to the enhanced GH
	 * (`copilot_v0_restricted_copilot_event`) and internal MSFT pipelines; the agent host observes
	 * the same boundary at the SDK `user.message` event. The text is multiplexed across ~8192-char
	 * chunks (`messageText`, `messageText_02`, …) so long prompts land untruncated, matching the
	 * extension's `multiplexProperties`.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param content The user's prompt text. No-ops when empty.
	 * @param turnIndex The 0-based ordinal of the turn this message belongs to, matching the extension's numeric `turnIndex` (`conversation.turns.length`). CTS parses `turn_index` as an integer, so a numeric ordinal is required here (a non-numeric id lands empty).
	 */
	async userMessageText(session: string, clientType: AgentHostClientType, content: string, turnIndex: number): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || !content) {
			return;
		}
		const properties = await multiplexProperties({
			source: 'user',
			conversationId: AgentSession.id(session),
			initiatorClientType: clientType,
			turnIndex: String(turnIndex),
			messageText: content,
		});
		const measurements = { messageCharLen: content.length };
		restricted.sendEnhancedGHTelemetryEvent('conversation.messageText', properties, measurements);
		restricted.sendInternalMSFTTelemetryEvent('conversation.messageText', properties, measurements);
	}

	/**
	 * The model-message counterpart to {@link userMessageText}. Emitted when an `assistant.message`
	 * arrives (the agent host's per-model-call boundary), carrying the assistant's response text.
	 * `headerRequestId` is filled with the model call's client-minted `x-request-id`, matching the
	 * extension. VS Code-only enrichment dims (code-block languages/counts) are not reconstructed here.
	 *
	 * @param session Session URI string; its id becomes `conversationId`.
	 * @param content The assistant's response text. No-ops when empty.
	 * @param turnIndex The 0-based ordinal of the turn this message belongs to, matching the extension's numeric `turnIndex` (`conversation.turns.length`). CTS parses `turn_index` as an integer, so a numeric ordinal is required here.
	 * @param clientRequestId The model call's client-minted `x-request-id`, mapped to `headerRequestId`.
	 */
	async modelMessageText(session: string, clientType: AgentHostClientType, content: string, turnIndex: number, clientRequestId: string | undefined): Promise<void> {
		const restricted = this._restricted;
		if (!restricted || !content) {
			return;
		}
		const properties = await multiplexProperties({
			source: 'model',
			conversationId: AgentSession.id(session),
			initiatorClientType: clientType,
			turnIndex: String(turnIndex),
			...(clientRequestId ? { headerRequestId: clientRequestId } : {}),
			messageText: content,
		});
		const measurements = { messageCharLen: content.length };
		restricted.sendEnhancedGHTelemetryEvent('conversation.messageText', properties, measurements);
		restricted.sendInternalMSFTTelemetryEvent('conversation.messageText', properties, measurements);
	}

	/**
	 * Emits the local-compatible tool-call aggregate on standard and restricted telemetry channels.
	 */
	async toolCallDetails(report: IAgentHostToolCallDetailsReport): Promise<void> {
		if (report.availableTools.length === 0) {
			return;
		}
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		const conversationId = AgentSession.id(session);
		const toolCounts = JSON.stringify(report.toolCounts);
		this._telemetryService.publicLog2<IAgentHostToolCallDetailsEvent, IAgentHostToolCallDetailsClassification>('toolCallDetails', {
			provider: report.provider,
			agentSessionId: conversationId,
			isSubagentSession: isSubagentSession(session),
			conversationId,
			requestId: report.turnId,
			responseType: report.responseType,
			toolCounts,
			model: report.model,
			numRequests: report.numRequests,
			turnIndex: report.turnIndex,
			turnDuration: report.turnDuration,
			messageCharLen: report.messageCharLen,
			availableToolCount: report.availableTools.length,
			totalToolCalls: report.totalToolCalls,
			parallelToolCallRounds: report.parallelToolCallRounds,
			parallelToolCallsTotal: report.parallelToolCallsTotal,
		});

		const restricted = this._restricted;
		if (!restricted) {
			return;
		}
		const properties = await multiplexProperties({
			conversationId,
			requestId: report.turnId,
			messageId: report.turnId,
			initiatorClientType: report.clientType,
			responseType: report.responseType,
			...(report.model ? { model: report.model } : {}),
			toolCounts,
			availableTools: JSON.stringify(report.availableTools),
		});
		const measurements = {
			numRequests: report.numRequests,
			turnIndex: report.turnIndex,
			turnDuration: report.turnDuration,
			...(report.messageCharLen !== undefined ? { messageCharLen: report.messageCharLen } : {}),
			availableToolCount: report.availableTools.length,
			totalToolCalls: report.totalToolCalls,
			parallelToolCallRounds: report.parallelToolCallRounds,
			parallelToolCallsTotal: report.parallelToolCallsTotal,
		};
		restricted.sendEnhancedGHTelemetryEvent('toolCallDetailsExternal', properties, measurements);
		restricted.sendInternalMSFTTelemetryEvent('toolCallDetailsInternal', properties, measurements);
	}

	/** Emits the workbench-compatible tool-approval telemetry from the agent host on the standard telemetry channel. */
	toolApproval(report: IAgentHostToolApprovalReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		const agentSessionId = AgentSession.id(session);
		this._telemetryService.publicLog2<IAgentHostToolApprovalEvent, IAgentHostToolApprovalClassification>('chat.toolApproval', {
			provider: report.provider,
			agentSessionId,
			isSubagentSession: isSubagentSession(session),
			chatSessionId: agentSessionId,
			requestId: report.turnId,
			toolId: report.toolId,
			toolExtensionId: undefined,
			toolSourceKind: report.toolSourceKind,
			confirmKind: report.confirmKind,
			settingId: undefined,
			lmServiceScope: undefined,
			customButtonKind: undefined,
			confirmationNotNeededReason: report.confirmationNotNeededReason,
			sandboxWrapped: undefined,
			requestUnsandboxedExecution: report.requestUnsandboxedExecution,
		});
	}

	/**
	 * Emits the subset of the extension's restricted `automode.routerDecisionRestricted` event
	 * available from the SDK's `session.auto_mode_resolved` event. Router-only fields that the SDK
	 * does not expose are omitted rather than synthesized.
	 */
	autoModeRouterDecision(report: IAgentHostAutoModeRouterDecisionReport): void {
		const restricted = this._restricted;
		if (!restricted) {
			return;
		}

		const categoryScores = report.categoryScores ?? {};
		const isBinary = categoryScores.needs_reasoning !== undefined || categoryScores.no_reasoning !== undefined;
		const scoreKeys = Object.keys(categoryScores).filter(key => categoryScores[key] !== undefined);
		const candidateModels = report.candidateModels ?? [];
		const properties = {
			conversationId: AgentSession.id(report.session),
			vscodeRequestId: report.turnId,
			initiatorClientType: report.clientType,
			...(report.predictedLabel !== undefined ? { predictedLabel: report.predictedLabel } : {}),
			candidateModel: candidateModels[0] ?? '',
			chosenModel: report.chosenModel,
			candidateModels: JSON.stringify(candidateModels),
			...(scoreKeys.length > 0 ? {
				[isBinary ? 'binaryScores' : 'hydraScores']: JSON.stringify(categoryScores),
			} : {}),
		};
		const measurements = {
			...(report.confidence !== undefined ? { confidence: report.confidence } : {}),
			...(categoryScores.needs_reasoning !== undefined ? { scoreNeedsReasoning: categoryScores.needs_reasoning } : {}),
			...(categoryScores.no_reasoning !== undefined ? { scoreNoReasoning: categoryScores.no_reasoning } : {}),
		};
		restricted.sendEnhancedGHTelemetryEvent('automode.routerDecisionRestricted', properties, measurements);
	}

	/**
	 * Mirrors the Copilot extension's restricted `skillContentRead` event (`skillTelemetry.ts` ->
	 * `sendSkillContentReadTelemetry`) — records which skill file was loaded into the conversation.
	 * The extension emits it from the skill/readFile tools; the agent host observes the equivalent
	 * boundary at the SDK `skill.invoked` event, whose payload already carries the content (hashed
	 * here, never sent raw), the discovery `source`, and the plugin identity. The extension's
	 * `skillExtensionId` / `skillExtensionVersion` encode the contributing *VS Code extension*, which
	 * does not exist in the agent host; the AH-native provenance is the plugin, so `pluginName` /
	 * `pluginVersion` fill those columns. No-ops when the skill name is empty.
	 *
	 * @param report The invoked skill's metadata (from the SDK `skill.invoked` payload).
	 */
	skillContentRead(report: IAgentHostSkillContentReadReport): void {
		const restricted = this._restricted;
		if (!restricted || !report.name) {
			return;
		}
		const contentHash = report.content ? String(hash(report.content)) : '';
		const skillStorage = report.source ?? '';
		// Match the extension: the version is only reported when the (plugin) id is known, so we
		// never emit a `skillExtensionVersion` without a corresponding `skillExtensionId`.
		const skillExtensionVersion = report.pluginName ? (report.pluginVersion ?? '') : '';
		const plaintextProps = {
			initiatorClientType: report.clientType,
			skillName: report.name,
			skillPath: report.path,
			skillExtensionId: report.pluginName ?? '',
			skillExtensionVersion,
			skillStorage,
			skillContentHash: contentHash,
		};
		restricted.sendGHTelemetryEvent('skillContentRead', {
			initiatorClientType: report.clientType,
			skillNameHash: String(hash(report.name)),
			skillExtensionIdHash: report.pluginName ? String(hash(report.pluginName)) : '',
			skillExtensionVersion,
			skillStorage,
			skillContentHash: contentHash,
		});
		restricted.sendEnhancedGHTelemetryEvent('skillContentRead', plaintextProps);
		restricted.sendInternalMSFTTelemetryEvent('skillContentRead', plaintextProps);
	}

	async reportRepoInfo(context: IAgentHostRestrictedTelemetryContext, report: IAgentHostRepoInfoReport): Promise<void> {
		const restricted = this._restricted;
		if (!restricted) {
			return;
		}
		const properties = {
			initiatorClientType: report.clientType,
			remoteUrl: report.remoteUrl,
			repoId: report.repoId,
			repoType: report.repoType,
			headCommitHash: report.headCommitHash,
			headBranchName: report.headBranchName,
			fileRelativePaths: report.fileRelativePaths,
			diffsJSON: report.diffsJSON,
			result: report.result,
			isActiveRepository: report.isActiveRepository,
			location: report.location,
			telemetryMessageId: report.telemetryMessageId,
		};
		const measurements = {
			workspaceFileCount: report.workspaceFileCount,
			changedFileCount: report.changedFileCount,
			diffSizeBytes: report.diffSizeBytes,
			repoIndex: 0,
			repoCount: 1,
		};
		const { headBranchName: _, fileRelativePaths: _2, ...internalProperties } = properties;
		const [enhancedProperties, internalMultiplexedProperties] = await Promise.all([
			multiplexProperties(properties),
			multiplexProperties(internalProperties),
		]);
		restricted.sendEnhancedGHTelemetryEventForContext(context, 'request.repoInfo', enhancedProperties, measurements);
		restricted.sendInternalMSFTTelemetryEventForContext(context, 'request.repoInfo', internalMultiplexedProperties, measurements);
	}

	turnCompleted(report: IAgentHostTurnCompletedReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		const model = report.model === undefined
			? undefined
			: report.modelTelemetryKind === 'trusted'
				? new TelemetryTrustedValue(report.model)
				: report.modelTelemetryKind === 'byok' ? 'byokModel' : 'unknown';
		this._telemetryService.publicLog2<IAgentHostTurnCompletedEvent, IAgentHostTurnCompletedClassification>('agentHost.turnCompleted', {
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			turnId: report.turnId,
			timeToFirstProgress: report.timeToFirstProgress,
			totalTime: report.totalTime,
			result: report.result,
			model,
			modelSelectionKind: report.model === undefined ? 'default' : report.model === 'auto' ? 'auto' : 'explicit',
			permissionLevel: report.permissionLevel,
			errorType: report.failure?.error.errorType,
			failureStage: report.failure?.stage,
		});
		if (report.failure) {
			this._telemetryService.publicLogError2<IAgentHostTurnFailedEvent, IAgentHostTurnFailedClassification>('agentHost.turnFailed', {
				provider: report.provider,
				agentSessionId: AgentSession.id(session),
				turnId: report.turnId,
				failureStage: report.failure.stage,
				errorType: report.failure.error.errorType,
				errorName: report.failure.errorName,
				errorCode: report.failure.errorCode,
				msg: report.failure.error.message,
				callstack: report.failure.errorStack ?? report.failure.error.stack,
			});
		}
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

	toolCallStalled(report: IAgentHostToolCallStalledReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<IAgentHostToolCallStalledEvent, IAgentHostToolCallStalledClassification>('agentHost.toolCallStalled', {
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagentChatUri(report.session) || isSubagentSession(session),
			blockerKind: report.blockerKind,
			toolId: report.toolId,
			toolSourceKind: report.toolSourceKind,
			stalledTimeMs: report.stalledTimeMs,
		});
	}

	stalledToolCallCompleted(report: IAgentHostStalledToolCallCompletedReport): void {
		const session = isAhpChatChannel(report.session) ? parseRequiredSessionUriFromChatUri(report.session) : report.session;
		this._telemetryService.publicLog2<IAgentHostStalledToolCallCompletedEvent, IAgentHostStalledToolCallCompletedClassification>('agentHost.stalledToolCallCompleted', {
			provider: report.provider,
			agentSessionId: AgentSession.id(session),
			isSubagentSession: isSubagentChatUri(report.session) || isSubagentSession(session),
			blockerKind: report.blockerKind,
			toolId: report.toolId,
			toolSourceKind: report.toolSourceKind,
			result: report.result,
			totalTimeMs: report.totalTimeMs,
			timeAfterStallMs: report.timeAfterStallMs,
		});
	}
}
